# 运维总览

## 1. 每天看一眼什么

| 检查项     | 怎么看                                                                 | 异常信号                                 |
| ---------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| 服务存活   | `curl -I http://<host>:8000/api/system/status -X HEAD`                 | 非 200                                   |
| 数据库连通 | `curl http://<host>:8000/api/system/status`（匿名摘要里的 `database`） | `database` 不为 ok                       |
| 智能体可用 | 同上摘要中的 `agent`；或管理员的节点状态接口                           | 无节点承接 / 节点全部隔离                |
| 磁盘       | `df -h`（重点看 `/data` 所在分区与容器卷）                             | 使用率 > 85%                             |
| 任务失败   | 「数据中心」「任务」页按状态筛选                                       | 失败率 > 10%，或集中出现「智能体未配置」 |
| 批次卡住   | 「批量生成」页是否有长时间不动的批次                                   | 见第 4 节                                |
| 日志       | 「系统日志」「审计日志」页                                             | error / critical 级别突增                |

## 2. 容器与卷

| 容器               | 作用                                    | 需开放端口                  |
| ------------------ | --------------------------------------- | --------------------------- |
| `onefolio`         | 应用（Next.js standalone，容器内 5000） | 是（`APP_PORT`，默认 8000） |
| `onefolio-gateway` | nginx，把 `/rest/v1/*` 重写到 PostgREST | 否（compose 内网 8080）     |
| `onefolio-rest`    | PostgREST，把 PostgreSQL 暴露成 REST    | 否（内网 3000）             |
| `onefolio-db`      | PostgreSQL                              | 否（内网 5432）             |

| 卷              | 内容                        | 丢失后果                  |
| --------------- | --------------------------- | ------------------------- |
| `onefolio-data` | 生成文件、导出包（`/data`） | 历史报告全部无法下载/预览 |
| `pgdata`        | 数据库数据                  | 全部业务数据丢失          |

::: danger 别在裸容器里改动数据库结构
手工 SQL 变更不会反映到部署脚本里，下次全新部署会缺结构。结构变更请走 `migrations/` 并同步更新 `docker/initdb/01_schema.sql`。
:::

## 3. 常用运维命令

```bash
# 查看服务状态与健康
docker compose ps

# 应用日志（最近 200 行）
docker compose logs --tail=200 app

# 数据库初始化/启动阶段的问题（首次部署失败先看这里）
docker compose logs db | head -50

# 进入数据库
docker compose exec db psql -U postgres -d onefolio

# 重启应用（不改配置时）
docker compose restart app

# 停服务（保留数据卷）
docker compose down
```

## 4. 批量卡住怎么处理

**第一步：确认部署形态是长驻进程**（见[部署边界与容量](./architecture)）。

```sql
-- 1) 批次状态与暂停标志
SELECT id, name, status, paused, updated_at FROM batches WHERE status = 'processing';

-- 2) 任务状态分布：pending 有值但 processing 长期不降 = 没有调度循环在跑
SELECT status, count(*) FROM tasks WHERE batch_id = '<batchId>' GROUP BY status;

-- 3) 是否有长时间无心跳的 processing 任务
SELECT id, company_name, updated_at FROM tasks
WHERE batch_id = '<batchId>' AND status = 'processing' ORDER BY updated_at ASC LIMIT 10;
```

**第二步：手动打一次兜底 tick**（超管会话）：

```bash
curl -X POST http://<host>:8000/api/system/batch-tick -H 'Cookie: <超管会话 Cookie>'
```

- 返回 `processed: 0` 说明没有 `pending` 任务可认领（可能已全部失败）→ 在批次页用「续跑」重试；
- 返回 `processed > 0` 说明调度已恢复，但根因（进程被回收 / 定时器没跑）仍需排查。

**第三步：出现大量「任务执行中断」** —— 这是失联任务回收机制误杀，根因是进程被回收或智能体调用超时未回收。请先解决长驻进程问题，再考虑提高失联阈值。

## 5. 日志与审计

| 数据     | 位置                                             | 保留                                              |
| -------- | ------------------------------------------------ | ------------------------------------------------- |
| 系统日志 | 「系统日志」页，可按级别 / 来源 / 时间筛选与导出 | 由「系统设置 → 数据」的保留天数控制，到期自动清理 |
| 审计日志 | 「审计日志」页（写操作留痕）                     | 同上                                              |
| 登录日志 | 系统管理内                                       | —                                                 |
| 访问日志 | 中间件记录                                       | —                                                 |

日志走数据库存储，因此**日志量会占用 `pgdata` 卷**；保留天数设得过长会让库体积持续增长。

## 6. 安全例行事项

- 数据库端口不对外开放（compose 已默认不映射）；
- 定期轮换 `AUTH_SECRET` 与 `PGRST_JWT_SECRET`（**维护窗口执行，会让在线会话全部失效**）；
- 首个管理员口令与 `BOOTSTRAP_ADMIN_PASSWORD` 不同（后者只在首次初始化用；如需改库内管理员的初始口令，请在界面上改）；
- 超级管理员账号数量保持最少；
- 离线包与镜像 tar 的 `SHA256SUMS` 在导入前校验。

## 7. 相关文档

- [备份与恢复](./backup)
- [升级与回滚](./upgrade)
- [故障排查](./troubleshooting)
