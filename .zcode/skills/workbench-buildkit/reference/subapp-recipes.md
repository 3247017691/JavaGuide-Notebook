# 参考 · 子应用对照配方

本项目现有两个子应用，各代表一种接入形态。**做新应用时先在这里找到最接近的那个，再对照差异。**

---

## 一、两个既有应用逐项对照

| 维度 | `javaguide`（形态 A · native） | `jbl`（形态 B · iframe） |
| --- | --- | --- |
| 注册 | `apps.js`：`native: true` | `apps.js`：无 `native`（即 iframe） |
| UI 位置 | `client/src/components/notebook/*.vue`（6 个组件） | `JBL火箭题库/*.js + *.html + *.css`（独立站点） |
| 宿主组件 | `NotebookWindow.vue` → `NotebookRoot.vue` | `shell/JblFrame.vue` |
| 令牌作用域 | `.nb-scope`（`NotebookRoot.vue` 提供） | 自己的 `notebook.css`，不依赖外壳 |
| 尺寸探测 | `ResizeObserver` 写 `--nb-h` / `--nb-w` | 无（iframe 内部是独立视口，可用 `100vh`） |
| URL 解析 | `lib/nburl.js` 的 `parseNotebookUrl()`（三种入口） | iframe 自己的路由（`index.html` / `chapter.html?c=&q=`） |
| 导航 | `wins.go(winId, href)`（进标签历史） | iframe 内部导航；`JblFrame.onLoad` 回同步 URL/历史/标题 |
| 主题下发 | 外壳 `prefs.nbMode` 写成 `.nb-scope[data-mode]` | 外壳调 `DESK_applyMode(mode, persist)` |
| 桥 | 不需要（同文档，直接读 store） | `JBL火箭题库/desk-bridge.js`（postMessage） |
| 独立可跑 | ✗ 离开外壳就没有 | ✓ `file://` 双击也能用 |
| 进度存储 | MySQL（`read_marks` + `section_reads`，两级联动） | MySQL（`jbl_mastered`）+ localStorage 镜像 |
| 静态挂载 | 无（内容走 `/read/*.html` 的 SPA fallback） | `server/statics.js`：`app.use("/jbl", …)` |
| 目录（侧栏） | `/api/desk` 的 `DESK_TOC.javaguide`（含 `routes` 反查表） | `DESK_TOC.jbl`（从 `data.js` 解析） |
| 搜索语料 | `buildSearchDocs()` 从 `articles-meta.json` 生成 | 同函数从 `JBL_DATA.chapters` 生成 |

### 共享的部分（新应用要复用的）

```
stores/windows.js      窗口 / 标签 / 历史 / 布局 / 会话持久化   —— 应用无关，直接用
stores/prefs.js        主题 / 降低透明度 / 壁纸 / 小抄字号
stores/ui.js           toast / sheet / 命令面板 / 启动台
stores/desk.js         目录 + 进度探针 + 最近打开（★ 有硬编码，见下）
components/shell/*     外壳全套（菜单栏 / Dock / 启动台 / 右键菜单 / WinFrame）
lib/icons.js           GLYPHS + APP_ICONS（★ 要加键）
lib/apps.js            注册表（★ 要加项）
```

### `stores/desk.js` 里的硬编码（新应用必改）

```js
progress: { javaguide: null, jbl: null },     // ← 改成按 APPS 生成的 map
// probeDb() 里两段 if，只探 /api/overview 与 /api/jbl/progress  // ← 改成探针表
```

改法见 `new-subapp` 技能第 4.3 节。**别忘了它还有两个容易漏的兄弟**：`Palette.vue`（3 处归属三元，见 pitfalls #36a）与 `windows.bulkChapter()`（见 pitfalls #36b）—— 全量清单以 `new-subapp` 第 4 步的表为准（8 个文件 11 处）。

---

## 二、形态 A 落地骨架（native · 从零一个新应用）

以「我的笔记」（`mynotes`）为例，最小可用集：

```
client/src/lib/apps.js                      ① 注册项
client/src/lib/icons.js                     ② GLYPHS["notebook-pen"] + APP_ICONS.mynotes
client/src/components/mynotes/
    MynotesWindow.vue                       ③ 薄壳：URL → 视图
    MynotesRoot.vue                         ④ 令牌作用域 + ResizeObserver + provide
    MynotesHome.vue                         ⑤ 首页视图
client/src/components/shell/WinFrame.vue    ⑥ ★ 宿主表 + 文案（第 4.1 节、第 4 步表第 6 项）
client/src/lib/nburl.js                     ⑦ ★ appOfHref 泛化（第 4.2 节）
client/src/components/shell/Palette.vue     ⑧ ★ tabNew/分组归属改走统一函数（表第 7 项）
client/src/stores/windows.js                ⑨ ★ gotoModule/openRecent/bulkChapter 改用统一函数
client/src/stores/desk.js                   ⑩ ★ progress 探针表（第 4.3 节）
server/index.js                             ⑪ require + register + API_ROUTES
server/routes/mynotes.js                    ⑫ API
server/context.js                           ⑬ DESK_TOC.mynotes（侧栏目录）
```

### ④ `MynotesRoot.vue` 的要点（照 `NotebookRoot.vue` 改）

三件事，一件都不能少：

```vue
<template>
  <div ref="host" class="mn-host">
    <div ref="scope" class="mn-scope" :data-mode="prefs.nbMode">
      <div class="mn-page"><slot /></div>
    </div>
  </div>
</template>
```

1. **作用域类**（`.mn-scope`）—— 隔离样式，避免漏进外壳。
2. **滚动容器**（`.mn-host`）—— 长内容自己滚，别让 `.frames` 滚。
3. **`ResizeObserver` 写实测尺寸**：

```js
ro = new ResizeObserver(() => {
  if (!scope.value) return;
  scope.value.style.setProperty("--mn-h", scope.value.clientHeight + "px");
  scope.value.style.setProperty("--mn-w", scope.value.clientWidth + "px");
});
ro.observe(scope.value);
```

**为什么必须**：窗口是绝对定位的浮动盒子，`100vh / 100vw` 算到整页，尺寸全错。容器查询 + 自定义属性是唯一正解。

再 `provide` 出 `navigate` 与 `setTitle`（照 `NotebookRoot.vue` 的 `nbNavigate` / `nbSetTitle`），让深层子组件不必层层 `props`。

### ⑤ 视图组件里的两条纪律

- 所有跳转 → `inject` 出来的 `navigate(href)`（最终落到 `wins.go`）。**永不 `location.href = …`。**
- 标题变化 → `setTitle(text)`（落到 `wins.setTabTitle`），标签栏与窗口标题才会跟着变。

---

## 三、形态 B 落地骨架（iframe · 接入一个已有独立站点）

### 1. 子应用侧（3 件事）

```html
<!-- index.html -->
<script>window.DESK_BRIDGE = { modeKey: "mynotes:mode", home: "index.html" };</script>
<script src="desk-bridge.js?v=20260917" defer></script>
```

- `desk-bridge.js` —— **照抄 `JBL火箭题库/desk-bridge.js`**（57 行），只改 `MODE_KEY` 默认值与末段「链接改道」这类应用特化项。
- **第一行必须是 `if (window.top === window.self) return;`** —— 保住「独立打开能力」。

### 2. 外壳侧（2 件事）

```js
/* server/statics.js —— 放在 client/dist 之前 */
app.use("/mynotes", express.static(path.join(__dirname, "..", "我的笔记"), { extensions: ["html"] }));
```

```js
/* client/src/lib/apps.js */
{ id: "mynotes", name: "我的笔记", src: "/mynotes/index.html", … }   // 不加 native
```

```vue
<!-- client/src/components/shell/MynotesFrame.vue —— 复制 JblFrame.vue，换 modeKey -->
```

### 3. 桥里按需增删的部分

`JBL火箭题库/desk-bridge.js` 里有几项是**应用特化**的，接新应用时逐个判断：

| 能力 | 要不要 | 说明 |
| --- | --- | --- |
| `DESK_applyMode` | **要** | 外壳下发主题的唯一入口 |
| `MutationObserver` 回报模式 | **要** | 本地切换要让外壳知道 |
| 快捷键转交 | 建议要 | 否则应用里按 Ctrl+B 等快捷键外壳收不到 |
| 链接改道 | 看情况 | JBL 的注释说「正文里没有 `href="/"` 的链接，这项不写」。若你的应用有指向外壳根路径的链接才需要 |
| `post({type:"ready"})` | **要** | 就绪握手，外壳收到后回推主题 |

---

## 四、形态 C：作为别的应用的子页（不开窗）

`JBL火箭题库/chapter.html?c=&q=` 就是这么用的：它挂在 `/jbl` 下，被 `/jbl/index.html` 链接过去，**自己不是应用**。

**判断标准**：不需要独立 Dock 图标、不需要独立窗口、不需要独立标签历史 → 就不要建应用，挂在既有应用的分支里。

**代价**：它拿不到外壳的窗口管理、侧栏、命令面板。若这些都要，那就该是形态 A/B。

---

## 五、新应用上线前的对照检查

拿这张表逐项勾，勾不完别提交：

| # | 项 | 形态 A | 形态 B |
| --- | --- | --- | --- |
| 1 | `apps.js` 注册项 | ✓ | ✓ |
| 2 | `icons.js` GLYPHS + APP_ICONS | ✓ | ✓ |
| 3 | 宿主组件 | 新建 `XxxWindow.vue` | 复制 `JblFrame.vue` |
| 4 | `WinFrame` 宿主表 + 侧栏/进度文案 | ✓ | ✓ |
| 5 | `nburl.appOfHref` 泛化 | ✓ | ✓ |
| 6 | `windows.gotoModule/openRecent/bulkChapter` | ✓ | ✓ |
| 6a | `Palette.vue` 3 处归属三元 | ✓ | ✓ |
| 7 | `desk.progress` 探针表 | 有进度才要 | 有进度才要 |
| 8 | `server/statics.js` 挂载 | ✗ | ✓ |
| 9 | `server/index.js` 路由 + `API_ROUTES` | 有 API 才要 | 有 API 才要 |
| 10 | `server/context.js` `DESK_TOC` | 要侧栏目录才要 | 同左 |
| 11 | 桥 | ✗ | ✓ |
| 12 | 作用域类 / 尺寸探测 | ✓ | ✗（iframe 独立视口） |
| 13 | **三窗同开验证** | ✓ | ✓ |
