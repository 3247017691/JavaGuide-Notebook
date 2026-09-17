# 参考 · 踩过的坑总集

**用法**：动手前扫一遍相关章节。每条都标了「症状 → 真因 → 做法」，因为**这些坑的症状几乎都指向错误的方向**。

---

## 一、构建 / 运行

| # | 症状 | 真因 | 做法 |
| --- | --- | --- | --- |
| 1 | 改了前端毫无变化，**且不报错** | 服务端只读 `client/dist`，不读 `client/src` | `npm run build:client` |
| 2 | 想构建前端，跑了 `npm run build` | 那是**内容管线**（md → HTML） | 前端是 `npm run build:client`。名字是反着的 |
| 3 | 页面 503「前端尚未构建」 | `client/dist` 不存在 | 同上；**不是服务挂了** |
| 4 | 改了 `server/**` 不生效 | Node 不热重载 | 重启服务 |
| 5 | 新加的 API 404（代码明明写了） | `gateApi()` **在路由之前注册** | 登进 `API_ROUTES` |
| 6 | 新前缀（如 `/notes`）打开是外壳首页 | 挂载写在 `client/dist` 之后，被 SPA fallback 抢了 | 插在 `client/dist` 之前 |
| 7 | `EADDRINUSE` | 旧进程占 3000 | `启动离线小抄.bat` 会自动清；手动起时先杀 |
| 8 | API 全 503 | MySQL 没起 / 账号不对 | 服务**不会退出**，起来后刷新即可 |
| 9 | 题库还是旧题 | 没重跑 `JBL火箭题库/tools/build.js`，或 `context.js` 启动时已缓存 | 重跑 + 重启 |
| 10 | 图片 404 但文件名没错 | `image-map.json` 新了但没下载 | `npm run fetch-images` |
| 11 | `verify-links.js` 非零退出 | 链接落点缺失 / 锚点错位（**正常现象，是自检在报告**） | 看它打印的清单再决定 |

**一条口诀**：**改前端 → `build:client`；改服务端 → 重启；改内容/题库 → 重跑对应管线 + 重启。**

---

## 二、视觉 / CSS

| # | 症状 | 真因 | 做法 |
| --- | --- | --- | --- |
| 12 | 玻璃「看着不透」 | **`.win` 自身带不透明 `--win-bg`**，`backdrop-filter` 采样到的是窗口自己的底 | `.win { background: transparent }`；`--win-bg` 只给 `.frames` / `.tab.on` / `.frame-load` |
| 13 | 窗口叠放时两层文字原样压在一起，**看着像「太透了」** | `.win-bar` / `.win-side` 只有颜色、**没有 `backdrop-filter`**（模糊是 `glass-*` **类**给的，它俩没这个类） | **补材质**，不是降透明度 |
| 14 | 玻璃像纯色塑料板 | blur 过大，背后被抹平 | 降 blur（`--glass-blur` / `--glass-blur-thick`） |
| 15 | 背后文字与浮层文字叠成一团、读不了 | blur 不够（13px 中文没糊掉）。实测 26px 仍残留，32px 才干净 | 升 blur。配方是**高模糊 + 中等 alpha** |
| 16 | 色散彩环画满整个窗口 | 宿主原本不是定位元素，绝对定位伪元素去找了更外层祖先 | 补 `position: relative`（液玻璃段里已补 5 个） |
| 17 | 版面莫名歪掉，**无任何报错** | 装饰层退化成裸元素，而 `.dock` / `.win-bar` / `.sheet` **是 flex 容器** → 多一个 flex item | 装饰层必须有 `display: none` 兜底 |
| 18 | reduced-motion 下动画停在奇怪的一帧 | 兜底是 `duration: .01ms` + 单次迭代 → 停在 **100% 帧** | `@keyframes` 的 0% / 100% 必须是**干净静止态** |
| 19 | 形变退化成椭圆 | `border-radius` 四角没配平 | 对角相等，如 `63% 37% 42% 58% / 41% 62% 38% 59%` |
| 20 | 小抄与外壳样式互漏 | 两套世界同名类 | 纸面样式必须在 `.nb-scope` 内 |
| 21 | 窗口内布局尺寸全错 | 用了 `100vh / 100vw` | 容器查询 + `ResizeObserver` 写自定义属性 |
| 22 | 「降低透明度」对某个玻璃件失效 | 新增玻璃件时漏了降级名单 | 加进 `data-desk-opaque` 与 `prefers-reduced-transparency` 名单 |
| 23 | 调了半天菜单也不像参考图 | **物理前提不满足**：参考图背后是深色照片，这里背后是浅色纸面 | 别再调参，换深色壁纸（`abyss`） |
| 24 | 改了液玻璃只生效一半 | 高光与色散**两处名单**只改了一处 | 两处一起改 |

---

## 三、验证（CDP / 无头）

| # | 症状 | 真因 | 做法 |
| --- | --- | --- | --- |
| 25 | 截图里窗口凭空消失，`wins: 0` | **探测动作污染**：在 Dock 中心按下会触发应用切换/最小化 | 点**标题栏中段**；先拍一张「没动过」的 pre 图 |
| 26 | 判断 reduced-motion「没生效」 | 全局兜底改的是 `animation-duration`，`animationName` **仍是原名** | 测 `animationDuration`，或测 `data-desk-liquid` 属性存在与否 |
| 27 | 验缓存时「没走 ETag/304」 | **Node `fetch`(undici) 把正确的 304 报成 200** | 用 `require("http").request` 看原始 `statusCode` |
| 28 | 本地服务「返回 502，像是挂了」 | Bash 里的全局代理 | curl 加 `--noproxy '*'` |
| 29 | 会话种子不生效、看到上次的布局 | 复用了 `--user-data-dir` | 每次换临时目录（或启动前删） |
| 30 | 媒体模拟不生效 | `Emulation.setEmulatedMedia` 放在了 `navigate` 之后 | 移到之前（媒体查询在文档加载时求值） |
| 31 | 截图坐标全偏一倍 | 设备像素比是 2 | `--force-device-scale-factor=1` |
| 32 | `ls` / `cat` / `head` 报 command not found | 本机 shell 缺 coreutils | 用**绝对路径 node 跑内联脚本** |
| 33 | 根目录多出 `_shot-*.png` 这类垃圾 | 截图直接写在仓库根 | 用 `$TEMP/wb-verify/` |

---

## 四、子应用接入

| # | 症状 | 真因 | 做法 |
| --- | --- | --- | --- |
| 34 | 新应用窗口开出空白 | `WinFrame` 是**二元分发**（`app.native` → 小抄，`else` → JBL） | 改宿主表 + `<component :is>`（`new-subapp` 第 4.1） |
| 35 | 快捷键 / 最近打开跳不到新应用 | `nburl.appOfHref`、`windows.gotoModule/openRecent` 写死 `/jbl/` 前缀 | 泛化成按 `APPS.src` 最长前缀匹配（第 4.2） |
| 36 | 新应用进度条不显示 | `desk.progress` 写死 `{ javaguide, jbl }` | 改成按 `APPS` 生成的 map + 探针表（第 4.3） |
| 37 | iframe 应用点链接后「回不来」 | 外链没加 `target="_blank"`，在 iframe 里打开了 | 外链一律 `target="_blank" rel="noopener"` |
| 38 | iframe 应用的标签标题 / 前进后退失效 | 跨域（没挂在本服务下），拿不到 `contentWindow.location` | **必须同源** |
| 39 | 子应用独立打开就报错 | 删了桥开头的 `if (window.top === window.self) return;` | 别删 —— 独立可跑是形态 B 的价值 |
| 40 | 侧栏没有新应用的章节 | `/api/desk` 的 `DESK_TOC` 键名与 `apps.js` 的 `toc` 不一致 | 两处对齐 |
| 41 | Dock 上是空白按钮 | 只加了 `GLYPHS`，没加 `APP_ICONS` | 两个都要加 |
| 42 | 刷新后新应用窗口丢了 | `apps.js` 的 `id` 改了 | `id` 是 `desk:session` 的键，**发布后别改** |

**分水岭**：只测新应用会全绿；**三窗同开**才会暴露第 34–36 条。

---

## 五、服务端 / 数据

| # | 症状 | 真因 | 做法 |
| --- | --- | --- | --- |
| 43 | 并发下「小节划完 ⟺ 整篇已读」被打破 | 绕开了 `withTx()` / 没锁行 | 一律 `withTx` + `lockArticle` / `lockChapter` |
| 44 | 「划满了没有」误判 | 数了 `section_reads` 的行数（含残留） | 与 `sectionsOf(id)` **求交集** |
| 45 | 两篇的小节互相串 | `section_reads` 用了单键 | **复合键** `(article_id, heading_id)`（有 520 个重复 `heading.id`） |
| 46 | 零小节篇被误判成「已读」 | `n >= 0` 恒真 | 10 篇 `headings` 为空的**不参与节日联动**，只能手动盖章 |
| 47 | 「读了一部分」三处呈现不一致 | 有地方自己加了第二个条件 | 口径同源：`!read && sr > 0` |
| 48 | 中文篇目 404 | `/read/` 路由用了不含 `%` 的字符白名单 | 保持 `/^\/read\/.+\.html$/i`（Express 匹配**百分号编码后**的路径） |
| 49 | 前端拿 `location.pathname` 反查元数据失败 | 没解码 | 先 `decodeURIComponent`（两处是配套的） |
| 50 | 启动时库不可用导致进程退出 | 有人改回了 `process.exit(1)` | **不许退出** —— 503 + 中文指引是设计 |
| 51 | 错误响应里出现数据库原文 | 直接 `res.json({ error: e.message })` | 走 `serverError(res, e)`，按 `e.code` 分级 |
| 52 | `LIMIT -1` 语法错误 | 没钳制 query 参数 | 像 `/api/recent` 那样双向钳制 |

---

## 六、本机环境与工作流

| # | 症状 | 做法 |
| --- | --- | --- |
| 53 | 找不到 git | `D:/.Software/Tools/Git/cmd/git.exe` |
| 54 | 想 `git checkout .` 回滚 | **不许**。工作区常有大量在制品。回滚只能 `git checkout -- <目录>`，且先确认该目录的 diff 全是本次产生的 |
| 55 | 提交流程 | 只 `git add` 你改的目录；根目录的 `_shot-*.png` 之类临时截图**不要提交** |
| 56 | Node 用哪个 | managed：`C:/Users/谢晨/.workbuddy/binaries/node/versions/22.22.2-3/node.exe` |
| 57 | vite 怎么直接调（绕开 npm 脚本） | `"<node>" "client/node_modules/vite/bin/vite.js" build "client"` |
| 58 | 改完样式要提醒什么 | **提醒强制刷新**（Ctrl+Shift+R）—— 虽然构建产物带 hash 通常不需要，但 dev 态会 |

---

## 七、CI/CD（2026-09-17 新增）

| # | 症状 | 真因 | 做法 |
| --- | --- | --- | --- |
| 59 | `npm run ci` 报「服务不可达」 | 闸 E / G 需要**运行中**的实例 | 先 `npm start`。`--skip-build` 只跳过构建，不跳过闸 E |
| 60 | 把 `npm ci` 当成本项目的 CI | `npm ci` 是 npm 自己的「按 lockfile 装依赖」 | 本项目是 **`npm run ci`**（跑 `tools/preflight.mjs`） |
| 61 | 闸 D 报「多应用泛化未完成」 | 注册表里确实已有 ≥3 个应用 | 按它列出的位置泛化（`new-subapp` 第 4 步）。只有 2 个应用时这条不会失败 |
| 62 | 闸 F 报一堆「硬编码候选」，以为必须全改 | 静态 grep **分不清数据与逻辑**，且它**不阻断** | 当提示看；真正的判定在闸 G（每应用一窗 + 控制台无报错） |
| 63 | `--e2e` 说没找到 Chrome | 不在默认路径 | `--chrome "<路径>"`；找不到就跳过该闸，其余六闸仍然有效 |
| 64 | 闸 G 绿了，但截图里窗口观感不对 | 闸 G 只断言**数量与材质**，不看观感 | 看观感走 `headless-verify` 技能的截图流程 |
| 65 | 闸 B 说「刚构建完却没有哈希文件名」 | `vite.config.js` 的命名被改过 | 恢复默认命名（哈希文件名是「不用强刷」的前提） |
| 66 | `tools/push.bat` 报「No SOCKS5-HTTP bridge proxy running」 | SOCKS→HTTP 桥没起 | 另开一个 shell：`node tools/socks-http-proxy.js 7893` |
| 67 | 把 `.git/hooks/post-commit` 当成本项目的 CI（或想删掉） | 那是 **Qoder（另一个 AI IDE）的追踪器** | 不误认、不删；它不影响本项目 |
| 68 | 想给本项目上云 CI | 离线单机 + 依赖本机 MySQL + 仓库 265MB | 不值。真要做只跑闸 A + C + D（纯静态、不启服务、不连库） |
| 69 | 钩子压根没跑 | `core.hooksPath` 被设置 —— **它会让 `.git/hooks` 里的文件不再执行** | `git config --unset core.hooksPath`，或 `npm run prepare` 重装。**别为了「修钩子」去设 `core.hooksPath`** —— 那会连带停掉 Qoder 的 post-commit / post-checkout |
| 70 | `npm install` 之后钩子没装上 | `.git` 不存在（打包 / CI / 未 `git init`）→ 安装脚本按约定静默跳过、退出码恒 0 | 不是 bug。进 git 仓库后跑 `npm run prepare` |
| 71 | 提交被钩子拦下 | `pre-commit` 跑的是 `--static` 那 4 道闸 | 看它打印的失败项。确属急事：`git commit --no-verify` |
| 72 | `git push` 被拦「client/src 有文件比 dist 新」 | 改了前端没构建（服务端只读 dist，推上去是旧页面且不报错） | `npm run build:client`；故意的则 `git push --no-verify` |
| 73 | 装钩子时看到「已备份为 pre-commit.bak-…」 | `.git/hooks/pre-commit` 原先是个**非本工具**的钩子 | 备份保留了。要恢复：把 `.bak-*` 改回 `pre-commit` 覆盖掉我们的即可 |
| 74 | 以为 `pre-commit` 会替我做完整预检 | 它**故意**不构建、不连服务、不开浏览器 | 完整预检是 `npm run ci` / `npm run ci:e2e`（提交后 / 推送前跑） |
| 75 | 推送前先起了 SOCKS 桥、准备输 PAT，结果根本不需要 | `github.com:22` **直连可用**，远端是 SSH（`~/.ssh/javaguide_deploy`） | 首选就一条：`git push origin main`。HTTPS（443）反而超时，`push.bat` 是备用路线 |
| 76 | `git status` 显示 `main...origin/main [gone]`，以为推送失败了 | **沙箱/自动化环境不持久化 `.git/refs/remotes/**`** —— `git update-ref` 与 `git fetch` 都报成功，但引用文件不出现（对照实验：`refs/heads/` 与 `refs/tags/` 正常） | 判断「推上去了没有」**只看 `git ls-remote origin refs/heads/main`**（服务端权威）。本地跟踪引用在这里不可信 |
| 77 | 想「修一下」上面那个 `[gone]` | 重建也会被吞掉（实测 `update-ref` 报成功、文件从不出现） | 不是你仓库的问题，别折腾。在**自己的终端**里 `git fetch` 就正常了 |
| 78 | 公开仓库推之前担心夹带密钥 | 扫描命中 12 处 `token="…"` | 那是 `JBL火箭题库/tools/source.md` 里飞书文档的 `<sheet token>` / `<whiteboard token>` —— **内嵌资源的对象 ID，不是凭据**（没有该文档授权就用不了）。真正的 PAT/私钥/AKIA 一个都没有 |

## 八、一句总结

这个项目里**绝大多数坑的症状都指向错误的方向**：

- 「玻璃太透了」→ 真因是**没有模糊**
- 「页面没变化」→ 真因是**没构建**
- 「窗口消失了」→ 真因是**探针点错位置**
- 「构建命令跑错了」→ 真因是**命名反着来**
- 「菜单不像参考图」→ 真因是**物理前提不成立**

**先怀疑前提，再怀疑参数。**
