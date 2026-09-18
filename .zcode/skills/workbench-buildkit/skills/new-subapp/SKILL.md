---
name: workbench-new-subapp
description: 在「面试工作台」这块 macOS 风格桌面外壳里新增一个子应用（子 App / 新窗口应用 / 新模块 / subapp）。覆盖三种接入形态（native Vue 宿主 / iframe 独立站点 / 纯静态挂载）的选型、注册表字段、宿主组件、postMessage 桥协议、侧栏与主题联动、服务端接线、构建与验收；并逐条列出本项目必须泛化的硬编码集成点 —— 不先处理它们，第三个应用一定崩。另含 CI/CD 接入：七道预检闸（npm run ci）、本地部署三步、GFW 下的远端推送链路。触发词：新增应用、加个子应用、新 App、新窗口应用、subapp、接入新应用、add app to desktop shell、新模块、CI、CD、预检、流水线、preflight。
---

# 新增子应用（Elegant Sub-App Onboarding）

**适用对象**：`client/`（Vue 3 + Vite SPA）+ `server/`（Express）这套「面试工作台」外壳。

**先说结论**：这个外壳目前是**围绕两个应用硬编码**的。优雅地加第三个应用，**不是复制一份 `javaguide` 或 `jbl` 的代码**，而是先把外壳里写死的「二」泛化成「表」，然后只在表里加一行。第 4 步是全文最关键的一步 —— 跳过它，前 3 步做得再干净也会在运行时崩掉。

---

## 第 0 步 · 选型：这个子应用该用哪种形态

三种形态，差别在**谁渲染 UI** 与**是否独立可跑**：

| 形态 | 采用者 | UI 在哪 | 独立打开 | 适合 |
| --- | --- | --- | --- | --- |
| **A. native**（原生 Vue 宿主） | `javaguide` | `client/src/components/<app>/` 里的 Vue 组件，**同一文档** | 否（只有外壳里有） | 新 UI；要复用外壳的令牌 / store / 组件；要深度联动（进度、侧栏、命令面板） |
| **B. iframe**（独立站点） | `jbl` | 一个能独立打开的静态目录（`JBL火箭题库/`），被 `<iframe>` 装载 | **是**（`file://` 双击也能跑） | 已有一份独立站点想原样复用；技术栈与外壳不同；希望脱离外壳也能用 |
| **C. 纯静态挂载** | `JBL火箭题库/chapter.html` | 挂在某前缀下的页面，**不开窗** | 是 | 只作为另一个应用的子页被链接（`/jbl/chapter.html?c=`），本身不需要独立窗口 |

**判据一句话**：
- 只是「给现有应用加个页面」→ 不要新建应用，加进该应用的 `modules` / 路由即可。
- 要独立窗口、独立标签、独立 Dock 图标 → **A 或 B**。
- 已有独立可跑的站点，且不想重写 → **B**。
- 全新界面，且想白拿玻璃令牌、命令面板、toast、进度联动 → **A**。

> 从 A 起步更常见，也更容易做对。B 的额外成本全在「桥」上（第 3B 步）。

---

## 第 1 步 · 注册应用（唯一的声明式入口）

**文件**：`client/src/lib/apps.js` → `APPS` 数组。

这个文件是**单一事实来源**：Dock、启动台、命令面板、`appById` 反查、外层窗口标题全部从这里读。加一行就出现在 Dock 上。

```js
{
  id: "mynotes",                       // 唯一键。会成为窗口 id、localStorage 会话键、postMessage 的 app 标识
  name: "我的笔记",                     // 窗口标题、Dock 悬浮提示、右键菜单首行
  src: "/mynotes/index.html",          // 默认打开的标签页 URL（A 形态填该应用的逻辑首页，如 "/mynotes/index.html"）
  icon: "mynotes",                     // APP_ICONS 的键（Dock / 最小化缩略图用）—— 见第 2 步
  glyph: "book",                       // GLYPHS 的键（侧栏 / 列表里的细线符号）
  accent: "#3b7ddd",                   // 应用主色。窗口会把它写成 CSS 变量 --acc（侧栏高亮、进度条都取它）
  toc: "mynotes",                      // 目录键：外壳去 /api/desk 的返回里取 catalog[toc] 作为侧栏章节
  modeKey: "mynotes:mode",             // 深浅色持久化键（B 形态桥要用；A 形态走外壳 prefs 可省）
  native: true,                        // ★ A/B 形态开关：true = 原生 Vue 宿主，false/省略 = iframe
  w: 1100, h: 720, minW: 720, minH: 460, // 初始尺寸与缩放下限
  desc: "随手记 · 存在本机",            // 启动台 / 关于面板里的一句话
  chapterIcons: {},                    // 章色图标表（可选，见 icons.js 的 JG_CHAPTER_ICONS）
  chapterColors: {},                   // 章色表（可选，见 CH_COLORS）
  modules: [                           // 侧栏顶部的固定入口（侧栏「模块」区）
    { title: "笔记", items: [
      { label: "全部笔记", glyph: "list", href: "/mynotes/index.html", hint: "一屏看全" },
    ] },
  ],
  actions: [                           // 工具栏「更多操作」菜单里的应用专属项（外壳通用项会自动追加）
    { act: "reload", label: "重新载入", glyph: "reload", kbd: "Ctrl R" },
  ],
}
```

**要点**：

- `id` 一旦发布就**别改** —— 它是 `desk:session` 里 `wins` 的键，改了会让老用户的开窗状态丢失。
- `accent` 会被 `WinFrame` 写成内联 `--acc`，所以侧栏高亮 / 进度条自动跟色，不需要碰 CSS。
- `toc` 与 `/api/desk` 的返回键必须对上（第 5 步）。没有目录就**省略 `toc`**，侧栏会只显示 `modules`。
- `actions[].act` 是**动词字符串**，由 `stores/windows.js` 的 `run(act, arg)` 分派。用现成的（`reload` / `blank` / `bulk:chapter`）最省事；要新动词就在 `run()` 里加一个 `case`。

**新动词的写法**（`client/src/stores/windows.js` → `run`）：

```js
case "mynotes:export": return exportNotes();   // 与既有 case 并列，不要去改 winFrame 的模板
```

---

## 第 2 步 · 图标（两个地方，别只加一个）

**文件**：`client/src/lib/icons.js`

```js
export const GLYPHS = {
  // …51 个既有键…
  "notebook-pen": '<path d="M4.6 5.4h9"/><path d="M4.6 12h6"/><path d="m14 15 5.4-5.4a1.6 1.6 0 0 0-2.3-2.3L11.7 12.7V15z"/>',
};
export const APP_ICONS = {
  // Dock 用的彩色应用图标，键必须与 apps.js 的 icon 字段一致
  mynotes: () => `<svg viewBox="0 0 52 52" …>…</svg>`,
};
```

**两个注册表的区别**（容易混）：

- `GLYPHS` + `gl(name, sw)` → **细线符号**，`currentColor` 描边，给侧栏 / 菜单 / 工具栏用。
- `APP_ICONS` → **彩色应用图标**，Dock 与最小化缩略图用，键 = `apps.js` 的 `icon`。

只加一个的后果：Dock 上是空白按钮，或侧栏项没有图标。**两个都要加。**

> 图标语言：细线、圆头、1.7 描边宽，24×24 视觉框（`viewBox="0 0 24 24"`）。**不要引入外部图标库 / CDN** —— 全站零外网依赖是硬约束。

---

## 第 3 步 · 宿主组件

### 3A. native 形态

新建 `client/src/components/mynotes/`，两个组件：

**`MynotesWindow.vue`** —— 窗口内的根，负责「标签页 URL → 视图」的映射。把它写成**薄**的：

```vue
<template>
  <MynotesRoot :key="tab.id" :navigate="navigate" :set-title="setTitle">
    <MynotesHome v-if="view === 'home'" :key="'home-' + tab.rt" />
    <MynotesList v-else-if="view === 'list'" :key="'list-' + tab.rt" />
    <MynotesHome v-else />
  </MynotesRoot>
</template>

<script setup>
import { computed } from "vue";
import { useWins } from "../../stores/windows";
/* 参考 components/notebook/NotebookWindow.vue —— 结构一模一样，只换解析函数与视图组件 */
const props = defineProps({ win: { type: Object, required: true }, tab: { type: Object, required: true } });
const wins = useWins();
const view = computed(() => /* 你的 URL 解析 */ "home");
function navigate(href) { wins.go(props.win.id, href); }              // 导航必须走外壳，才能进标签历史
function setTitle(t) { wins.setTabTitle(props.win.id, props.tab.id, t); }
</script>
```

**每个视图（含 home）在 `onMounted` 里 `setTitle(可读名)`。** 标签标题为空时标签条**回落裸 URL**（小抄首页曾因此在多标签下显示 `/index.html`）。注意两处兜底不同：窗口标题栏空 → 回落应用名（好看），标签条空 → 回落 url（难看），别指望同一个空字符串两边都体面。

**`MynotesRoot.vue`** —— 设计令牌作用域 + 滚动容器 + 容器查询基座。**照抄 `NotebookRoot.vue` 的形状**，把 `.nb-scope` 换成你自己的作用域类（例如 `.mn-scope`），并同样用 `ResizeObserver` 把实测尺寸写成 `--your-h / --your-w`：

> ⚠️ **窗口内的布局一律不用 `100vh / 100vw`**。窗口是绝对定位的浮动盒子，视口单位会算到整页，尺寸全错。用容器查询 + `ResizeObserver` 写进去的自定义属性 —— 这正是 `NotebookRoot` 存在的理由。

**铁律**：

- 所有 `navigate()` 都走 `wins.go(winId, href)`，**不要 `location.href = …`**。后者会整个页面跳走，外壳都没了。
- 长内容自己滚，**别让外层 `.frames` 滚**（滚动条会长在窗口外面）。
- 作用域类是必须的：外壳（`.desk-scope` 世界，即全局）与小抄（`.nb-scope`）就是这么隔离同名类（`.sheet` / `.btn`）的。你的应用同理，**别污染全局**。

### 3B. iframe 形态（含桥协议）

**服务端挂载**（`server/statics.js`，第 5 步详述）：

```js
app.use("/mynotes", express.static(path.join(__dirname, "..", "我的笔记"), { extensions: ["html"] }));
```

**桥文件**：在子应用目录里放一份 `desk-bridge.js`。**逐字参考 `JBL火箭题库/desk-bridge.js`** —— 它是这份协议的参考实现，只有约 57 行。骨架：

```js
(function () {
  "use strict";
  if (window.top === window.self) return;            // ★ 独立打开时第一行就返回，行为与接桥前完全一致

  var cfg = window.DESK_BRIDGE || {};
  var MODE_KEY = cfg.modeKey || "mynotes:mode";
  var root = document.documentElement;
  var last = root.dataset.mode || "";                // 吃掉自激：自己下发的模式不要再回报

  function post(msg) {
    msg.source = "desk-app";                          // ★ 外壳靠这个字段认亲
    try { window.parent.postMessage(msg, location.origin); } catch (e) { /* 外壳不在就静默 */ }
  }

  /* 外壳 → 子应用：外壳调这个函数下发主题（先落键再调应用自己的切换函数） */
  window.DESK_applyMode = function (mode, persist) {
    if (mode !== "day" && mode !== "night") return;
    if (root.dataset.mode === mode) { last = mode; return; }
    last = mode;
    if (persist === false) { root.dataset.mode = mode; return; }   // 「跟随系统」时不写死偏好
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* 隐私模式 */ }
    root.dataset.mode = mode;
  };

  /* 子应用 → 外壳：本地切换要回报，用 last 吃掉自激 */
  if (window.MutationObserver) {
    new MutationObserver(function () {
      var m = root.dataset.mode || "";
      if (m === last) return;
      last = m;
      if (m === "day" || m === "night") post({ type: "mode", mode: m });
    }).observe(root, { attributes: true, attributeFilter: ["data-mode"] });
  }

  /* 快捷键转交：只接管带 Ctrl/⌘ 的组合，Ctrl+C/V/X/Z/A 一律放行 */
  /* …照抄 JBL 那份的 KEYS / SHIFT_KEYS / keydown 一段… */

  post({ type: "ready" });                            // 就绪握手：外壳收到后回推主题
})();
```

**在子应用的 HTML 里按这个顺序引入**（顺序有意义）：

```html
<script>window.DESK_BRIDGE = { modeKey: "mynotes:mode", home: "index.html" };</script>
<script src="desk-bridge.js?v=20260917" defer></script>
```

**消息协议全表**（`source` 恒为 `"desk-app"`，`origin` 必须同源）：

| 方向 | 消息 | 外壳侧处理 |
| --- | --- | --- |
| 子 → 壳 | `{ type: "ready" }` | 回推当前主题（`DesktopShell.vue` 的 `onMessage`） |
| 子 → 壳 | `{ type: "mode", mode: "day"\|"night" }` | 外壳在 `auto` 档时「收养」成同款深浅，并 toast 提示 |
| 子 → 壳 | `{ type: "shortcut", key, shift }` | 转交外壳快捷键（`DesktopShell.vue` 的 `frameKey`） |
| 壳 → 子 | `window.DESK_applyMode(mode, persist)` | 由 `JblFrame.vue` 的 `pushTheme()` 调用 |

**外壳侧的宿主组件**：复制 `client/src/components/shell/JblFrame.vue`（约 60 行），改名 `MynotesFrame.vue`，把里面写死的 `"jbl-rocket:mode"` 换成你的 `modeKey`。它负责三件事：`onLoad` 时同步 URL / 历史 / 标题（`wins.frameSync` + `wins.tabLoaded`）、`pushTheme`、`watch(prefs.nbMode)` 时重推。

**iframe 形态的三个硬约束**：

1. **必须同源**（挂在本服务的路径下）。跨域就拿不到 `contentWindow.location`，标签标题、前进后退全废。
2. **子应用必须是「能独立打开」的**：`file://` 双击也要正常。桥的第一行 `if (window.top === window.self) return;` 保证了这一点 —— 别删。
3. **子应用里发外链要 `target="_blank"`**，否则会在 iframe 里打开，用户再也回不来。

---

## 第 4 步 · ★ 泛化硬编码（**这一步不能跳**）

外壳把「只有两个应用」写死在 **7 个文件**里（下表 9 处逻辑 + 1 处数据契约）。加第三个应用前，**先把它们改造成数据驱动**；否则会出现「窗口开出空白」「侧栏文案错」「进度探针不认」「快捷键切不到」「命令面板归错应用」这类**不报错的静默故障**。

> **这个数字怎么来的（可复现）**：`npm run ci` 的**闸 F** 会扫出 **6 个文件、13 处候选行**（grep 形态：`=== "jbl"` / `? "jbl" :` / `indexOf("/jbl/")`）；`stores/desk.js` 的 `progress` 字面量是**对象字面量**，grep 扫不到，由**闸 D** 专门判定 —— 两个闸合起来才是 7 个文件。
> 别凭记忆数这个数字，改完先跑一次闸 F/闸 D。

| # | 位置 | 现状（写死了二） | 泛化方式 |
| --- | --- | --- | --- |
| 1 | `components/shell/WinFrame.vue` `.frames` | `v-if="app.native"` → `NotebookWindow`，`v-else` → `JblFrame` | 改成**宿主表** + `<component :is>`（见 4.1） |
| 2 | `lib/nburl.js` `appOfHref()` | `indexOf("/jbl/") === 0 ? "jbl" : "javaguide"` | 由 `APPS` 的 `src` 前缀**最长匹配**推导（见 4.2） |
| 3 | `stores/windows.js` `gotoModule()` / `openRecent()` | **又各自写了一遍** `/jbl/` 前缀判断 | 两处都改为调用第 2 项的统一函数（见 4.2） |
| 4 | `stores/desk.js` `state.progress` + `probeDb()` | `progress: { javaguide, jbl }`，只探这两个接口 | 改成按 `APPS` 生成的 map + 探针表（见 4.3） |
| 5 | `components/shell/DesktopShell.vue` `onMessage` / `pushJblTheme` | `if (w.appId !== "jbl") return;` —— 只把主题推给 jbl | 按应用查 `modeKey` 决定推给谁（`apps.js` 里已有该字段） |
| 6 | `components/shell/WinFrame.vue` `sideItems` / 底部进度文案 | 侧栏标题 `appId === "jbl" ? "检查系统" : "章节"`（两处）、进度行 `=== "jbl" ? "已掌握" : "已划线"` | 把文案放进 `apps.js`（例如加 `sideTitle` / `progressWord` 字段），组件只读不算 |
| 7 | `components/shell/Palette.vue` | 3 处：`tabNew` 的 `/jbl/` 前缀判断、`h.app === "jbl"` 的分组名与图标三元 | 一律改走 `appOfHref()` / 按 `app` 反查 `appById`，分组名用 `appById[app].name` |
| 8 | `components/shell/Launchpad.vue` —— **整套功能级特判** | 启动台里有 JBL 专属的「检查系统」文件夹：`ui.launchpadFolder === "jbl"` 分支、`jblChapters` computed、两处 `desk.toc("jbl")`、硬编码搜索词 `"题库 检查系统 火箭 jbl"`、`appById.jbl.chapterIcons` | 比一行判断重得多。要么把「文件夹」概念做成注册表字段（`folder: { title, items }`），要么**明确决定**只有 jbl 有文件夹并写进注释 —— 别让它默默成为第二处会出错的地方 |
| 9 | `stores/windows.js` `bulkChapter()` | `desk.catalog[w.appId === "jbl" ? "jbl" : "javaguide"]` —— 整章确认框的目录归属 | 改成 `desk.toc(w.appId)`；注意该函数本身只对小抄有意义，可在应用表里加 `bulk` 开关判断（`apps.js` 已有该字段） |
| 10 | `stores/desk.js` `toc` getter —— **数据契约，非代码** | `c[appId]` 本身没问题，但 `/api/desk` 只返回 `javaguide`/`jbl` 两键 | 第 5.3 步在 `server/context.js` 的 `DESK_TOC` 里加你的键即可 |

> 快速自查命令见 4.4。**最容易漏的三处**：`Palette.vue`（藏在命令面板里，不搜不到）、`Launchpad.vue`（藏在启动台的一个分支里）、`bulkChapter`（只在「整章划线」时走到）。

### 4.1 宿主表（第 1 项，改法）

```js
/* WinFrame.vue <script setup> */
import { markRaw, computed } from "vue";
import NotebookWindow from "../notebook/NotebookWindow.vue";
import JblFrame from "../shell/JblFrame.vue";
import MynotesWindow from "../mynotes/MynotesWindow.vue";

/* markRaw 必须加：组件对象被 Vue 变成响应式会触发警告，也会白白做依赖收集 */
const HOSTS = markRaw({
  javaguide: NotebookWindow,
  jbl: JblFrame,
  mynotes: MynotesWindow,
});
const Host = computed(() => HOSTS[props.win.appId] || JblFrame);
```

```vue
<!-- 模板里替掉原来的二选一 -->
<component :is="Host" :win="win" :tab="t" />
```

`wins.js` 里那个 `w.appId` 现在可以放心用 —— `component :is` 会按表派发，比 `if/else` 堆叠好得多，也使「顶层按 appId 分派」这件事重新变得显式。

### 4.2 URL → 应用（第 2、3 项，改法）

```js
/* lib/nburl.js —— 长前缀优先，避免 "/jbl" 抢走 "/jblx" */
export function appOfHref(href) {
  const h = String(href || "");
  let best = null, bestLen = -1;
  for (const a of APPS) {
    const p = a.src || "";
    if (h.startsWith(p) && p.length > bestLen) { best = a.id; bestLen = p.length; }
  }
  return best || "javaguide";   // 兜底：外壳首页/根路径归小抄
}
```

然后 `windows.js` 的 `gotoModule` / `openRecent` 都改成 `appOfHref(href)`。（注意 `nburl.js` 现在要 `import { APPS }` —— 它是纯函数模块，引入注册表不会成环。）

### 4.3 进度探针表（第 4 项，改法）

```js
/* stores/desk.js */
state: () => ({
  progress: Object.fromEntries(APPS.map((a) => [a.id, null])),
  …
}),
actions: {
  async probeDb() {
    /* 每个应用一条探针；没有进度库的应用（如纯只读的）就不登记，UI 显示「进度库未连接」 */
    const PROBES = {
      javaguide: async () => { const ov = await getJSON("/api/overview");
        return ov && typeof ov.read === "number" ? { done: ov.read, total: ov.total } : null; },
      jbl: async () => { const j = await getJSON("/api/jbl/progress");
        return j && Array.isArray(j.ids) ? { done: j.ids.length, total: 308 } : null; },
    };
    let ok = 0, got = 0;
    const ids = Object.keys(PROBES);
    for (const id of ids) {
      const r = await PROBES[id]();
      got++;
      if (r) { this.progress[id] = r; ok++; }
      if (got === ids.length) this.dbOk = ok > 0;
    }
  },
}
```

> 原实现用「两个都回来后 `settle()`」的两段式，是因为它写死了两个探针。改成上表的循环后，`settle` 那段可以整体删掉。

### 4.4 做完了自检

```bash
grep -rn '"jbl"' client/src --include=*.js --include=*.vue
grep -rn '/jbl/' client/src --include=*.js --include=*.vue
```

**目标**：剩下的命中全部是**数据**（`apps.js` 的注册项、`icons.js` 的图标键、`JBL_CHAPTER_ICONS`），**不再有逻辑分支**（`? "jbl" :` / `!== "jbl"` / `indexOf("/jbl/")`）。

---

## 第 5 步 · 服务端接线

### 5.1 形态 A（native）：只加 API，不加挂载

**路由文件**：`server/routes/mynotes.js`，照 `routes/jbl.js` 的形状：

```js
module.exports = function registerMynotesRoutes(app, ctx) {
  app.get("/api/mynotes/list", async (_req, res) => { … });
  app.post("/api/mynotes/save", async (req, res) => { … });
};
```

**三处登记**（缺一不可，少一处就是 404 / 405）：

1. `server/index.js` 顶部 `require` 并 `registerMynotesRoutes(app, ctx)`。
2. **`API_ROUTES` 闸门表**里加两条：`["/api/mynotes/list", ["GET"]]`、`["/api/mynotes/save", ["POST"]]`。
   → 这张表决定「方法不对给 405 + `Allow`，路径不对给 404，且一律 JSON」。**不登记的路由会在到达你的 handler 前就被闸门拦掉。**
3. 需要数据库的话，走 `requireDb(res)` 拿连接（见 `routes/reads.js`），并遵守 `serverError(res, e)` 的错误分级 —— **不要把数据库原文透传给客户端**。

### 5.2 形态 B（iframe）：加静态挂载

`server/statics.js` → `mountStatics()` 顶部：

```js
app.use("/mynotes", express.static(path.join(__dirname, "..", "我的笔记"), { extensions: ["html"] }));
```

**注意挂载顺序**（文件头注释里写了优先级）：`/jbl` → `/img` → `client/dist` → `/content` `/vendor` → SPA fallback。**你的挂载要放在 `client/dist` 之前**，否则会被 SPA 的 index.html 抢走。

同时更新 `server/statics.js` 的文件头注释（那里列了优先级清单）—— 保持文档与代码同步。

### 5.3 目录与搜索（可选，但侧栏依赖它）

**文件**：`server/context.js` → `DESK_TOC`。

```js
DESK_TOC = {
  javaguide: { … },
  jbl: { … },
  mynotes: {
    name: "我的笔记",
    total: N,
    chapters: [{ code, name, blurb, count, href: "/mynotes/index.html" }],
    routes: { "/mynotes/xxx.html": "01" },   // 可选：正文页 → 章号反查表，侧栏高亮用
  },
};
```

**键名（`mynotes`）必须与 `apps.js` 的 `toc` 字段一致。** 对上了，侧栏「章节」区与标题副行自动生效。

**全局搜索语料**：`buildSearchDocs(meta, jbl)` 里按同样的方式 push 你的文档（字段：`app/id/title/sub/url/kind/head/body`）。命中项的 `app` 字段会让命令面板把它归到你的应用下。

---

## 第 6 步 · 进度数据（可选）

小抄那一套（篇级盖章 ⟺ 节级划线双向联动）**不要重造**：
- 已有实现：`server/services/progress.js`（事务 + `withTx()` + 行锁 + 死锁重试）+ `routes/reads.js`。要复用就读它，别另写一份并发逻辑。
- 你的应用若要「轻量进度」（像 JBL 那样的 id 列表），照 `routes/jbl.js`：一张 `(app_key, item_id)` 表 + 整表读写。
- **表名带应用前缀**，别共用。

数据持久化的两档约定（沿用 JBL 的做法）：**MySQL 为主，localStorage 为镜像与离线后备**。连不上库时降级为「暂存本机」并提示，**不要让页面不可用**。

---

## 第 7 步 · 样式

**先读 `design-contract` 技能**，再动手。三条备忘：

1. **别改 `desk.css` 的 :root 令牌**，用即可。要新颜色先在 `:root` 加变量，别在组件里硬编码色值。
2. **窗口内的风格由你的应用自定** —— 「纸面世界」（暖、低饱和、圆角 ≤4px、无玻璃拟态）是 **JavaGuide 小抄私有**的语言，**不是产品全局风格**：JBL 就是暗色任务控制台，一条纸面规则都不吃。全局的只有外壳玻璃 + 作用域隔离 + 零外网 + 降级名单（见 `design-contract` 开头）。先决定你的应用是什么世界观，再给自己的 `<app>-scope` 写 token。
3. **深浅色只换 token 值，不加选择器** —— 新写下 `html.dark &` 之前先问：是不是本可以走变量。

---

## 第 8 步 · 构建与验收

```bash
# 1. 构建（改了 client/src 就必须做，服务端只读 dist）
npm run build:client

# 2. 重启服务（改了 server/** 就必须重启；只改前端不用）
npm start

# 3. 断言 + 截图（用法见 headless-verify 技能）
node tools/cdp-shot.mjs before.png after.png
```

**验收要覆盖的 6 件事**：

| # | 验什么 | 期望 |
| --- | --- | --- |
| 1 | Dock 出现新图标，且**不是空白** | `APP_ICONS` 已注册（第 2 步） |
| 2 | 点击 Dock 能开窗；窗口标题正确 | `apps.js` 的 `name`；会话恢复也正常 |
| 3 | 侧栏有你的模块与章节 | `modules` + `/api/desk` 的 `toc` 键（第 5.3） |
| 4 | 标签页历史前进/后退可用 | `navigate` 走的是 `wins.go` 而非 `location.href` |
| 5 | 深浅色双向跟随 | native 走 `prefs`；iframe 走桥的 `DESK_applyMode` |
| 6 | **第三个应用开着的同时，前两个仍正常** | 第 4 步的泛化真的做完了（这是最关键的一条） |

第 6 条是分水岭：**只测新应用会全绿，双开才会暴露第 4 步的漏改。**

---

## 第 9 步 · CI/CD（把新应用接进自动化链路）

### 9.0 先看清现实：本项目没有云 CI，也不该有

离线单机应用 + 依赖本机 MySQL + 仓库 265MB（含 444 页内容产物入库）—— 放云 runner 上既慢又缺依赖。所以这里的 CI/CD 是**自己实现的**：

| | 是什么 | 命令 / 位置 |
| --- | --- | --- |
| **CI** | 提交前本地预检，一条命令跑完 7 道闸 | **`npm run ci`** → `tools/preflight.mjs` |
| **CD · 本地** | 构建 + 重启服务 = 上线 | `npm run ci && npm start` |
| **CD · 远端** | 手动推 GitHub（GFW 下走 SOCKS 桥） | `tools/push.bat` |

### 9.1 七道闸，以及它们替新应用挡什么

```bash
npm run ci           # 全跑（含 vite build，约 10s）
npm run ci:fast      # --skip-build，快速跑其余六闸
npm run ci:e2e       # 追加上无头浏览器那一闸
```

> ⚠️ **`npm run ci` ≠ `npm ci`** —— 后者是 npm 自己的「按 lockfile 装依赖」命令，与本项目无关。

| 闸 | 查什么 | 对「新增子应用」的价值 |
| --- | --- | --- |
| **A** 前端构建 | `vite build` 通过 | 新组件的语法 / 导入错误（改前端最常见的失败） |
| **B** 构建产物 | `dist/index.html` 存在 + 资源带内容哈希 | 忘了构建 → 服务端 503 |
| **C** 内容自检 | `verify-links.js` 零缺陷 | 与子应用无关，防止连带回归 |
| **D** 注册表一致性 | ★ 见 9.2 | **全都在替你挡新应用最容易漏的那几处** |
| **E** 服务冒烟 | `/` `/api/meta` `/api/desk` 的形状 + **每个应用入口 URL 可达** | 静态挂载漏写 / 被 SPA fallback 抢走 |
| **F** 硬编码报告 | grep 出「按应用特判」的候选行（**不阻断**） | 提醒第 4 步没做完 |
| **G** 无头验证（`--e2e`） | 每个应用各开一窗 + 工具栏有玻璃材质 + Dock 项数 + 控制台无报错 | **唯一能验「多应用并存」的闸** |

**设计取向（重要）**：脚本**从 `APPS` 注册表读事实** —— 应用清单、入口 URL、图标键、`toc` 键全部来自 `apps.js`。所以你**加应用时 CI 自动覆盖新应用，不需要「记得也去改 CI」**。这是它和手写检查清单的根本区别。

### 9.2 闸 D 的三条「新应用专项」

| 检查 | 失败意味着什么 |
| --- | --- |
| `APP_ICONS[icon]` 与 `GLYPHS[glyph]` 双注册 | 缺一个 → **Dock 上是空白按钮 / 侧栏项没图标**（第 2 步漏了） |
| `/api/desk` 含你的 `toc` 键 | 缺 → **侧栏「章节」区是空的**（第 5.3 步漏了）。省略 `toc` 的应用会自动跳过这条 |
| 每个应用的入口 URL 可达且内容对 | native 的必须落到 SPA 壳；iframe 的**不能**是 SPA 壳（说明挂载被抢了） |

### 9.3 ★「多应用泛化就绪度」这条闸的设计很关键

第 4 步那三处硬编码（`WinFrame` 二元分发 / `appOfHref` / `desk.progress`）**在只有 2 个应用时是正确的实现，不是缺陷**。所以闸按应用数量判定，而不是「代码里有没有 `jbl` 字面量」：

> 闸 D 只判**结构性的那 3 处**（机器能可靠识别的）；第 4 步表里另外 3 处是文案 / 主题分支，由**闸 F 作为候选列出**、人来判断 —— 静态 grep 分不清「数据」与「逻辑分支」，所以它只报告不阻断。

| `APPS.length` | 闸 D 判 | 输出 |
| --- | --- | --- |
| < 3 | ✓ 通过 | `2 个应用下二元实现成立；加到第 3 个时下面 3 处必须先泛化` + 三条待办 |
| ≥ 3 | ✗ **失败** | 列出必须先泛化的具体位置 |

**这条闸存在的全部意义就是：你加第 3 个应用的那一刻，CI 立刻拦住你。** 如果按「有 `jbl` 字面量就失败」来写，CI 会在主干上永远红 —— 变成没人看的噪音，比没有更糟。

### 9.4 CD · 本地部署（三步）

```bash
npm run ci            # ① 预检全绿
npm start             # ② 重启（改了 server/** 必须重启；只改前端不用）
npm run ci:fast       # ③ 冒烟：闸 E 会把所有入口和 API 再点一遍
```

**「上线」= 构建 + 重启**，本机 `:3000` 就是生产环境。改前端后不重启也行（`dist` 被重新读了），改 `server/**` 必须重启。

### 9.5 CD · 推远端

远端 `git@github.com:3247017691/JavaGuide-Notebook.git`，分支 `main`。

#### 首选：SSH（不需要 PAT、不需要代理）

**2026-09-17 实测**：`github.com:22` **直连可用**（443 反而超时），且 `~/.ssh/config` 已把 github.com 指向
`~/.ssh/javaguide_deploy` 这把部署密钥。所以：

```bash
git push origin main          # 就这一条。实测 20MB / 189 对象，分钟内完成
```

- **不用起 SOCKS 桥，不用输 PAT** —— SSH 走 22 端口，绕开了 HTTPS 那套 GFW 麻烦。
- 只在**推小批量增量**时这么用。首次全量（含 `public/content` 444 页）会到 265MB 量级，见下面 push.bat 的耗时说明。

#### 备用：`tools/push.bat`（HTTPS 路线，HTTPS 不通时才需要）

远端若改回 HTTPS 才走这条。**改这个脚本前必读的五条**：

1. **必须先起 SOCKS→HTTP 桥**：`node tools/socks-http-proxy.js 7893`。`push.bat` 会探 `7893–7896`，一个都没起就直接退。
   为什么要桥：`github.com:443` 直连超时，而本机只有 SOCKS5 出口 —— `tools/socks-http-proxy.js` 就是那个 CONNECT→SOCKS5 适配层。
2. **PAT 交互输入、不落盘**：临时 `HOME` + `credential.helper=store`，推完 `rd /s /q` 清掉。**永远不要把 token 写进文件**（GitHub 推送保护会拦，且历史里清了也麻烦）。
3. **`http.version=HTTP/1.1` + `postBuffer=500MB` 是必需的**，不是随手调的：schannel 与 HTTP/2 在 GFW 下握手会炸。`core.bigFileThreshold=2g` 同理。
4. **耗时随数据量走**：首次全量 265MB 时是 30–40 分钟；**增量推送小得多**（本次 6 提交 / 97 文件仅 20.4MB）。中途断了直接重跑（push 是增量的）。
5. ~~脚本里写死的中文路径被 cmd 编码毁成 `?`~~ **已修复**：脚本现用 `cd /d "%~dp0.."` 按自身位置定位仓库根，不依赖中文路径、从任何 cwd 调用都能跑。**新增的教训**：cmd 批处理里写死含中文的路径，保存时的编码转换就会把它毁掉 —— 路径一律用 `%~dp0` 相对推导，别写死。

#### 推送前的三件事

1. **`pre-push` 钩子会拦**「改了 `client/src` 却没重新构建」（见 9.9）。
2. **公开仓库：先扫一遍要推的内容有没有夹带凭据**。
   ```bash
   git diff origin/main..HEAD | grep -nEi 'ghp_|github_pat_|BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}'
   ```
   注意已知的**非凭据命中**：`JBL火箭题库/tools/source.md` 里有飞书文档的 `<sheet token="…">` /
   `<whiteboard token="…">` —— 那是**内嵌资源的对象 ID**，没有该文档授权就用不了，不是密钥。
3. **别信本地的 `origin/main`** —— 先量一下真实数据量：
   ```bash
   git rev-list --objects origin/main..HEAD | git cat-file --batch-check='%(objectsize)' 
   ```
   （在**沙箱/自动化环境**里 `.git/refs/remotes/**` 可能不被持久化 → `git status` 会显示
   `main...origin/main [gone]`。判断「推上去了没有」一律以 **`git ls-remote origin refs/heads/main`** 为准，
   那是服务端权威值。）

### 9.6 `.git/hooks` 里现在有两类钩子，别搞混

- **本项目自己的**：`pre-commit`（静态预检闸）与 `pre-push`（拦「改了前端没构建」），由 `tools/install-hooks.mjs` 安装、源码在 `tools/hooks/` 受版本控制 —— 详见 9.9。
- **Qoder（另一个 AI IDE）的**：`post-commit` 与 `post-checkout` 是它的代码追踪器，与构建/验证无关。**不要误认成本项目的 CI，也不要为「清理」删掉**（不影响本项目，但会破坏那个工具的统计）。

### 9.7 要不要上云 CI？

**不建议**，按重要性排：

1. **内容产物已入库**（`public/content/` 444 页 + `public/img/`），仓库 265MB → 云 runner 光拉取就慢。
2. **服务依赖 MySQL**：闸 E 的多数项与 `/api/overview` 都要库。云上要么加 service container，要么这些闸全跳过 —— 那就只剩「能编译」，价值有限。
3. **闸 G 需要真 Chrome**：headless 能跑，但配合上两条，投入产出不划算。
4. **没有部署目标**：这个项目的「上线」是本机 3000 端口，没有可 CD 的远端。

真要做，最小可用版是**只跑闸 A + C + D**（纯静态、不启服务、不连库）—— 恰好也是与新应用最相关的那三条。

### 9.8 新增子应用时，CI/CD 上只需两件事

1. **跑 `npm run ci:e2e`** —— 它会自动把新应用纳入「每应用一窗」的断言（清单来自 `APPS`，不用改脚本）。
2. **确认闸 D 全绿**，尤其 `/api/desk 含 toc 键`。

**加应用不需要改任何 CI 配置** —— 这正是 9.1 那条「从注册表读事实」的设计意图。

### 9.9 自动化：两条 git 钩子（`npm install` 时已自动装好）

**不用手动跑** —— `package.json` 的 `prepare` 生命周期会在 `npm install` 时把 `tools/hooks/*` 装进 `.git/hooks/`：

| 钩子 | 时机 | 做什么 | 为什么**只**做这些 |
| --- | --- | --- | --- |
| `pre-commit` | 每次提交 | `npm run ci:hook`（= `--static`）：产物 / 内容 / 注册表 / 硬编码报告 | **不构建**（8s+）、**不要求服务在跑**、不开浏览器。否则「没起服务」会让每条提交都失败 —— 一条永远红的闸只会被 `--no-verify` 绕过，等于没有 |
| `pre-push` | 每次推送 | 只查一件事：`client/src` 有文件比 `client/dist` 新 → 拦下 | 服务端只读 `dist`；改了前端没构建，推上去仓库里还是旧页面**且不报任何错**。推送要 30–40 分钟（见 9.5），值得在最后一步前拦住 |

绕过：`git commit --no-verify` / `git push --no-verify`。手动重装：`npm run prepare`。

**三条安全约束**（改 `tools/install-hooks.mjs` 前必读）：

1. **绝不碰别人的钩子。** 只管理 `tools/hooks/` 里存在的文件，且**只认带 `== workbench-buildkit ` 标记的**。本仓库 `.git/hooks/post-commit` 与 `post-checkout` 是 **Qoder（另一个 AI IDE）的追踪器**，不在管理范围；万不得已要覆盖一个非本工具的钩子，会先备份成 `*.bak-<时间戳>` 并告警。
2. **不用 `core.hooksPath`。** 那会把整个 `.git/hooks` 挪到别处、**让 Qoder 那两个钩子当场失效**。所以走「往 `.git/hooks` 里放文件」这条笨但安全的路。检测到 `core.hooksPath` 被设置时，脚本**只告警，不动它**。
3. **永不失败。** 它挂在 `prepare` 上，抛错会让 `npm install` 直接失败 —— 所以 `.git` 不存在（CI / 打包 / 未 `git init`）就静默跳过，**退出码恒为 0**。

**对新应用的影响：无。** 两个钩子都从 `apps.js` 读应用清单，新应用自动纳入。

---

## 反模式清单（优雅 vs 不优雅）

| ✗ 不要 | ✓ 而要 |
| --- | --- |
| 复制 `NotebookWindow.vue` 整份再改 | 抽出它俩的共同形状（URL 解析 → 视图分发），新应用只写自己的解析函数 |
| 在 `WinFrame.vue` 里继续加 `v-else-if` | 第 4.1 的宿主表 + `<component :is>` |
| 新应用里 `location.href = …` | `wins.go(winId, href)` |
| 新应用里 `100vh` 定尺寸 | 容器查询 + `ResizeObserver` 写 `--your-h` |
| 在 `.nb-scope` 外写小抄样式 | 自己的作用域类（`.mn-scope`） |
| 桥里删掉 `window.top === window.self` 那行 | 保留 —— 独立打开能力是 B 形态的价值所在 |
| 为「只有一个页面」新建应用 | 挂进既有应用的 `modules` 或路由 |
| 忘记登记 `API_ROUTES` 闸门 | 两处都加（`index.js` 的 require/register + `API_ROUTES`） |
| 把「两个应用」当成事实继续写死 | 先泛化，再加第三个（第 4 步） |

---

## 速查：新增一个应用要碰的文件

**形态 A（native）**

```
client/src/lib/apps.js                          加注册项（唯一入口）
client/src/lib/icons.js                         GLYPHS + APP_ICONS 各加一键
client/src/components/<app>/XxxRoot.vue         新建（令牌作用域 + 尺寸探测）
client/src/components/<app>/XxxWindow.vue       新建（URL → 视图）
client/src/components/<app>/XxxHome.vue …       新建（各视图）
client/src/components/shell/WinFrame.vue        ★ 宿主表 + 侧栏/进度文案（第 4.1、表第 6 项）
client/src/lib/nburl.js                         ★ appOfHref 泛化（第 4.2）
client/src/components/shell/Palette.vue         ★ tabNew/分组归属改走 appOfHref + appById（表第 7 项）
client/src/stores/windows.js                    ★ gotoModule/openRecent/bulkChapter 改用统一函数
client/src/stores/desk.js                       ★ progress 探针表（第 4.3）
server/index.js                                 路由 require + register + API_ROUTES
server/routes/<app>.js                          新建 API
server/context.js                                DESK_TOC 加键（侧栏目录）
```

**形态 B（iframe）** 少建 Vue 组件，多这三样：

```
<子应用目录>/desk-bridge.js                     新建（照抄 JBL 那份）
<子应用目录>/index.html                         加 DESK_BRIDGE 配置 + 引入 bridge
server/statics.js                               ★ 加 /<app> 挂载（放在 client/dist 之前）
client/src/components/shell/<App>Frame.vue      复制 JblFrame.vue，换 modeKey
```

**★ = 第 4 步的泛化点。做形态 B 时**同样要处理第 4 步整节**（iframe 的应用一样走宿主表、一样要 `appOfHref` 认识它）。**

**CI 不用改**：`tools/preflight.mjs` 从 `apps.js` 读应用清单，新应用自动进闸 D / E / G。
只需跑 `npm run ci:e2e`（第 9 步），它会把新应用纳入「每应用一窗」的断言。

---

## 交付前的 Definition of Done

**先跑闸，再逐项对**：`npm run ci:e2e`（第 9 步）—— 它自动覆盖下面标 ⚙ 的项。

- [ ] ⚙ `npm run ci:e2e` 全绿（0 失败）
- [ ] ⚙ `apps.js` 有注册项，`icons.js` 两个键都有（闸 D 会查）
- [ ] ⚙ 每个应用一窗都开得出来，且互不干扰（闸 G 会查）
- [ ] ⚙ 侧栏有模块 + 章节（或有意省略 `toc`）（闸 E 会查 `/api/desk` 的键）
- [ ] Dock 图标有图形（不是空白），点开能开窗
- [ ] 标签页前进/后退/关闭/拖拽排序正常
- [ ] 深浅色双向跟随（含 `auto` 档）
- [ ] `prefers-reduced-motion` 与「降低透明度」下无异常
- [ ] 控制台无报错
- [ ] ⚙ 闸 F 列出的「按应用特判」候选，逐条确认过：是数据就放过，是逻辑分支就泛化成表
- [ ] 无外部 CDN / 字体 / 图标库引入（离线铁律）
- [ ] 会话恢复（刷新页面后窗口与标签回来了）
- [ ] 若改了 `server/**`：**重启过服务**（闸 E 验的是重启后的实例）

深水区配方（两个既有应用的完整对照、第三种形态的落地细节）见 `reference/subapp-recipes.md`。
