# 交付形态与部署步骤

## 1. 交付形态

| 场景               | 获取方式                                | 说明                                                       |
| ------------------ | --------------------------------------- | ---------------------------------------------------------- |
| 客户有内网镜像仓库 | `docker pull <仓库>/onefolio:<version>` | 多架构 manifest，自动匹配 amd64 / arm64                    |
| 完全隔离内网       | `onefolio-delivery-<version>.tar.gz`    | 含两个架构的镜像 tar、编排、初始化 SQL、脚本、`SHA256SUMS` |

**一套镜像适配所有客户**：全仓无 `NEXT_PUBLIC_*`，所有配置均为运行时注入，镜像内不含任何客户密钥。

### 离线包目录结构

解包后即为部署根目录（`docker compose` 直接在此执行）：

```text
.
├── docker-compose.yml
├── docker/
│   ├── initdb/          # 数据库初始化脚本（按文件名排序执行）
│   └── gateway/nginx.conf
├── scripts/             # gen-keys.sh / load-image.sh / deploy.sh / upgrade.sh
├── migrations/          # 增量迁移（升级部署使用）
├── images/              # *-linux-<amd64|arm64>.tar.gz
├── .env.example
├── bundle.env
├── DEPLOY.md
└── SHA256SUMS
```

::: warning 基础镜像默认不在离线包内
`postgres:16-alpine`、`postgrest/postgrest:v13.0.4`、`nginx:1.27-alpine`（以及 `upgrade.sh` 备份用的 `alpine:3`）需要客户侧自行准备：

- 内网有仓库：`docker pull --platform linux/<arch> <镜像>`
- 完全隔离：制包时加 `BUNDLE_BASE_IMAGES=1 bash scripts/deploy/bundle.sh <version> <image>`，把基础镜像一并导出。

拉取/导入时注意 CPU 架构：`x86_64 → linux/amd64`，`aarch64 → linux/arm64`（信创 arm 机器常见）。
:::

## 2. 架构

```text
浏览器 ──> app(Next.js standalone, :5000) ──> gateway(nginx :8080)
                    │                              │  /rest/v1/* → /*
                    │                              ▼
                    │                          rest(PostgREST :3000)
                    │                              │
                    │                              ▼
                    └──> /data(持久卷)          db(PostgreSQL, 仅内网)
```

数据库端口不对外暴露，只有 `app` 的 `5000` 需要开放给使用者。私有化环境通常只有 PostgreSQL，因此用「PostgreSQL + PostgREST + 路径重写网关」替代托管 Supabase，应用代码零改造。

## 3. 部署步骤

```bash
# 0) 校验完整性并解包
sha256sum -c < onefolio-delivery-v1.2.3.sha256
tar xzf onefolio-delivery-v1.2.3.tar.gz && cd ./

# 1) 配置环境变量
cp .env.example .env
bash scripts/gen-keys.sh >> .env     # 生成 PGRST_JWT_SECRET、两把 key、数据库口令
vim .env                             # 填写 AUTH_SECRET / BOOTSTRAP_ADMIN_PASSWORD / AGENT_API_URL 等

# 2) 导入镜像（镜像仓库场景跳过，并把 .env 的 ONEFOLIO_IMAGE 改为仓库地址）
bash scripts/load-image.sh

# 3) 启动（会先校验建表脚本非空，然后拉起全套并等待应用健康）
bash scripts/deploy.sh
```

`deploy.sh` 最多等待 120 秒应用健康，成功后输出访问地址。

## 4. 首次启动做了什么

数据库初始化脚本在 Postgres **首次启动**时按文件名排序各执行一次（`ON_ERROR_STOP=1`，任一文件失败即中断整个初始化）：

| 顺序 | 文件                 | 作用                                                                  |
| ---- | -------------------- | --------------------------------------------------------------------- |
| 1    | `00_roles.sh`        | 创建 `anon` / `authenticated` / `service_role` / `authenticator` 角色 |
| 2    | `01_schema.sql`      | 建表结构                                                              |
| 3    | `02_grants.sql`      | 建表后授权                                                            |
| 4    | `03_rpcs.sql`        | 业务 RPC 函数                                                         |
| 5    | `04_concurrency.sql` | 并发相关约束与索引（幂等）                                            |
| 6    | `04_seed_admin.sh`   | 播种首个超级管理员（口令取自 `BOOTSTRAP_ADMIN_PASSWORD`）             |
| 7    | `05_rls.sql`         | 启用 RLS 并回收 `anon` 全部表权限                                     |
| 8+   | `6x_*.sql`           | 增量回补脚本（命名规范化、索引、外键、清理死字段）                    |

::: danger 三个容易踩的点

1. **文件名前缀就是执行顺序**，且是字符串排序。增量脚本必须用 `6x_` 号段（新增从 `64_` 起）；历史上曾把增量脚本命名成 `007_`，排在 `01_schema.sql` **之前**，首次部署直接中断、库里没有表。
2. **`BOOTSTRAP_ADMIN_PASSWORD` 缺失或不足 12 位，初始化直接失败**（不生成默认口令）。
3. **initdb 只在空数据目录首次启动执行**。脚本报错后重启容器不会重跑，必须 `docker compose down -v` 清卷重来。
   :::

## 5. 登录与验证

首个管理员有两种创建方式（详见[配置参考 · 首次初始化](./configuration#_4-首次初始化-首个管理员怎么来)）：

| 方式                                       | 初始账号 | 初始口令                                       |
| ------------------------------------------ | -------- | ---------------------------------------------- |
| 初始化时播种（默认）                       | `admin`  | `.env` 中的 `BOOTSTRAP_ADMIN_PASSWORD`         |
| 部署后自助创建（`SKIP_BOOTSTRAP_ADMIN=1`） | 自行指定 | 在 `http://<部署主机>:5000/setup` 页面自行设置 |

访问地址：`http://<部署主机>:5000`。

首次登录后请立即在「个人资料 → 修改密码」修改。

命令行探活（无需登录）：

```bash
# HEAD：只判存活
curl -I http://<部署主机>:5000/api/system/status -X HEAD

# 匿名 GET：返回存活摘要 {status, database, agent}
curl http://<部署主机>:5000/api/system/status
```

带登录态的 GET 才会返回详细统计，POST / PUT 一律需要管理员会话。

## 6. 下一步

- [环境变量与系统设置](./configuration)：每一项配置的含义与默认值
- [部署边界与容量](./architecture)：单副本、长驻进程、并发上限怎么算
- [运维总览](./operations)：日常要看什么、怎么排障
