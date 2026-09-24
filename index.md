---
layout: home

hero:
  name: OneFolio
  text: 访前一页纸
  tagline: 私有化部署、配置与运维文档
  actions:
    - theme: brand
      text: 开始部署
      link: /guide/quick-start
    - theme: alt
      text: 配置参考
      link: /guide/configuration
    - theme: alt
      text: 故障排查
      link: /guide/troubleshooting

features:
  - title: 离线自持
    details: 一个镜像交付，运行时注入全部配置；不依赖任何外部对象存储、CDN 或平台服务。适用于完全隔离内网。
  - title: 一套编排起全栈
    details: 应用 + PostgreSQL + PostgREST + 路径网关由 docker compose 一次拉起，初始化脚本自动建表并播种管理员。
  - title: 多产品共存
    details: 同一部署可提供多种报告（访前一页纸 / 行研一页纸 …），任务按报告类型路由到对应智能体节点，容量互不挤占。
  - title: 可观测
    details: 匿名探活端点、节点级运行状态、系统日志与审计日志、失败邮件告警，均可用于外部监控接入。
---

## 这套文档面向谁

给**部署实施与行内运维**：怎么安装、每一项配置是什么意思、出问题怎么看。

架构方案与内部设计决策不在本站（那些内容随代码仓库维护），本站只保留「装、配、运维」三件事，并且每一条都对应到实际可执行的命令或界面位置。

## 三条必须记住的前提

::: warning 单副本部署
文件落本地磁盘、调度与限流状态在进程内存中，**禁止横向扩容多副本**。确需扩容请先改造存储与调度，详见[部署边界与容量](./guide/architecture)。
:::

::: warning 必须长驻进程
批量生成的调度由 Node 进程内的循环推进，请求返回后仍要继续跑。按请求计费的 Serverless 形态会表现为「批次卡住 + 任务被误标失败」，需要额外配定时任务兜底。
:::

::: warning 数据卷不可丢
`/data` 卷存生成的文件与导出包；数据库在 `pgdata` 卷。两个卷都必须纳入备份，容器重建不会恢复它们。
:::
