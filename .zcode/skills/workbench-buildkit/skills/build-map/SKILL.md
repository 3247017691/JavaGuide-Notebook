---
name: workbench-build-map
description: 「面试工作台」项目的全部构建方法 —— 构建、打包、编译、重建、启动、部署、内容管线、数据库初始化、题库管线。命令矩阵、依赖顺序、每条管线的输入输出、环境变量，以及 npm run build 与 npm run build:client 的命名陷阱。触发词：构建、build、打包、编译、启动服务、跑起来、重建、更新内容、初始化数据库、init db、deploy、发布、npm run build。
---

# 构建图谱（Build Map）

**前提**：工作目录 = 仓库根（`D:\AAA-课程资料\面试资料`）。本技能里所有路径都相对仓库根。

**先记这一条**：本项目有**两条互不相干的构建链** + **一个静态发布**。

```
① 内容链（JavaGuide 正文）         ② 前端链（外壳 SPA）              ③ 静态（题库）
   data/chapters.json                 client/src/**                     JBL火箭题库/tools/source.md
        │ npm run build                    │ npm run build:client              │ node tools/build.js
        ▼                                  ▼                                   ▼
   public/content/*.html              client/dist/**                    JBL火箭题库/data.js
   data/articles-meta.json
   data/image-map.json
        │ npm run fetch-images             │                                   │
        ▼                                  │                                   │
   public/img/**                           │                                   │
        │ npm run verify                    │                                   │
        ▼                                  ▼                                   ▼
   （自检报告）                       ┌──────────────────────────────────────────┐
                                      │  server/index.js  :3000                  │
                                      │  读 client/dist + public/** + JBL火箭题库/│
                                      └──────────────────────────────────────────┘
```

**三条命名陷阱（都是字面反着的）**：

| 命令 | 直觉以为 | 实际是 |
| --- | --- | --- |
| `npm run build` | 前端打包 | **内容管线**：markdown → `public/content/*.html` |
| `npm run build:client` | 客户端……？ | **前端打包**：`vite build` → `client/dist/` |
| `npm start` / `node server.js` | 两个入口？ | 同一个：`server.js` 只是 3 行兼容壳，实现全在 `server/` |

> 服务端**只读 `client/dist`，从不读 `client/src`**。改前端不重新构建 = 页面毫无变化，**且不报任何错**。这是本仓库最高频的「我改了怎么没生效」。

---

## 命令矩阵

### 首装

```bash
npm install                  # 根：express / mysql2 / undici + 构建期 markdown-it / highlight.js / mermaid
npm --prefix client install  # 前端：vue / vite / pinia / vue-router / element-plus
```

两处 `node_modules` 是**分开的**。只装一个会在启动或构建时缺包。

### 日常

| 命令 | 等价于 | 作用 |
| --- | --- | --- |
| `npm start` | `node server/index.js` | 起服务 `:3000`（首次自动建库建表导入目录） |
| `npm run dev:client` | `cd client && vite` | 前端热更新 `:5173`，API/内容/图片自动代理到 3000 |
| `npm run build:client` | `cd client && vite build` | **前端构建** → `client/dist/` |
| **`npm run ci`** | `node tools/preflight.mjs` | **提交前预检**（本项目的 CI）：7 道闸，含 vite build。⚠️ 不是 `npm ci` |
| `npm run ci:fast` | `… --skip-build` | 跳过构建，快速跑其余六闸 |
| `npm run ci:e2e` | `… --e2e` | 追加上无头浏览器验证（每应用一窗 + 控制台无报错） |
| `npm run ci:hook` | `… --static` | 不构建 / 不连服务 / 不开浏览器 —— **git 的 pre-commit 跑的就是这条** |
| `npm run ci:selftest` | `… --selftest` | 只验预检自己的两个解析器（不碰项目） |
| `node tools/cdp-shot.mjs a.png [b.png] [x,y]` | — | 无头截图（验证用，见 `headless-verify` 技能） |

### 内容链（仅当 JavaGuide 正文变了才跑）

| 命令 | 脚本 | 作用 |
| --- | --- | --- |
| `npm run build` | `build-content.js` | `docs/**/*.md` → `public/content/*.html`；同时重写 `data/articles-meta.json` 与 `data/image-map.json` |
| `npm run fetch-images` | `download-images.js` | 按 `image-map.json` 下载图片 → `public/img/`（undici 16 并发，重试 2 次） |
| `bash retry-curl.sh` | — | 用 curl 重试失败图片（把 `data/img-failures*.txt` 里的再捞一遍） |
| `npm run verify` | `verify-links.js` | **自检**：外链残留 / `/read/*.html` 落点缺失 / `#锚点` 错位。有问题时**非零退出** |

**顺序不可颠倒**：`build` → `fetch-images` → `verify`。原因是 `image-map.json` 由 `build` 生成，`fetch-images` 才有清单可下；`verify` 校验的正是 `build` 的产物。

> 内容源路径：默认 `C:/tmp/JavaGuide/docs`，可用环境变量 `JAVAGUIDE_REPO` 覆盖（见 `build-content.js` 顶部 `REPO`）。

### 数据链

| 命令 | 脚本 | 作用 |
| --- | --- | --- |
| `npm run init-db` | `server/db.js` | 建库、建表、导入 `data/chapters.json` 目录种子 |

平时**不需要手动跑** —— 服务首次成功连库时会自动完成。只有在「删库重来」或「目录种子改了要重导」时才手动执行。

### 题库链（仅当 JBL 飞书文档更新了才跑）

```bash
cd JBL火箭题库/tools
node build.js            # source.md (+ sheets.json) → ../data.js   ← 外壳与 /api/desk 都读它
node export-md.js        # 可选：合成一份干净的 ../JBL火箭题库.md
```

输入来源（`JBL火箭题库/tools/build.js` 头部注释里有完整流程）：`source.md` 是飞书文档正文导出，`sheets.json` 是内嵌电子表格的 CSV。**内容更新必须重跑，否则页面还是旧题**。

### 一键启动（Windows）

`启动离线小抄.bat` —— 双击即用：装依赖（若缺）→ **杀掉占用端口的旧进程** → 开浏览器 → `node server.js`。重复启动不会 `EADDRINUSE`。

它的实现要点（改它之前先看）：`netstat -ano | findstr /r /c:":%PORT% .*LISTENING"` 取第 5 列拿 PID（模式**带尾部空格**，所以端口 `3999` 不会误伤 `39999`），再 `taskkill /f /pid`；文件必须存成 **CRLF + UTF-8 无 BOM**（cmd 解析 `for /f` 多行块对 LF 不友好）。

---

## 预检与发布（CI/CD）

**本项目没有云 CI，也不该有**：离线单机、依赖本机 MySQL、仓库 265MB（含 444 页内容产物入库）。所以 CI/CD 是本地实现的：

### CI = `npm run ci`（`tools/preflight.mjs`）

七道闸，约 10 秒跑完（含 vite build）：

| 闸 | 查什么 | 失败说明什么 |
| --- | --- | --- |
| A 前端构建 | `vite build` 通过 | 语法 / 导入错误 |
| B 构建产物 | `dist/index.html` 存在 + 资源带内容哈希 | 忘了构建（→ 服务端 503） |
| C 内容自检 | `verify-links.js` 零缺陷 | 链接 / 落点 / 锚点有问题 |
| D 注册表一致性 | 图标双注册 / `id` 唯一 / 字段完整 / **多应用泛化就绪度** / `/api/desk` 的 `toc` 键 | 参见 `new-subapp` 第 4 步 |
| E 服务冒烟 | `/`、`/api/meta`、`/api/desk` 的形状 + **每个应用入口 URL 可达** | 挂载错位 / 被 SPA fallback 抢走 |
| F 硬编码报告 | grep「按应用特判」候选（**仅报告，不阻断**） | 提示该泛化了 |
| G 无头验证（`--e2e`） | 每个应用各开一窗 + 工具栏有玻璃材质 + Dock 项数 + 控制台无报错 | 多应用并存被破坏 |

**设计要点：脚本从 `client/src/lib/apps.js` 读应用清单**（入口 URL、图标键、`toc` 键全来自注册表）—— 所以加应用**不需要改 CI 配置**，它自动覆盖。

另一条设计：闸 D 的「多应用泛化就绪度」**按应用数量判定**，而不是「代码里有没有 `jbl` 字面量」。那几处二元实现在只有 2 个应用时是**正确的**，只在第 3 个应用出现时才是 bug —— 按字面量判会让 CI 在主干上永远红，变成没人看的噪音。

注意：**`npm run ci` ≠ `npm ci`**（后者是 npm 自己的装依赖命令）。

### 自动化：两条 git 钩子（`npm install` 时自动装好）

`package.json` 的 `prepare` 生命周期会把 `tools/hooks/*` 装进 `.git/hooks/`：

| 钩子 | 跑什么 | 耗时 |
| --- | --- | --- |
| `pre-commit` | `npm run ci:hook`（= `--static`：产物 / 内容 / 注册表 / 硬编码报告） | ≈4s |
| `pre-push` | **只查一件事**：`client/src` 有文件比 `client/dist` 新 → 拦下（「改了前端没构建」） | <1s |

绕过 `git commit/push --no-verify` · 重装 `npm run prepare` · 验预检解析器 `npm run ci:selftest`。

**为什么 pre-commit 只跑静态闸**：不构建（8s+）、不要求服务在跑、不开浏览器。否则「没起服务」会让每条提交都失败 —— 一条永远红的闸只会被 `--no-verify` 绕过，等于没有。运行时确认交给 `npm run ci`。

⚠️ **不要用 `core.hooksPath`**：它会把整个 `.git/hooks` 挪走，`.git/hooks/post-commit` 与 `post-checkout`（**Qoder 的追踪器**）会当场失效。安装脚本检测到它被设置时只告警、不动它。

### CD · 本地（就是「上线」）

```bash
npm run ci && npm start        # 预检 → 重启。本机 :3000 就是生产环境
```

改前端不重启也能生效（`dist` 被重新读）；**改 `server/**` 必须重启**。重启后可用 `npm run ci:fast` 再冒烟一遍（闸 E 会把所有入口和 API 点一次）。

### CD · 远端

**首选 SSH**（2026-09-17 实测）：远端是 `git@github.com:3247017691/JavaGuide-Notebook.git`，
`github.com:22` **直连可用**，`~/.ssh/config` 已指向 `~/.ssh/javaguide_deploy`。

```bash
git push origin main     # 不需要 PAT，也不需要 SOCKS 桥
```

**HTTPS 备用路线** `tools/push.bat`（`github.com:443` 直连超时时才需要）。五条硬约束：

1. **先起 SOCKS→HTTP 桥**：`node tools/socks-http-proxy.js 7893`（探 7893–7896，都没起就直接退）。
   本机只有 SOCKS5 出口，git 认 HTTP 代理，这个脚本就是适配层。
2. **PAT 交互输入、不落盘**：临时 `HOME` + `credential.helper=store`，推完即清。**绝不把 token 写进文件**。
3. **`http.version=HTTP/1.1` + `postBuffer=500MB` 是必需的**：schannel 与 HTTP/2 在 GFW 下握手会炸。
4. 耗时随数据量走：**首次全量 265MB 约 30–40 分钟；增量小得多**（实测 6 提交 / 97 文件 = 20.4MB，分钟内完成）。
5. 脚本第 5 行 `cd /d "D:\AAA-????\????"` 的中文路径已被 cmd 编码毁成 `?`；修法是 `cd /d "%~dp0.."`。

**推送前**：`pre-push` 会拦「改了前端没构建」；公开仓库另需扫一遍凭据
（已知非凭据命中：`JBL火箭题库/tools/source.md` 里的飞书 `<sheet token>` / `<whiteboard token>` 是内嵌资源 ID，不是密钥）。

**判断推没推上去，一律看 `git ls-remote origin refs/heads/main`（服务端权威）。**
本地 `origin/main` 可能不可靠 —— 在沙箱/自动化环境里 `.git/refs/remotes/**` 不被持久化，
`git status` 会显示 `main...origin/main [gone]`，与推送是否成功无关。

> `.git/hooks/post-commit` 与 `post-checkout` 是 **Qoder（另一个 AI IDE）的追踪器**，不是本项目的 CI。别误认，也别删。

---

## 环境变量

| 变量 | 默认 | 用于 |
| --- | --- | --- |
| `PORT` | `3000` | 服务端口（`server/index.js` 与 .bat 都认） |
| `MYSQL_HOST` / `MYSQL_PORT` | `127.0.0.1` / `3306` | 数据库地址 |
| `MYSQL_USER` / `MYSQL_PASSWORD` | `root` / `123456` | 数据库账号 |
| `JAVAGUIDE_REPO` | `C:/tmp/JavaGuide/docs` | 内容源 |
| `HTTPS_PROXY` | `http://127.0.0.1:7892` | 仅图片下载用 |
| `JBL_OUT` | `JBL火箭题库/data.js` | 题库构建输出 |

---

## 运行时行为（构建之外，但会影响你怎么调）

1. **启动期连不上 MySQL 不退出进程**。服务照常监听，`/api/*` 返回 503 + 中文指引；`getPool()` 按 5 秒冷却按需重连，连上后自动跑一次启动对账。**别改成 `process.exit(1)`。**
2. **`client/dist` 不存在时**，SPA fallback 返回 503 并明确提示「请在 client/ 目录执行 npm run build」。所以「页面 503」十有八九是没构建，而不是服务挂了。
3. **`/api` 有方法/路径闸门**：未登记的路径 404、方法不对 405（带 `Allow`），一律 JSON。新增路由要同时登进 `API_ROUTES`。
4. **静态挂载优先级**（`server/statics.js`）：`/jbl` → `/img`（魔数嗅探纠正 Content-Type）→ `client/dist` → `/content` `/vendor` → SPA fallback。新增前缀要插在 `client/dist` 之前。
5. `dev:client` 的 5173 只服务 SPA 与前端资源，数据一律代理到 3000 —— **所以 dev 需要 3000 同时开着**。

---

## 「我改了什么 → 要跑什么」决策表

| 改动位置 | 必须执行 | 要重启服务吗 |
| --- | --- | --- |
| `client/src/**` | `npm run build:client` | 否（dist 被重新读了） |
| `client/index.html` / `vite.config.js` | `npm run build:client` | 否 |
| `server/**` | — | **是**（Node 不热重载） |
| `server/statics.js` 挂载、`context.js` 目录 | — | **是** |
| `data/chapters.json`（目录种子） | `npm run init-db`（重导库） | 建议 |
| JavaGuide 正文 | `npm run build` → `fetch-images` → `verify` | 否（`context.js` 启动时读过 meta 则要重启） |
| `JBL火箭题库/tools/source.md` | `node tools/build.js` | **是**（`context.js` 启动时解析 `data.js`） |
| `JBL火箭题库/*.js` `*.html` `*.css` | — | 否（静态文件，刷新即可） |
| `package.json` 依赖 | `npm install`（或 `npm --prefix client install`） | 视情况 |
| **提交 / 发布前** | **`npm run ci:e2e`** | 是（闸 E、G 验的是运行中的实例） |

**口诀**：**改前端 → build:client；改服务端 → 重启；改内容/题库 → 重跑对应管线 + 重启；提交前 → `npm run ci`。**

---

## 常见故障与定位

| 症状 | 八成原因 |
| --- | --- |
| 页面 503 + 「前端尚未构建」 | `client/dist` 不存在 → `npm run build:client` |
| API 全 503 + 中文提示 | MySQL 没起，或账号不是 `root/123456` |
| 改了前端没变化 | 没重新构建；或浏览器缓存（构建产物带 hash，正常情况不用强刷） |
| `EADDRINUSE` | 旧进程占着 3000（.bat 会自动清；手动起时先杀掉） |
| API 404 / 405 | 新路由没登进 `API_ROUTES` 闸门 |
| `/jbl/xxx` 打开是外壳首页 | 挂载写在 `client/dist` 之后，被 SPA fallback 抢了 |
| `verify-links.js` 非零退出 | 链接落点缺失/锚点错位 → 看它打印的清单 |
| 图片 404 但文件名没错 | `image-map.json` 新了但没 `npm run fetch-images` |
| 题库还是旧题 | 没重跑 `JBL火箭题库/tools/build.js`，或没重启服务 |
| `npm run ci` 红在闸 A | 前端构建失败 → 看它打印的 vite 报错最后 12 行 |
| `npm run ci` 红在闸 D | 注册表不一致 → 图标没双注册 / `toc` 与 `/api/desk` 对不上 / 多应用泛化未做（见 `new-subapp` 第 4 步） |
| `npm run ci` 红在闸 E 的入口项 | iframe 应用的挂载被 SPA fallback 抢了 → 检查 `server/statics.js` 的顺序 |
| `npm run ci` 闸 E 报服务不可达 | 忘了 `npm start`（闸 E 需要运行中的实例） |
| `npm run ci:e2e` 说没找到 Chrome | 用 `--chrome <路径>` 指定，或跳过该闸（其余六闸仍然有效） |
| 提交时钩子报「预检未通过」 | 看它打印的失败项 —— 它只跑静态闸，与「没起服务 / 没构建」无关 |
| 钩子压根没跑 | 十有八九 `core.hooksPath` 被设了（设了就绕过 `.git/hooks`）→ `git config --unset core.hooksPath`；或 `npm run prepare` 重装 |
| `git push` 被 pre-push 拦下 | `client/src` 有文件比 `client/dist` 新 → `npm run build:client`；故意如此则 `git push --no-verify` |

---

## 本机环境备忘（Windows / Git Bash）

- **Node 用绝对路径最稳**：`C:/Users/谢晨/.workbuddy/binaries/node/versions/22.22.2-3/node.exe`（managed 版）。本机 shell 偶发缺 coreutils（`ls`/`cat`/`head` 报 command not found）→ 查文件、发请求**用绝对路径 node 跑内联脚本**最可靠。
- **git**：`D:/.Software/Tools/Git/cmd/git.exe`。仓库里有大量在制品，**回滚只能用精确手段**（`git checkout -- <目录>`，且要先确认该目录的 diff 全是本次产生的）。
- **Bash 里 curl 本地必须加 `--noproxy '*'`**：全局代理会让 `localhost` 请求返回 502（那是代理报的错，不是服务挂了）。
- **vite 可直接用绝对路径调**：`"<node>" "client/node_modules/vite/bin/vite.js" build "client"` —— 绕开 npm 脚本时用这条。

---

## 一次完整重建（从零到能跑）

```bash
npm install && npm --prefix client install
npm run init-db            # 建库建表导入目录（可选，首次启动也会自动做）
npm run build              # 内容（仅当 public/content 不存在或正文变了）
npm run fetch-images       # 图片（同上）
npm run build:client       # ★ 前端构建，必须
npm run verify             # 内容自检
npm start                  # → http://localhost:3000
npm run ci:fast            # 冒烟：闸 E 把所有入口与 API 点一遍
```

`public/content/` 已在版本库里（444 篇），所以**日常只需要 `npm run build:client` + `npm start`**。

**而提交前只需要一条**：`npm run ci`（它内部已经跑了 `build:client` 与 `verify`，外加注册表一致性与服务冒烟）。
