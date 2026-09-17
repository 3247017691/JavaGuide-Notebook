# 参考 · 服务端接口面与数据契约

**文件**：`server/index.js`（装配）· `server/context.js`（目录与搜索语料）· `server/db.js`（建库建表）· `server/services/progress.js`（联动）· `server/routes/*.js`（四组路由）

---

## 一、装配顺序（改 `index.js` 前必须知道）

```js
const ctx = buildContext();                       // ① 读磁盘构建产物（不需要数据库）
const progress = createProgressService({ getPool, sectionsOf: ctx.sectionsOf });
ctx.meta = ctx.META; ctx.outById = ctx.OUT_BY_ID; // ② 小写别名 —— 路由里统一用小写
ctx.deskToc = ctx.DESK_TOC; ctx.searchDocs = ctx.SEARCH_DOCS;
Object.assign(ctx, { getPool, requireDb, serverError, NEED_DB, progress });  // ③ 注入运行时能力

app.use(gzipShim()); app.use(express.json());
gateApi();                                        // ④ ★ 闸门在路由之前注册，所以它先跑
registerOverviewRoutes(app, ctx);
registerReadRoutes(app, ctx);
registerJblRoutes(app, ctx);
registerDeskRoutes(app, ctx);
mountStatics(app, { clientDist: CLIENT_DIST });   // ⑤ 静态与 SPA fallback 永远最后
```

**两条含义**：

1. **闸门先于路由**：新路由**不登进 `API_ROUTES` 就在到达 handler 前被 404 拦掉**，而且现象是「代码明明写了却 404」。
2. `mountStatics` 最后注册 → 它内部顺序就决定了优先级（`/jbl` → `/img` → `client/dist` → `/content` `/vendor` → SPA fallback）。**新前缀要插在 `client/dist` 之前**，否则会被 SPA 抢走。

---

## 二、API 全表

| 方法 | 路径 | 依赖库 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/meta` | ✗ | 全部文章元数据（423KB 级）。阅读页 TOC / 上下篇用 |
| GET | `/api/overview` | ✓ | 各章统计 + 总进度（含每篇 `{id, r, sr, st}`） |
| GET | `/api/chapters/:code` | ✓ | 章明细，按 `group` 分组 |
| GET | `/api/recent?limit=` | ✓ | 最近批阅（`limit` 双向钳制 0–50，默认 8） |
| GET | `/api/reads` | ✓ | 已读篇 id 列表 |
| GET | `/api/section-reads?article=` | ✓ | 某篇已划小节 id 列表 |
| POST | `/api/read` | ✓ | 单篇划线/撤线（篇 → 节联动） |
| POST | `/api/section-read` | ✓ | 小节划掉/退回（节 → 篇联动） |
| POST | `/api/bulk` | ✓ | 整章批量 |
| GET/POST | `/api/jbl/progress` | ✓ | 题库掌握进度（GET 全量 id / POST 单项） |
| POST | `/api/jbl/migrate` | ✓ | 浏览器进度搬进库（一次性，最多 500 条） |
| POST | `/api/jbl/reset` | ✓ | 清空题库进度 |
| GET | `/api/desk` | ✗ | 外壳侧栏目录（`DESK_TOC`） |
| GET | `/api/search?q=&limit=` | ✗ | 全局搜索（`limit` 1–40，默认 24） |

**「依赖库 ✗」的两条**（`/api/meta`、`/api/desk`、`/api/search`）**在 MySQL 没起时也能用** —— 这是有意的设计：外壳照样能导航、能搜索，只有进度数字需要库。

### 请求/响应要点

```js
POST /api/read          { id: string, read: boolean }
  → { ok, id, read, readAt, sectionsRead, sectionsTotal }

POST /api/section-read  { article: string, heading: string, read: boolean }
  → { ok, article, heading, read, articleRead, sectionsRead, sectionsTotal }

POST /api/bulk          { code: string, read: boolean }
  → { ok, code, read }

GET  /api/overview      → { total, read, pct, sectionsTotal, sectionsRead, pctSections, lastReadAt, chapters[] }

POST /api/jbl/progress  { id: "q-1-12", done: boolean }   // id 正则 /^q-\d{1,2}-\d{1,3}$/
```

**三个写接口都返回「联动后的状态」**，前端就地更新，不再回查。这是刻意的：并发下回查会拿到中间态。

---

## 三、错误语义（别自己发明）

```js
const NEED_DB = "MySQL 未就绪：请确认服务已启动（root/123456）后刷新";
```

- **`requireDb(res)`**：拿不到连接就 `503 + { error: NEED_DB }` 并返回 `false`。每个需要库的 handler **第一行**就该是它。
- **`serverError(res, e)`**：按 **错误码** 分级（`DB_DOWN_CODES` 集合），不要用正则猜 message（mysql2 断连的 message 里没有任何关键词）。
  - 依赖故障 → `503`
  - 其余 → `500 + "服务内部错误，详情见终端日志"`
- **不透传数据库原文**：`res.json({ error: … })` 里永远是人类可读的中文，原文只进终端日志。
- **闸门**：路径不存在 → `404`；方法不对 → `405 + Allow`；一律 JSON。`/api/chapters/:code` 由正则特判放行。

## 四、数据契约（进度模型）

**两级 + 双向联动**：

| 表 | 键 | 含义 |
| --- | --- | --- |
| `chapters` | `code` | 章（科目） |
| `articles` | `id` | 篇（含 `chapter_code`、`grp`、`title`、`url`、`ext`、`ord`） |
| `read_marks` | `article_id` | **篇级盖章** |
| `section_reads` | `(article_id, heading_id)` **复合键** | **节级划掉** |
| `jbl_mastered` | `qid` | 题库单项 |

**四条铁律**（改相关代码前必读，全部来自实战缺陷）：

1. **联动必须走 `withTx()`**：`SELECT … FOR UPDATE` 锁篇目行（整章操作按 `id` 顺序锁全章）+ 事务，死锁按 `e.code === "ER_LOCK_DEADLOCK"` 重试（最多 4 次，退避 `15ms × attempt`）。绕开它，「小节划完 ⟺ 整篇已读」会被并发打破（修复前 90%+ 复现）。
2. **「划满了没有」按与 `sectionsOf(id)` 求交集判定**，**不能数表里的行数**；收尾要 `DELETE … heading_id NOT IN (真实小节)` 清残留。
3. **`section_reads` 必须用复合键**：META 里跨文章有 **520 个重复 `heading.id`**，单键会串篇。
4. **零小节篇不参与节日联动**：META 里 10 篇 `headings` 为空（付费 / 无正文），只能手动盖章 —— 否则 `n >= 0` 恒真会误判为「已读」。

**「读了一部分」是第三个状态**（`!read && sr > 0`），必须在四处口径一致：小抄首页刻度微条 / 章节目录虚线半圈 / 阅读页目录头朱砂线 / `/api/overview` 的 `partial` 字段。

**启动对账**：首次成功连库后跑一次 `reconcileProgress()`（幂等），补齐联动规则上线前的历史孤岛。

---

## 五、目录（`DESK_TOC`，侧栏的数据源）

```js
{
  javaguide: {
    name, total,
    chapters: [{ code, name, blurb, count, href: "/chapter.html?c=01" }],
    routes:   { "/read/xxx.html": "01" },   // ★ 正文页 → 章号反查表
  },
  jbl: { name, total, chapters: [{ code, name, blurb, count, href: "/jbl/chapter.html?c=1" }] },
}
```

**`routes` 为什么存在**：`/read/xxx.html` 的 URL 里没有章号，而侧栏要在阅读页把当前章高亮 —— 所以压成一张表反查。

**新应用接侧栏**：`DESK_TOC` 加一个键，键名与 `apps.js` 的 `toc` 字段一致即可。没有目录就省略 `toc`。

## 六、搜索（`SEARCH_DOCS`）

一次构建、进程存活期内复用。文档形状：

```js
{ app, id, title, sub, url, kind, head, body, titleLower, subLower, headLower, bodyLower }
```

**打分**（`routes/desk.js`）：标题开头 90 / 标题中间 66 / 副标题 44 / 标题层级 30 / 正文 12；命中全部词才入列；同分先短标题。摘要 `makeSnip()` 围绕首个命中位置取一段（**服务端不拼 HTML**，避免注入面；高亮在前端做）。

**新应用接搜索**：在 `context.js` 的 `buildSearchDocs()` 里按同样字段 push 即可（`app` 字段决定命令面板里的归属）。

---

## 七、静态资源（`server/statics.js`）

| 挂载 | 源 | 备注 |
| --- | --- | --- |
| `/jbl` | `JBL火箭题库/` | `extensions: ["html"]`（省扩展名可访问） |
| `/img` | `public/img/` | **魔数嗅探纠正 Content-Type**（62 张图扩展名与真实格式不符），带目录穿越防护 |
| `/` | `client/dist/` | SPA 壳与构建资产；不存在则跳过 |
| `/content` | `public/content/` | 444 篇正文 HTML |
| `/vendor` | `public/vendor/` | 离线 mermaid |
| 兜底 | `client/dist/index.html` | 只接 `Accept: text/html` 的 GET/HEAD；dist 缺失时 `503 + 「前端尚未构建：请在 client/ 目录执行 npm run build」` |

`/read/*.html` 含中文路径也走 SPA fallback —— 壳页不读磁盘，**没有穿越风险**（`/api` 已在前面的闸门里 404/405，到不了这里）。
