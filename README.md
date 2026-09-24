# OneFolio 文档站（docs-site）

VitePress 文档站，读者是**部署实施与行内运维**。当前与代码同仓维护，**可整体拆成独立仓库**（结构已就绪）。

- 独立 `package.json` 与依赖，不影响应用镜像构建（`.dockerignore` 已排除本目录）；
- 只放「装、配、运维」，架构决策 / 审计报告等开发者文档留在仓库 `docs/`；
- **站点内不硬编码任何内部地址**（仓库路径、制品库域名、项目代号一律用占位符）——
  代码仓是私有的，本站要公网可见，两者边界不同。

## 本地预览

```bash
pnpm --dir docs-site install     # 首次：站点依赖与应用依赖相互独立

pnpm docs:dev                    # http://localhost:5173
pnpm docs:build                  # 产物：docs-site/.vitepress/dist
pnpm docs:preview                # 预览构建产物
```

## 配置项覆盖校验

```bash
pnpm check:docs                     # 同仓模式：读 .env.example + docker-compose.yml
pnpm export:config-surface          # 导出 release/config-surface.json（配置面工件）

# 工件模式（文档站独立成仓后使用）
node docs-site/scripts/check-config-coverage.mjs --surface config-surface.json
```

规则：配置来源里出现的**每个变量名**都必须出现在 `guide/configuration.md`。
新增环境变量却漏写文档时校验失败——这类漏配在交付现场的表现是「客户按文档配完起不来」。

两种模式共用同一份解析逻辑（`scripts/config-surface.mjs`），口径不会分叉；
工件只含变量名与必填标记、**不含取值**，因此可以安全跨仓传递。

## 关联架构（已按此设计，待拆仓后生效）

```text
源码仓（私有，本仓）
  │  打 tag 时：导出 config-surface.json → 推送到文档仓 artifacts/
  ▼
文档仓 · 内容源：cnb.cool/h1s97x/whccb/onefolio-docs（私有）
  │  push → git-sync 单向同步
  ▼
文档仓 · 发布源：github.com/h1s97x/onefolio-docs（公开）
  │  Actions：校验配置项覆盖 → 构建 → 发布
  ▼
GitHub Pages
```

三个角色各自负责一件事，互不越界：

| 角色 | 负责 | 不负责 |
| --- | --- | --- |
| 源码仓 | 导出并推送配置面工件（版本对齐的事实源） | 不构建、不发布站点 |
| CNB 文档仓（内容源） | 唯一的内容编辑入口，提交即同步 | 不做发布前校验 |
| GitHub 文档仓（发布源） | 校验配置项覆盖 + 构建 + 发布 Pages | 不编辑内容（只被消费） |

校验闸放在发布源，是因为「源码仓暴露的配置项是否都有文档」只有在文档仓才检得全；
放在发布前而不是源码仓，能保证**任何一次发布都经过这道闸**。

## 拆出独立仓库

```bash
# 1) 从本仓切出文档站历史（保留提交记录）
git subtree split --prefix=docs-site -b docs-site

# 2) 推到 CNB 文档仓（内容源）
git remote add docs https://cnb.cool/h1s97x/whccb/onefolio-docs.git
git push docs docs-site:main
```

拆仓后按顺序完成四件事：

| # | 事项 | 操作 |
| --- | --- | --- |
| 1 | CNB 文档仓启用同步 | 把本目录 `cnb.yml` 复制到该仓根目录 `.cnb.yml`（其中 `target_url` 即 GitHub 发布源地址） |
| 2 | 建 GitHub 发布仓 | 建公开仓 `h1s97x/onefolio-docs`；`Settings → Pages → Source` 选 **GitHub Actions** |
| 3 | GitHub 仓放 workflow | 本目录的 `.github/workflows/docs.yml` 拆仓后会自然落在正确位置；若手工建仓请一并复制 |
| 4 | 确认凭据 | CNB 密钥仓 `h1s97x/secret-env` 的 `GITHUB_USERNAME` / `GITHUB_TOKEN` 需对该 GitHub 仓**可写**（源码仓的同步已在用同一份凭据） |

然后：源码仓打 tag → 推送新的配置面工件 → GitHub Actions 重建发布。
若工件推送环节失败（凭据/仓名不对），文档站会**沿用上一次的工件**继续发布，
不会因此中断源码仓发版；此时可在源码仓手动执行
`pnpm export:config-surface`，把 `release/config-surface.json` 放进
GitHub 文档仓的 `artifacts/` 目录提交一次即可。

## 发布细节

| 项 | 说明 |
| --- | --- |
| 站点地址 | `https://h1s97x.github.io/onefolio-docs/`（项目站点，位于 `/<repo>/` 子路径，workflow 已自动传 `--base`） |
| 页面入口链接 | `DOCS_REPO_URL`（仓库入口）与 `DOCS_EDIT_LINK`（「编辑此页」前缀）由 workflow 注入。**两个平台的路径格式不同**（GitHub `/blob/main`、CNB `/-/blob/main`），所以前缀由环境给出、不在配置里猜平台 |
| 自定义域名 | 绑定后把 workflow 里的 `--base=/.../` 改成 `--base=/`，并在仓内加 `CNAME` |
| cleanUrls | **默认关闭**：GitHub Pages 不做无扩展名 URL 重写，开启会导致内页 404，因此链接统一带 `.html`。迁到 nginx / Netlify 等支持重写的平台时可设 `CLEAN_URLS=1` 打开（nginx 需 `try_files $uri $uri.html $uri/ =404;`） |
| 404 | VitePress 会生成 `404.html`，GitHub Pages 直接可用 |
| 域名确定后 | 在 `.vitepress/config.mts` 打开 `sitemap.hostname` |

## 写作约定

1. **不要复制正文**：事实源是 `.env.example` / `docker-compose.yml` / 代码，本站只做汇总与解释。
2. **危险操作必须用 `::: danger` 显式标注**（清卷重来、删表、轮换密钥导致会话失效等）。
3. **每条结论尽量对应可执行命令或界面位置**（哪个页签、哪个文件、哪条命令）。
4. **不写内部信息**：仓库路径、制品库域名、项目/客户代号、内网地址一律用占位符
   （`<镜像仓库>`、`<报告类型 code>` 等）。
