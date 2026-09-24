# API 参考

## 1. 两类文档入口

| 入口                    | 地址                                 | 说明                                     |
| ----------------------- | ------------------------------------ | ---------------------------------------- |
| 交互式（Swagger UI）    | `http://<部署主机>:8000/api-docs`    | 应用内置，**需登录**；可直接试调         |
| 机器可读（OpenAPI 3.0） | `http://<部署主机>:8000/api/openapi` | 公开路径，可导入 Apifox / Postman 等工具 |

::: tip 以运行时为准
接口清单与参数**以部署实例的 `/api/openapi` 为准**（不同版本的接口会有增减）。本页只说明鉴权方式、调用约定与主要分组，避免与自动生成的规范重复维护。
:::

## 2. 鉴权：会话 Cookie

所有业务接口都要求 NextAuth 会话（浏览器登录后自动带上），**没有**独立的 API Token 机制。

公开路径白名单（无需登录）：

| 路径                       | 说明                                              |
| -------------------------- | ------------------------------------------------- |
| `/login`                   | 登录页                                            |
| `/api/auth/*`              | 登录 / 登出 / 会话 / SSO 回调                     |
| `/api/system/announcement` | 公告（登录页需要展示）                            |
| `/api/system/telemetry`    | 前端埋点                                          |
| `/api/openapi`             | 规范文档                                          |
| `/api/system/status`       | `HEAD` 探活与**无登录态** `GET`（只返回存活摘要） |

### 命令行登录（供脚本或排障使用）

```bash
BASE=http://<部署主机>:8000
JAR=/tmp/onefolio-cookies.txt

# 1) 取 CSRF token（同时写入 Cookie）
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')

# 2) 提交凭据（成功返回 302，会话 Cookie 已在 jar 中）
curl -s -b "$JAR" -c "$JAR" -o /dev/null -w '%{http_code}\n' \
  -X POST "$BASE/api/auth/callback/credentials" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "username=<工号>" \
  --data-urlencode "password=<口令>" \
  --data-urlencode "callbackUrl=$BASE/"

# 3) 验证会话
curl -s -b "$JAR" "$BASE/api/auth/session"

# 4) 带会话调用业务接口
curl -s -b "$JAR" "$BASE/api/tasks?page=1&page_size=10"
```

## 3. 主要接口分组

| 分组       | 代表路径                                                                                                                                   | 说明                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| 认证       | `/api/auth/[...nextauth]`、`/api/auth/change-password`、`/api/auth/sessions`                                                               | 登录/登出、改密、活跃会话                   |
| 单点登录   | `/api/auth/sso/authorize`、`/api/auth/sso/callback`                                                                                        | 门户 SSO 发起与回调                         |
| 任务       | `/api/tasks`、`/api/tasks/[id]`、`/api/tasks/stream`、`/api/tasks/[id]/retry`                                                              | 列表/详情/取消/删除、提交与重试（SSE 流式） |
| 任务产物   | `/api/tasks/download`、`/api/tasks/preview`、`/api/files/[...fileKey]`                                                                     | 下载、预览、文件读取（均需登录态）          |
| 报告类型   | `/api/report-types`                                                                                                                        | 当前部署可选的产品类型（选择器数据源）      |
| 批量生成   | `/api/batches`、`/api/batches/[id]/start`、`/api/batches/[id]/export`                                                                      | 创建/启动/暂停/导出                         |
| 用户与组织 | `/api/users`、`/api/users/import`、`/api/org`、`/api/org/[treeid]/users`                                                                   | 账号与组织架构                              |
| 数据中心   | `/api/analytics`                                                                                                                           | 统计与洞察                                  |
| 系统       | `/api/system/settings`、`/api/system/status`、`/api/system/agent-nodes`、`/api/system/logs`、`/api/system/audit`、`/api/system/batch-tick` | 设置、状态、节点、日志、调度兜底            |
| 通知与反馈 | `/api/notifications`、`/api/feedback`                                                                                                      | 站内通知、用户反馈                          |

## 4. 提交任务（SSE 流式）

`POST /api/tasks/stream` 返回 `text/event-stream`，事件类型：

| 事件       | 内容                           |
| ---------- | ------------------------------ |
| `progress` | 步骤状态与工具调用（生成进度） |
| `complete` | 任务 id、文件 key、文件地址    |
| `error`    | 结构化错误文案                 |
| `done`     | 流结束标记                     |

```bash
curl -N -b "$JAR" -X POST "$BASE/api/tasks/stream" \
  -H 'Content-Type: application/json' \
  -d '{"companyName":"示例企业","reportType":"<报告类型 code>"}'
```

调用前会依次做这些检查，任一不通过直接返回而不会进入生成流程：

| 检查                                         | 结果                                      |
| -------------------------------------------- | ----------------------------------------- |
| 同用户 + 同公司名 + 同报告类型已有进行中任务 | `409` 重复提交                            |
| 该报告类型的并发闸已满                       | `429` 系统繁忙                            |
| 当日已有同公司名完成任务                     | 直接复用并返回 `complete`（跳过真实生成） |
| 该报告类型没有任何节点承接                   | 明确失败（不会跨类型回落）                |

`reportType` 缺省时回退默认类型，因此不带该字段的旧调用方行为不变。

## 5. 通用响应约定

| 状态码        | 含义                                                                 |
| ------------- | -------------------------------------------------------------------- |
| `200` / `201` | 成功（响应体统一包裹 `{ success, code, message, data, timestamp }`） |
| `400`         | 参数错误                                                             |
| `401`         | 未登录或会话失效                                                     |
| `403`         | 角色 / 数据范围不足（越权访问他人数据）                              |
| `404`         | 资源不存在                                                           |
| `409`         | 冲突（重复提交等）                                                   |
| `429`         | 超过容量或频率限制                                                   |

写操作均受**数据范围**约束：普通用户只能操作自己的数据，管理员限本机构及下级，超管全量。越权访问表现为 `403`。
