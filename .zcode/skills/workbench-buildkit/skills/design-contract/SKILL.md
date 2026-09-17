---
name: workbench-design-contract
description: 「面试工作台」的视觉契约 —— 样式、CSS、设计系统、令牌 / token、玻璃 / 毛玻璃 / 液态玻璃、深浅色主题、壁纸、降低透明度。讲清外壳玻璃与纸面两个世界如何共存、玻璃 token 与 blur/alpha 的真实关系、壁纸的参数化扩展点、液玻璃增强层的两处名单一致性，以及一堆「改了会出事」的禁止事项。触发词：样式、CSS、设计系统、token、令牌、玻璃、毛玻璃、液态玻璃、liquid glass、backdrop-filter、主题、深浅色、壁纸、改颜色、调透明度。
---

# 视觉契约（Design Contract）

**这份契约的存在意义**：这个项目有**两套视觉世界并存**，它们同名类（`.sheet` / `.btn`）靠作用域隔开。不知道这件事的人一改就会互相漏样式。

| | 外壳 | 小抄 / 应用正文 |
| --- | --- | --- |
| 文件 | `client/src/styles/desk.css`（约 1350 行） | `client/src/styles/nb.css`（全在 `.nb-scope` 内） |
| 世界观 | macOS 27 **液态玻璃**：菜单栏 / Dock / 窗口外壳 / 弹层 | **暖亚麻案面 + 一摞过塑索引卡** |
| 气质 | 通透、折射、弹簧动效 | 纸、墨、朱线、荧光笔 |
| 圆角 | `--r-win: 12px` / `--r-panel: 14px` | **≤ 4px** |
| 禁止 | — | 玻璃拟态、大圆角、渐变文字、外部字体/CDN |

**铁律：不要跨界。** 纸面样式不要写进 `desk.css` 的全局，玻璃样式不要写进 `.nb-scope`。新应用照此给自己的作用域（`<app>-scope`）。

第三个样式文件 `ep-mac.css` 是 **Element Plus 的 macOS 化覆盖**（`ElMessageBox` 等）。改 EP 外观改它，不要去改 `node_modules`。

---

## 一、外壳：液态玻璃

### 玻璃三档

```css
--glass-thin:  rgba(252, 251, 249, .58);   /* 菜单栏底色 / Dock / 侧栏 / 小件 */
--glass-med:   rgba(253, 252, 250, .66);   /* 窗口级 */
--glass-thick: rgba(254, 253, 251, .76);   /* 弹层：sheet / palette / 右键菜单 */
--glass-menu:  rgba(251, 250, 248, .46);   /* 右键菜单 / 下拉：比 thick 更透，能透出背后内容色 */
--glass-blur:       22px;                  /* 主模糊半径 */
--glass-blur-thick: 32px;                  /* 厚档模糊半径 */
--glass-sat:  1.8;                         /* saturate */
--glass-brd:      rgba(255, 255, 255, .8); /* 外描边 */
--glass-brd-dark: rgba(0, 0, 0, .10);
--glass-inner:    rgba(255, 255, 255, .78);/* 内高光 */
```

**深色只换值，不加选择器** —— `html.dark { … }` 里重写同一批变量。**这是全项目的硬约定**：写下 `html.dark .foo { }` 之前先问「这能不能靠变量解决」，绝大多数情况可以。

配套类（给 `backdrop-filter` 的那个）：

```css
.glass-thin  { backdrop-filter: blur(var(--glass-blur))       saturate(var(--glass-sat)); }
.glass-med   { backdrop-filter: blur(var(--glass-blur))       saturate(var(--glass-sat)); }
.glass-thick { backdrop-filter: blur(var(--glass-blur-thick)) saturate(var(--glass-sat)); }
```

### ★ 三条最容易被搞错的事实

**1. `--win-bg` 只给三处：`.frames`（内容宿主）、`.tab.on`（当前标签）、`.frame-load`/`.frame-err`（加载遮罩）。`.win` 自己是透明的。**

> `backdrop-filter` 采样的是「**元素背后已绘制的内容**」。若 `.win` 带不透明底色，工具栏 / 侧栏的玻璃背后永远只是窗口自己那层底 —— **壁纸一点都透不上来，玻璃退化成纯装饰**。这是浅色主题「看着不透」的根因，别回退。

**2. `.win-bar` / `.win-side` 必须自己带 `backdrop-filter`。**

它们只取 `--glass-thin` 的**颜色**，**没有** `glass-*` 这个类 —— 而模糊是**类**给的。漏掉的表现是：半透明色直接透到下层，**没有任何模糊兜底**，两个窗口叠放时两层文字会原样压在一起，看着像「太透了」，其实是「没材质」。修法是补材质，**不是**降透明度。

**3. 调「透不透」先动 blur，再动 alpha。**

| 症状 | 真因 |
| --- | --- |
| 背后文字与浮层文字叠成一团、可读性崩 | **blur 不够**（背后 13px 中文没被糊掉） |
| 玻璃像一块纯色塑料板 | **blur 过大**（背后全被抹平，只剩明暗） |
| 玻璃淡得看不见 | alpha 太低 |

配方是**高模糊 + 中等 alpha**：背后内容糊成**明暗色块**（那才是 vibrancy），而不是留一堆半截文字。实测 26px 时中文还会残留；32px 才干净。

**4. 菜单栏不是玻璃件。** 它是 **Tahoe 式全透明**（`background: transparent`）+ 白字 + text-shadow，靠**壁纸顶部的 scrim** 保对比。所以：

- 菜单栏**不在**「液玻璃增强」的名单里（没有材质可言）。
- **`--wp-scrim` 不能省** —— 省了菜单栏白字立刻读不出来（见第四节）。

### 降级

- `html[data-desk-opaque="1"]`：三档退成实面并摘 `backdrop-filter`（属性由 `prefs.opaque` 写）。
- `@media (prefers-reduced-transparency: reduce)`：自动同上。
- `@media (forced-colors: active)`：材质让位于可读性 —— `background: Canvas` + `border: 1px solid CanvasText`。

**新增玻璃件时，记得把它加进上面这几个降级名单** —— 漏了会表现为「降低透明度」对它失效（隐蔽）。

---

## 二、纸面世界（`nb.css`）

**全在 `.nb-scope` 作用域内**（由 `NotebookRoot.vue` 提供）。三阶墨色**锁死**，不许发明第四种灰：

```css
--ink:       #17181a;   /* 正文 */
--ink-soft:  #3a3d3b;   /* 次级 */
--ink-faint: #5f625d;   /* 弱 */
```

**朱砂 `--red: #b0492f` 只写「已读 / 划掉」** —— 它是记号，不是强调色。
案面（不是纸上）的朱色文字要用 **`--red-deep: #8c3520`**，否则对比度只有 3.7:1。

**荧光笔 `--hi: #f2e8a0`** 只给：当前目录项、hover 底、`::selection`。

**12 支章色**只允许出现在五处：卡顶 inset 线、编号、7% 纸染、刻度未读态(32%)、目录便签底(8%)。**永远不做大面积色块。**

**禁止清单**：玻璃拟态、大圆角（>4px）、渐变文字、外部字体、CDN。**全站零外网依赖**是产品级硬约束。

---

## 三、壁纸（参数化，加一套只要两处）

壁纸是**纯 CSS 画的**（离线、跟主题联动、能和底衬球一起流动）。14 个 token 一组：

```css
--wp-scrim / --wp-halo / --wp-shade          /* 顶部暗角 + 两团光 */
--wp-halo-pos / --wp-shade-pos               /* 两团光的位置 */
--wp-b1 --wp-b2 --wp-b3 --wp-b4              /* 4 段底色（必须有明暗/色相跨度） */
--wp-rib-a … --wp-rib-e                      /* 5 支缎带色（折叠绸的光） */
```

- 浅色档写在 `:root`（默认「暖贝」），深色档写在 `html.dark`。
- 其余各套用 `html[data-desk-wall="<id>"]` 与 `html.dark[data-desk-wall="<id>"]` **覆盖值，不碰任何选择器**。

**加第 5 套壁纸 = 两处**：

1. `client/src/stores/prefs.js` 的 `WALLS` 加一条（`id` / `name` / `chip` 色片预览渐变）
2. `client/src/styles/desk.css` 加两块 token（浅色 + 深色）

选择器、设置面板 UI、持久化**全部自动就位**。

**两处硬前提**（写在 `desk.css` 199 行的注释里，别删）：

1. **顶部 scrim 不能省** —— 菜单栏全透明 + 白字，全靠它保对比。
2. **底色必须有明暗 / 色相跨度，不能接近纯色**。玻璃的通透感来自「**背后有没有东西可透**」：壁纸越平，玻璃越像塑料板。

> 这解释了为什么 `参考/macOS27.jpg` 那么通透而本项目暖贝壁纸下怎么调都不像 —— **参考图背后是深色照片，不是白纸**。这是物理前提，不是参数问题。**别再为它反复调参**，换套深色壁纸（`abyss` / 深海）比继续调 blur 有效得多。

---

## 四、液玻璃增强（可整体关闭）

四件事：**流动底衬 blob / 追踪高光 / 边缘色散 / 点击涟漪**。

**总开关**：`html[data-desk-liquid="1"]`。属性由 `client/src/lib/liquid.js` 写，**只在系统未要求减少动效时**才写。

→ 于是退化是**自动的、零 JS 分支**：无 JS / 老浏览器 → 整段不匹配；`prefers-reduced-motion` → 属性不写；触屏 / 强制高对比色 → 段末媒体块摘掉装饰层。

**★ 两处名单必须一致**（改一边就必须改另一边，这是最容易漏的维护点）：

```
.dock .win-bar .win-side .ctx-pop .palette .sheet-scrim .sheet .desk-toast .widget .lp-panel .lp-search .d-tip
```

出现在：**追踪高光**（`background-image` 的 radial-gradient）与 **边缘色散**（`::before/::after`）两处。

**故意不在名单里的两个**：菜单栏（全透明，无材质）与窗口正文（不透明 `--win-bg`，本来就该压住下层保可读）。

### 这一节的四个坑（改之前必读）

1. **`.wallpaper::before/::after` 已被折叠绸的两条缎带占用** → blob 只能做成**真子元素**；又因为定位元素里 `::after` 在绘制顺序上排在所有子元素之后，blob 必须显式 `z-index: 1` 才浮在缎带之上。

2. **`backdrop-filter` 不能被伪元素继承** —— 伪元素里没有「背后的内容」，**真折射采样做不了**。所以色散只做在**玻璃切边上**（厚边 + 掠射角，正好是色差最该出现的位置），画法是 `padding` 撑环厚 + 双层 mask 求差（`mask-composite: exclude` / `-webkit-mask-composite: xor`）把中间挖空，两个伪元素各 `hue-rotate(±90deg)` 再反向平移 0.6px。

3. **补了 5 个 `position: relative`**：`.dock` / `.win-bar` / `.sheet-scrim .sheet` / `.widget` / `.lp-panel` 原本**都不是定位元素**。不补的话，绝对定位的色散伪元素会去找更外层祖先，**彩环会画满整个窗口**。

4. **装饰层必须有 `display: none` 兜底**（`.wallpaper .blob` / `.rip-layer` / `.ripple`）：属性被摘掉时它们会退化成无样式裸元素，而 `.dock` / `.win-bar` / `.sheet` **全是 flex 容器** —— 一个裸 `<span>` 插进去就多一个 flex item，**版面当场歪掉且无任何报错**。

补充两条动画规范：`@keyframes` 的 **0% / 100% 必须是干净的静止态**（正圆、无位移）—— 因为 reduced-motion 的兜底会停在 100% 那一帧；`border-radius` 四角要**两两配平**（对角相等），否则形变退化成椭圆。

---

## 五、改样式的正确流程

1. **先定位到世界**：外壳玻璃 → `desk.css`；纸面 / 应用正文 → 该应用的作用域样式。
2. **能用变量就不要新写选择器**。深浅色是「换值」不是「换规则」。
3. **新增一个玻璃件**，要同时做四件事：写好 `background` + `backdrop-filter`；加进液玻璃名单（两处）；加进 `data-desk-opaque` 降级名单；若是 `position: static` 还要补 `relative`（色散用）。
4. **改完必须 `npm run build:client`**，然后按 `headless-verify` 技能**逐档看图**（浅色 / 深色 / reduced-motion）。
5. **看图看两遍**：整体看版面与层次，放大图看细节（色散边、透明度）。放大图会夸大重叠，结论回 1x 复核。

## 六、禁止事项（一句话清单）

| ✗ | 为什么 |
| --- | --- |
| 给 `.win` 加不透明背景 | 玻璃立刻失去意义（采不到壁纸） |
| 只写 `background: var(--glass-*)` 不写 `backdrop-filter` | 那是「半透明色」不是「玻璃材质」，叠窗时文字直接压一起 |
| 用降 alpha 来解决「太透」 | 真因多半是 blur 不够；降 alpha 只会让玻璃更糊更看不清 |
| 在 `.nb-scope` 外写小抄样式 | 与外壳同名类互漏 |
| 纸面用玻璃拟态 / 大圆角 / 渐变文字 | 违反纸面世界观 |
| 引入外部字体 / 图标库 / CDN | 全站零外网依赖是硬约束 |
| 只改液玻璃名单的其中一处 | 高光与色散不一致，一半有效果 |
| 新增壁纸时用新的选择器结构 | 参数化就是为了「只加两块 token」 |
| 为「让菜单像参考图那样通透」反复调参 | 物理前提不满足（背后不是深色照片），不是参数问题 |
