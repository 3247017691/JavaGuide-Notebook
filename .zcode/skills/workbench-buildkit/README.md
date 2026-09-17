# 面试工作台 · 构建工具箱

**workbench-buildkit** —— 一套给 AI 用的 Agent Skills 包，把「面试工作台」这个项目的**全部构建方法**与**新增子应用的方法**固化成可直接加载的指令。新来的 AI（或新来的同事）读完就能上手，不必先从 6000 个文件里逆推。

> 结构对齐 `.zcode/skills/tasteskill-main/`：根 `README.md` + `skills/<name>/SKILL.md` + `skills/llms.txt` 索引 + `skill.sh` 注册表 + `reference/` 深水区资料。

---

## 项目一句话

把 JavaGuide 离线小抄（12 章 332 篇）和 JBL 火箭题库（14 系统 308 题）装进一块 **macOS 风格桌面外壳**。前端是 Vue 3 + Vite 的 SPA（`client/`），后端 Express + MySQL（`server/`），统一跑在 `http://localhost:3000`。

```
浏览器
  └─ Express :3000  (server/index.js)
       ├─ /api/*                → routes/*（进度、目录、搜索）→ MySQL
       ├─ /jbl/*                → JBL火箭题库/（独立静态站点，被外壳 iframe 装载）
       ├─ /content /img /vendor → public/（内容管线产物）
       └─ /*  (SPA fallback)    → client/dist/（构建产物，**不读源码**）
```

---

## 技能索引

| 技能（目录） | 安装名 | 做什么 |
| --- | --- | --- |
| **new-subapp** | `workbench-new-subapp` | ★ **新增一个子应用**：选型 → 注册 → 宿主 → 桥接 → 侧栏 → 主题 → 构建 → 验收 → **CI/CD 接入**，全链路 |
| **build-map** | `workbench-build-map` | 本项目**所有构建方法**：命令矩阵、依赖顺序、各管线细节、命名陷阱、**预检与发布（CI/CD）** |
| **headless-verify** | `workbench-headless-verify` | 用无头 Chrome + CDP **验证改动**：种子化会话、媒体模拟、截图污染、本机环境坑 |
| **design-contract** | `workbench-design-contract` | **视觉契约**：外壳玻璃 / 纸面两个世界、token 清单、扩展点、禁止事项 |

**只读一个的话**：要加功能读 `new-subapp`，要跑起来读 `build-map`，要确认改对了读 `headless-verify`。

---

## 30 秒上手

```bash
# 0. 依赖（首次）
npm install && npm --prefix client install

# 1. 起服务（会自动建库、建表、导入目录）
npm start                       # → http://localhost:3000

# 2. 改前端后**必须**重新构建（服务端只读 client/dist）
npm run build:client            # = cd client && vite build

# 3. 提交前跑一遍预检（= 本项目的 CI，7 道闸，含构建）
npm run ci                      # 或 npm run ci:e2e 追加上无头浏览器验证
```

**CI/CD 就这三条**（本项目没有云 CI —— 离线单机、依赖本机 MySQL、仓库 265MB，详见 `build-map` 的「预检与发布」一节）：

| | 命令 |
| --- | --- |
| CI（提交前预检） | `npm run ci` · `npm run ci:fast`（跳过构建）· `npm run ci:e2e`（加无头验证）· `npm run ci:hook`（离线静态） |
| 自动化 | **两条 git 钩子由 `npm install` 自动装好**：`pre-commit` 跑静态闸（≈4s），`pre-push` 拦「改了前端没构建」。绕过 `--no-verify`，重装 `npm run prepare` |
| CD · 本地（= 上线） | `npm run ci && npm start` —— 本机 `:3000` 就是生产环境 |
| CD · 远端 | **`git push origin main`（SSH，不需要 PAT/代理）**；HTTPS 不通时才走 `tools/push.bat`（SOCKS 桥 + PAT），见 `new-subapp` 第 9.5 节 |

⚠️ **`npm run ci` ≠ `npm ci`** —— 后者是 npm 自己的「按 lockfile 装依赖」。
⚠️ 钩子**绝不能**用 `core.hooksPath` 管理 —— 那会让 `.git/hooks` 里 Qoder 的 `post-commit` / `post-checkout` 失效。

开发态想热更新：`npm run dev:client`（起 5173，`/api` `/content` `/img` `/vendor` `/jbl` 自动代理到 3000）。**但最终验收要走 3000 的构建产物**，dev 与 dist 行为并不总是等价。

---

## 三条铁律（全文最重要的三句话）

1. **`npm run build` 不是前端构建。** 它是内容管线（markdown → HTML）。前端构建叫 **`npm run build:client`**。名字反着来，是本仓库最容易踩的一条 —— 详见 `build-map`。
2. **服务端只读 `client/dist`，不读 `client/src`。** 改完 `client/src/**` 不重新构建，页面永远没变化，而且**不会报任何错**。
3. **新增子应用时，先看 `new-subapp` 里的「必须泛化的硬编码」。** 当前外壳把「只有两个应用」写死在 **6 处代码 + 1 处数据契约**（`WinFrame` 的二元分发、`nburl.appOfHref`、`windows.gotoModule`、`desk.progress`、`DesktopShell` 的 appId 特判、`WinFrame` 的侧栏文案…）。直接照抄既有应用会在第三个应用上崩掉。

---

## 目录

```
.zcode/skills/workbench-buildkit/
├── README.md                  本文件：总览 + 索引 + 快速上手
├── skill.sh                   本地注册表（skills/* 的路径映射）
├── skills/
│   ├── llms.txt               一行一条的技能索引
│   ├── new-subapp/SKILL.md    ★ 旗舰技能
│   ├── build-map/SKILL.md
│   ├── headless-verify/SKILL.md
│   └── design-contract/SKILL.md
└── reference/                 深水区：按需读，不占主技能篇幅
    ├── subapp-recipes.md      两个既有子应用的完整对照 + 第三种形态配方
    ├── server-surface.md      服务端接口面与数据契约
    └── pitfalls.md            本项目踩过的坑总集（改代码前先扫一眼）
```

## 怎么用

把 `skills/<name>/SKILL.md` 直接交给 AI（或让支持 Agent Skills 的宿主自动加载），也可以只把某一段贴进对话。技能之间可以叠加：**加功能时 `new-subapp` + `design-contract`，构建时 `build-map`，验收时 `headless-verify`。**

## 适用范围

本包描述的是**这个仓库当前的事实**（截至 2026-09-17，提交 `5ad4ba4` 之后）。代码演进后技能会过时 —— 若发现技能与源码不符，**以源码为准，并把技能改对**（技能是活的指令，不是历史文档）。
