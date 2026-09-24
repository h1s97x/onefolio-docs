import { defineConfig } from 'vitepress';

/**
 * OneFolio 部署与运维文档站
 *
 * 读者：部署实施 + 行内运维。内容范围刻意收窄为「怎么装、怎么配、怎么运维」，
 * 架构决策 / 审计报告 / 一次性方案属于开发者文档（仓库 docs/），不进本站。
 *
 * 单一来源约定（重要）：
 * - 环境变量与配置项的事实源是 .env.example / docker-compose.yml / 系统设置页，
 *   本站只做汇总与解释；`pnpm check:docs` 会校验 .env.example 与 compose 里出现的
 *   每个配置项都能在本站配置参考页里找到，防止交付时漏配。
 */

/** 中文分词：MiniSearch 默认按空格切词，纯中文内容会退化成整段一个 token，⌘K 搜不到东西 */
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });

/**
 * 文档仓地址（可选，由构建环境注入）。
 *
 * 本站面向公网，**不硬编码任何内部仓库地址**——代码仓是私有的，
 * 把它的路径/项目代号写进站点等于泄漏。未注入时「编辑此页」与仓库入口不渲染；
 * 拆出独立文档仓后由该仓 CI 注入，例如：
 *   DOCS_REPO_URL=https://<代码托管平台>/<org>/<docs-repo>
 */
const docsRepoUrl = process.env.DOCS_REPO_URL?.trim().replace(/\/+$/, '') || '';

/**
 * 「编辑此页」的完整前缀（可选）。
 *
 * 各托管平台的路径格式不同：GitHub 是 `<repo>/blob/main`，CNB 是 `<repo>/-/blob/main`。
 * 这里**不猜平台**，由构建环境直接给前缀，避免生成一个点了 404 的链接（已踩过一次）。
 */
const docsEditLink = process.env.DOCS_EDIT_LINK?.trim().replace(/\/+$/, '') || '';

export default defineConfig({
  lang: 'zh-CN',
  title: 'OneFolio',
  titleTemplate: ':title · OneFolio 部署与运维',
  description: '访前一页纸（OneFolio）私有化部署、配置与运维文档',
  /**
   * GitHub Pages 对无扩展名 URL 不做重写，开启 cleanUrls 会导致内页 404。
   * 故默认关闭（链接带 .html，任何静态托管都能直接用）；
   * 托管在支持重写的平台（nginx / Netlify / Vercel）时可设 CLEAN_URLS=1 打开。
   */
  cleanUrls: process.env.CLEAN_URLS === '1',
  lastUpdated: true,
  // README 是给维护者看的（怎么本地起、怎么发布），不作为站点页面
  srcExclude: ['README.md'],
  metaChunk: true,
  head: [
    ['meta', { name: 'theme-color', content: '#0f172a' }],
    ['meta', { name: 'robots', content: 'index,follow' }],
  ],
  markdown: {
    lineNumbers: true,
  },
  // 站点域名确定后打开 sitemap（否则生成的 URL 是错的，不如不生成）：
  // sitemap: { hostname: 'https://<正式域名>' },
  themeConfig: {
    nav: [
      { text: '部署指南', link: '/guide/quick-start', activeMatch: '/guide/quick' },
      { text: '配置参考', link: '/guide/configuration', activeMatch: '/guide/config' },
      { text: '运维手册', link: '/guide/operations', activeMatch: '/guide/operations' },
      { text: 'API 参考', link: '/api/', activeMatch: '/api/' },
      { text: '常见问题', link: '/guide/troubleshooting', activeMatch: '/guide/trouble' },
    ],

    sidebar: [
      {
        text: '开始部署',
        collapsed: false,
        items: [
          { text: '交付形态与部署步骤', link: '/guide/quick-start' },
          { text: '环境变量与系统设置', link: '/guide/configuration' },
          { text: '部署边界与容量', link: '/guide/architecture' },
        ],
      },
      {
        text: '日常运维',
        collapsed: false,
        items: [
          { text: '运维总览', link: '/guide/operations' },
          { text: '备份与恢复', link: '/guide/backup' },
          { text: '升级与回滚', link: '/guide/upgrade' },
          { text: '故障排查', link: '/guide/troubleshooting' },
        ],
      },
      {
        text: '参考',
        collapsed: false,
        items: [{ text: 'API 参考', link: '/api/' }],
      },
    ],

    // 搜索：本地索引（构建期生成，不依赖任何外部服务，离线/内网同样可用）
    search: {
      provider: 'local',
      options: {
        miniSearch: {
          options: {
            tokenize: (text: string) =>
              [...segmenter.segment(text)]
                .filter((s) => s.isWordLike)
                .map((s) => s.segment),
            processTerm: (term: string) => term.toLowerCase(),
          },
          searchOptions: {
            fuzzy: 0.2,
            prefix: true,
            boost: { title: 4, text: 2, titles: 1 },
          },
        },
      },
    },

    outline: { level: [2, 3], label: '本页目录' },
    lastUpdated: {
      text: '最后更新',
      formatOptions: { dateStyle: 'short', timeStyle: 'short' },
    },
    docFooter: { prev: '上一篇', next: '下一篇' },
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    sidebarMenuLabel: '目录',
    returnToTopLabel: '回到顶部',
    externalLinkIcon: true,
    // 未配置时不给编辑入口：宁可不显示，也不指向一个点了会 404 的地址
    editLink: docsEditLink
      ? { pattern: `${docsEditLink}/:path`, text: '在仓库中编辑此页' }
      : undefined,
    footer: {
      message: '部署与运维文档 · 与代码同仓维护',
      copyright: 'OneFolio',
    },
    socialLinks: docsRepoUrl ? [{ icon: 'github', link: docsRepoUrl }] : [],
  },
});
