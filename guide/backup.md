# 备份与恢复

需要备份的东西只有两样，但**两样都不能少**：

| 对象     | 内容                                                           | 位置                               |
| -------- | -------------------------------------------------------------- | ---------------------------------- |
| 数据库   | 用户、机构、任务、批次、日志、系统设置（含节点与报告类型配置） | Docker 卷 `pgdata`                 |
| 文件数据 | 生成的文件、导出包、上传的图片                                 | Docker 卷 `<项目名>_onefolio-data` |

::: warning 只备份数据库是不够的
任务记录在库里，但文件在 `/data` 卷。两者不一致 = 用户能看到任务却下载不到文件。请成对备份。
:::

## 1. 找卷名

卷名带 compose 项目前缀，先确认：

```bash
docker volume ls | grep -E 'onefolio-data|pgdata'
```

下文用 `<DATA_VOL>` 表示文件数据卷名（形如 `onefolio_onefolio-data`）。

## 2. 备份

建议**先停应用**再备份，保证库与文件是同一时刻的快照（停机窗口通常十几秒即可）：

```bash
docker compose stop app
```

### 数据库

```bash
mkdir -p backup
docker compose exec -T db pg_dump -U postgres -d onefolio \
  | gzip > "backup/onefolio-db-$(date +%Y%m%d%H%M%S).sql.gz"
```

数据量较大或需要按表恢复时，用自定义格式（支持 `pg_restore` 选择性恢复）：

```bash
docker compose exec -T db pg_dump -U postgres -d onefolio -Fc \
  > "backup/onefolio-db-$(date +%Y%m%d%H%M%S).dump"
```

### 文件数据

与升级脚本一致的做法（固定用 `alpine:3`，隔离环境需事先导入该镜像）：

```bash
docker run --rm \
  -v <DATA_VOL>:/data \
  -v "$PWD/backup":/backup \
  alpine:3 tar czf "/backup/onefolio-data-$(date +%Y%m%d%H%M%S).tar.gz" -C / data
```

恢复应用：

```bash
docker compose start app
```

::: tip 备份放哪
3-2-1 原则：本地一份、异地一份、至少一份离线。本站部署形态不依赖任何云存储，请按行内备份策略把 `backup/` 目录纳入既有备份通道。
:::

## 3. 恢复

### 数据库

```bash
docker compose stop app

# .sql.gz 备份
gunzip -c backup/onefolio-db-20260924_020000.sql.gz \
  | docker compose exec -T db psql -U postgres -d onefolio

# .dump 备份
docker compose exec -T db pg_restore -U postgres -d onefolio --clean --if-exists \
  < backup/onefolio-db-20260924_020000.dump

docker compose start app
```

### 文件数据

```bash
docker compose stop app

docker run --rm \
  -v <DATA_VOL>:/data \
  -v "$PWD/backup":/backup \
  alpine:3 sh -c 'cd / && tar xzf /backup/onefolio-data-20260924_020000.tar.gz'

docker compose start app
```

## 4. 恢复后验证

```bash
# 1) 服务健康
curl -I http://<host>:5000/api/system/status -X HEAD

# 2) 业务数据抽样核对
docker compose exec db psql -U postgres -d onefolio -c \
  "SELECT (SELECT count(*) FROM users) AS users,
          (SELECT count(*) FROM tasks) AS tasks,
          (SELECT count(*) FROM tasks WHERE status='completed') AS completed;"
```

再登录界面抽查一条历史已完成任务能否正常下载/预览——这同时验证了「库 + 文件」两样都对上了。

## 5. 恢复目标（建议值）

| 场景                  | 建议 RPO         | 建议 RTO |
| --------------------- | ---------------- | -------- |
| 误删任务 / 误操作数据 | 1 天（每日备份） | 1 小时   |
| 数据库卷损坏          | 1 天             | 2 小时   |
| 整机 / 主机级灾难     | 1 天             | 4 小时   |

需要更小的 RPO 时，把 `pg_dump` 改为定时高频执行（如每小时），并把产物同步出本机。
