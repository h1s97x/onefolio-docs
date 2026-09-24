# 升级与回滚

## 1. 升级前检查清单

- [ ] 确认新版本交付包已校验 `SHA256SUMS`
- [ ] 确认当前版本号（`docker compose ps` 或 `.env` 的 `ONEFOLIO_IMAGE` tag）
- [ ] **已备份数据库**（见[备份与恢复](./backup)）
- [ ] 已备份 `/data` 卷
- [ ] 已阅读新版本的数据库变更说明（是否需要执行 `migrations/*.sql`）
- [ ] 已通知使用者（升级期间应用不可用）

::: danger 数据库结构变更是单向的
降级镜像**不会**回滚数据库结构。如果新版本包含破坏性迁移（删表、删列），回滚前必须先恢复数据库备份。
:::

## 2. 升级

交付包自带的脚本会依次：备份数据卷 → 导入新镜像 → 更新 `.env` 中的镜像 tag → 重启服务。

```bash
# 指定版本（需已解包到当前目录）
bash scripts/upgrade.sh v1.2.4

# 或不带参数：读取当前目录下的新版本交付包
bash scripts/upgrade.sh
```

镜像仓库场景（可跳过 `load-image.sh`）：

```bash
sed -i 's#^ONEFOLIO_IMAGE=.*#ONEFOLIO_IMAGE=<仓库>/onefolio:v1.2.4#' .env
docker compose up -d
```

### 数据库结构变更

**先备份，再按序号执行**迁移脚本（脚本在宿主机上，通过标准输入喂给容器内 psql）：

```bash
docker compose stop app

for f in migrations/*.sql; do
  echo "==> $f"
  docker compose exec -T db psql -U postgres -d onefolio -v ON_ERROR_STOP=1 < "$f"
done

docker compose start app
```

::: warning 逐条确认，不要一把梭
`migrations/*.sql` 是按发布时间排序的增量脚本，其中部分不可逆（如删除在线服务相关表与列）。正式执行前请逐条阅读脚本头部注释，并确认它是否已在目标库执行过（多数脚本是幂等的，但删表删列不是）。
:::

## 3. 验证

```bash
# 容器状态与健康
docker compose ps

# 探活
curl -I http://<host>:8000/api/system/status -X HEAD

# 应用日志（看有没有启动期报错）
docker compose logs --tail=100 app
```

再登录界面做一次「生成一份报告」的端到端验证；若使用批量生成，确认批次能正常推进。

## 4. 回滚

```bash
# 1) 改回旧版本 tag
sed -i 's/^ONEFOLIO_IMAGE=.*/ONEFOLIO_IMAGE=onefolio:v1.2.3/' .env

# 2) 切回
docker compose up -d
```

- 若新版本**未**改动数据库结构：上面两步即可。
- 若新版本**已**执行结构变更：请先按[备份与恢复](./backup)恢复数据库，再切回旧镜像（顺序不能反）。

## 5. 升级 PostgREST / PostgreSQL 基础镜像

这两个组件不随应用镜像更新，需要单独升级：

```bash
# 1) 修改 docker-compose.yml 中的镜像 tag
# 2) 拉取新镜像（隔离环境需先 docker load）
docker compose pull db rest gateway
# 3) 重启（数据库有版本升级时，请先按官方说明做大版本升级）
docker compose up -d
```

::: danger PostgreSQL 大版本升级
`postgres:16-alpine` 升到更高主版本不能用 `docker compose up` 直接完成，需要 `pg_upgrade` 或逻辑导出导入。升级前必须做完整备份并演练。
:::
