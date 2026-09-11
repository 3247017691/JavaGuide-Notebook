---
name: JavaGuide 离线小抄
description: 暖亚麻案面上一摞过塑索引卡——按篇幅定版面，读一篇涂一格，整章读完盖背完章
colors:
  desk: "#e7e0cd"
  desk-2: "#dbd3bf"
  desk-deep: "#c7bda4"
  desk-ink: "#565044"
  desk-ink-2: "#6f6859"
  paper: "#f9f6ee"
  paper-2: "#f0e9d8"
  paper-edge: "#dcd3be"
  paper-back: "#e2d8c0"
  paper-fold: "#c9bfa2"
  paper-toc: "#fbf8f1"
  punch-line: "#c3b89c"
  ink: "#17181a"
  ink-soft: "#3a3d3b"
  ink-faint: "#5f625d"
  red: "#b0492f"
  red-deep: "#8c3520"
  hi: "#f2e8a0"
  tip-bg: "#f6e3c8"
  danger-bg: "#f3d9d2"
  info-bg: "#dde8e2"
  scroll-thumb: "#b3aa95"
  scroll-thumb-hover: "#9a917c"
  toc-scroll-thumb: "#cfc7b2"
  toc-scroll-thumb-hover: "#b9b09a"
  ch-01: "#7a4fae"
  ch-02: "#2f6db0"
  ch-03: "#23703f"
  ch-04: "#8a5a1f"
  ch-05: "#1f6e6e"
  ch-06: "#a04818"
  ch-07: "#9a2f6d"
  ch-08: "#5a6e2f"
  ch-09: "#55606a"
  ch-10: "#2f4f8a"
  ch-11: "#8a2fb0"
  ch-12: "#8a4a7a"
  code-bg: "#17181a"
  code-fg: "#e8e6dd"
  desk-vignette: "rgba(88, 74, 44, .16)"
  sheen: "rgba(255, 255, 255, .55)"
  track: "rgba(23, 24, 26, .2)"
typography:
  display:
    fontFamily: "Kaiti SC, KaiTi, STKaiti, 楷体, cursive"
    fontWeight: 700
  band:
    fontFamily: "PingFang SC, Microsoft YaHei, 微软雅黑, Heiti SC, sans-serif"
    fontWeight: 800
  body:
    fontFamily: "Songti SC, SimSun, 宋体, Source Han Serif SC, serif"
    fontWeight: 400
    fontSize: "16px"
    lineHeight: 1.8
  mono:
    fontFamily: "Cascadia Mono, Consolas, Courier New, monospace"
    fontSize: "11.5-13.5px"
rounded:
  tick: "0.5px"
  chip: "1px"
  inline: "2px"
  control: "3px"
  card: "4px"
spacing:
  cell: "14px 14px 13px"
  deck-gap: "clamp(14px, 1.5vw, 20px)"
  section: "clamp(22px, 2.8vw, 36px)"
components:
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  stamp-btn:
    textColor: "{colors.red-deep}"
    rounded: "{rounded.control}"
  btn:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.control}"
---

# Design System: JavaGuide 离线小抄

## Overview

**Creative North Star: "The Laminated Cheat Sheet（过塑小抄）"**

整个产品是一摞摊在暖亚麻案面上的过塑索引卡：12 章 = 12 张卡，332 篇 = 卡上的 332 道刻度。纸是唯一的表面。**版面由篇幅决定**——70 篇的 Java 拿 6×2 格，8 篇的高可用拿 2×1 格，一眼看得出哪几章最厚。墨三阶锁死（ink / ink-soft / ink-faint）；朱砂只属于"已读/划掉"；荧光笔只给当前项与 ::selection；12 支章色降级为卡顶 3px 色线与编号，不再是大面积色块。

**Key Characteristics:**
- **两级进度，一处操作三处一致**：进度有两个刻度——「篇」（整篇盖章）和「节」（阅读页悬浮目录里逐节划掉）。两者**双向联动**，规则由服务端统一裁决：一篇的小节**全部**划掉会自动盖上整篇「已读」章，退掉任意一节会自动撤章；反过来整篇盖章会把这篇所有小节一起划掉，撤章则一起清空。所以无论从首页、章节页还是阅读页操作，三处讲的都是同一件事。（`read_marks` 与 `section_reads` 仍是各自的事实来源，联动只发生在写操作上，且在启动时对账一次，补齐规则上线前的历史孤岛。）
- 折角即进度：卡片右上角是一只折过来的"狗耳朵"，`--foldpx` 随完成率从 18px 长到 60px；折角画成纸背（paper-fold），带折痕投影。
- 刻度阵即格：卡底一排细竖线，一篇一道；已读落墨（ink），**读了一部分按小节完成率从下往上涂成微条**，未读是章色三成的淡痕。两行高的主课卡把刻度放大到两排，让"篇幅"占满版面。
- 三处同步：已读 = 穿孔圈落「阅」+ 波浪朱线 + 刻度涂墨，首页则是刻度涂墨 + 朱砂进度尺 + 背完章。**「读了一部分」是第三个状态**：穿孔只打虚线半圈、朱线**只画一半**（长度 = 小节完成率）、刻度上是半截微条——形状先说话，颜色只作次要信号。
- 四种笔各司其职：楷体（手写：标题/计数/印章）、黑体 800（卡名/表头/按钮）、宋体（正文）、等宽（登记数字）。

## Colors

三色纪律 + 12 支马克笔。**The Ink-Only-Three Rule**：墨色只有三阶，任何文字不许发明第四种灰。**The Pen-Red Rule**：朱砂只写"已读/划掉"，永不做按钮底色或链接常态色。

### Primary
- **朱砂** (#b0492f / #8c3520)：进度尺填充、波浪朱线、穿孔「阅」字、背完章、完成率数字。
- 案面上的朱色文字（报头那个分隔点、错误提示链接）一律用 #8c3520 —— #b0492f 在案面上只有 3.7:1。

### Secondary
- **荧光笔** (#f2e8a0)：目录当前项底色、hover 底、::selection。

### Tertiary（12 支马克笔，public/colors.js）
- 01 紫 #7a4fae · 02 蓝 #2f6db0 · 03 绿 #23703f · 04 琥珀 #8a5a1f · 05 青 #1f6e6e · 06 橙 #a04818 · 07 品红 #9a2f6d · 08 橄榄 #5a6e2f · 09 石墨 #55606a · 10 藏青 #2f4f8a · 11 紫罗兰 #8a2fb0 · 12 兰紫 #8a4a7a
- 全部 12 支在纸上都 ≥4.5:1，可安全用作编号与卡名旁的小字。章色只出现在：卡顶 3px 线、inset 顶线、编号、极淡纸染（7%）、刻度未读态（32%）、目录便签底（8%）。

### Neutral
- **案面** (#e7e0cd→#dbd3bf→#c7bda4 径向) + 极细亚麻织纹（fixed 覆盖层，4px 周期，纵向 4.2% / 横向 2.6%）+ 边缘压暗。案面上的字取 --desk-ink (#565044，5.6:1)。
- **纸** (#f9f6ee→#f0e9d8)：所有卡面；纸边 #dcd3be 做虚线与描边；折角露出的纸背 #c9bfa2→#e2d8c0。
- **墨三阶** (#17181a / #3a3d3b / #5f625d)：正文 / 次级 / 弱级，三阶在纸上都 ≥5.6:1。

## Typography

**Display / Section Font:** 楷体（圆珠笔手写声：报头标题、章名、计数、印章、批语）
**Band Font:** 黑体 800（卡名、分组标题、按钮、表头 —— 印刷表头的声音）
**Body Font:** 宋体（正文 16px/1.92，justify，单栏 780px）
**Label / Mono Font:** Consolas（编号、时间戳、百分比、页脚）

### Hierarchy
- **Masthead** (700, clamp 27-41px, .07em tracking)：报头「JavaGuide · 离线小抄」。
- **Score** (700, clamp 26-34px, tabular-nums)：总评大数字；分隔符 15px、分母 20px。
- **Card name** (800)：主课卡 clamp 20-26px、中卡 clamp 15.5-18px、窄卡 15px。
- **Read title** (700, clamp 24-34px)：文章标题。
- **Body** (400, 16px/1.92)：正文单栏 780px。
- **Label** (mono 11.5-13.5px)：编号、时间、百分比、页脚。

## Layout

**首页 bento（12 列 × 5 行）**：章节顺序不变，格子按篇幅给。`--col` / `--row` 由固定表给出，5 行每行正好填满 12 列，不留空洞：
01(2×1) 02(6×2) 03(4×2) 04(2×1) 05(4×1) 06(2×1) 07(2×1) 08(4×1) 09(2×1) 10(6×2) 11(4×2) 12(2×1)。
`≤1080px` 放弃 bento 退回两列等宽；`≤760px` 单列。骨架卡与真卡共用同一套 `--col/--row`，加载前后不跳版。

**章节卡页**：单张 920px 纸面，色带降级为 4px inset 顶线 + 编号，分组标题 3px 章色下边线；行高 2px 墨线下沿被朱砂按完成率填掉。

**阅读页**：`grid: var(--toc-w) minmax(0,1fr)`，目录卡在左（sticky，`max-height: calc(100vh - var(--pad-y)*2)`），纸面在右，总宽 min(1010px + toc + 26px, 100vw-28px)。`≤1024px` 整页塌成 block，退回"正文在上、目录在下"。目录头（`.toc h2`）下沿有一条 1.5px 墨线，**被朱砂按小节完成率从左填掉**（`scaleX(--p)`），与章节页那条 2px 线是同一种语言；旁边标 `n/m 节`，全划完转朱色（`.toc-done`）。
`≥1025px` 时版面多出第三列 `--rail-w: 40px` 给右侧导航（见「右侧导航轨」）——**导轨位置由版面算出，不手写偏移量**：正文限宽 780px、纸面 1010px，纸面右侧那条空白正好是它的位置，纸面随窗口怎么变它都贴着纸边。

## Elevation & Depth

一张纸离桌一次投影，无分层。**The One-Lift Rule**：纸面只投影一次。
`clip-path` 会把 `filter: drop-shadow` 的输出一起裁掉，所以投影必须挂在**外层 `<a>` / 容器**上，裁剪挂在**内层 `.card-paper`** 上——这是全站折角卡的结构约定。
折角自己再带一层 `drop-shadow(-1px 1px 1.4px)` 当折痕投影。

## Shapes

折角是签名轮廓：`clip-path` 折角，折过来的纸背填 `--foldpx` 正方形，`clip-path: polygon(0 0,100% 100%,0 100%)`，折痕沿裁剪边的对角线。
控件圆角 ≤4px，刻度 0.5px、小片 1px、控件 3px、纸面 4px。穿孔是 26px 正圆（虚线=未读，实线朱=已读）。无大圆角、无玻璃、无渐变文字。

## Components

### 卡（.card / .card-paper / .fold）
纸渐变 + 章色 inset 顶线 + 折角 + 刻度阵 + 计数 + 细进度语义；hover 抬起 5px、掠出过塑反光、投影加深；`data-rows="2"` 的主课卡内容垂直居中、刻度放大、计数 30px。整章读完右下落「背完」朱章（-9°，scale 2.2→1 弹入），百分比让位不再重复。

### 总评刻度尺（.tape）
12 段，`flex-grow` = 该章篇数（段宽即篇幅），段内朱砂填充 = 该章完成率。这是"首页任何数字都必须与库中状态实时一致"的最小仪表盘。

### 刻度三态（.card-ticks i / i.on / i.mid）
未读 = 章色 32%；已读 = 纯墨；**读了一部分 = `linear-gradient(to top, 墨 var(--f), 章色32%)`，`--f` = 该篇小节完成率**——一道从下往上涂到一半的微条。三态共用同一套刻度，所以"篇幅"与"进度"是一张图。

### 小节进度（.card-secs / .entry-secs / .score-secs / .toc-prog）
阅读页悬浮目录里划掉的小节，在这里汇总成数。**只在真有"半读篇"时才渲染 `.card-secs`**（否则它与上面的篇数讲的是同一件事，纯属重复）；`≤760px` 的窄卡与紧凑处不显示。章节页每行 `.entry-secs` 报 `n/m 节`，只在 `n>0` 时有内容（空壳 `.is-off` 留在 DOM 里，标记已读时就地填上，不重绘整行）。**不做进度条**：全章小节基数上千，0.5% 的条看起来是空的，反而像坏了。

### 章卡目录行（.entry）
整行是一条链接；穿孔圈（已读落朱「阅」字）+ 标题 + 小节进度 + 时间戳；右侧独立按钮只管「标记已读 / 取消已读」。**朱线长度 = 小节完成率**——挂在 `.entry-title::after` 上，用 `clip-path: inset(0 calc((1 - var(--secp)) * 100%) 0 0)` 从右往左揭出。读了一半就只画一半，整篇读完才是完整的一道波浪。（旧版是整条背景图 + 滑入动画，画不出"半条"，所以改造。）`≤760px` 时小节进度掉到标题下一行（`grid-column: 1 / -1`），挤在第三列会把纸面顶破。

### 宽表格（.md-table-wrap）
正文里 markdown 渲染出的是裸 `<table>`，窄屏会顶破纸面。`read.js` 注入正文时就地包一层可横滑的壳；外边距从表格挪到壳上，桌面端表格外观一字未变。

### 右侧导航轨（.rail / .rail-btn）
阅读页右侧留白里的三个圆形按钮：**回桌面 / 回上一级 / 回最顶端**。圆是「穿孔」在全站一贯的形状语言，图标是一笔画 SVG（房子 / 上一层箭头 / 箭到顶线），不用字符或 emoji。
- **版位靠版面算，不靠偏移量**：`≥1025px` 是 `.read-sheet` 的第三列（`grid-area: 1/3` + sticky），永远离纸边 26px；`<1025px` 那条留白会被正文吃掉（正文自己顶到纸边），改成右下角一小摞 —— 宁可压住角落，也不为了放按钮去收窄正文。两种版位共享一套按钮样式，媒体查询只改「怎么定位」。
- `position: fixed` / `sticky` 的 grid 子元素都不占轨道，所以导轨不会把 grid 挤出隐式列（这是本仓踩过的坑）。
- 已经在顶端时「回顶端」用 **opacity 收起而不是 display** —— 导轨高度不变，另外两个按钮就不会跟着跳。
- 小控件只配收紧的投影（`0 4px 9px -4px`）：纸面才配那一次大 lift，1.5px 细边配 18px 大模糊会被检测器判成 "thin border + wide shadow"。
- 动效只淡入、不动 transform —— 两种版位的 transform 不同，塞进 keyframes 会互相覆盖，也会和 `prefers-reduced-motion` 的 `animation: none` 打架。「回顶端」的平滑滚动也读 `prefers-reduced-motion`。

### 印章按钮（.stamp-btn）
阅读页右上，未读=纸底墨字，已读=朱深底白字 + 内白描边，-2° 旋转。

### 容器（.md-c）
tip=荧光底、warning=橙纸底、danger=红纸底，楷体粗题，无侧条。

### 代码块（.md-pre）
墨底 + 章色顶边 3px + -.22° 倾斜 + 柔投影；hljs 配色取纸感（暖黄/青绿/赭红）。

### 状态
骨架卡（.is-skeleton，与真卡同格位同尺寸的 shimmer）→ 有数据；API 失败给成句的 `.deck-note` / `.sheet-note`（说明问题 + 回去的路），不是一行红字。

## Do's and Don'ts

### Do:
- **Do** 让版面表达篇幅：格子大小、刻度数量、折角大小三处同源。
- **Do** 用形状记号表达状态：折 / 涂 / 穿 / 盖 / 填，颜色只作次要信号。
- **Do** 让进度只有一处事实来源、多处呈现：写操作一律经服务端联动，前端只负责把结果画成形状。任何"局部进度"都不许成为孤岛。
- **Do** 进度动效走 transform（`scaleX`）或 `clip-path`，不走 width。
- **Do** hover 反馈统一：抬起 + 归正 + 反光掠出。
- **Do** 案面上的文字换用案面墨，不照搬纸上的灰阶。

### Don't:
- **Don't** 引入第四种墨灰、第二层纸面阴影、大圆角或玻璃拟态。
- **Don't** 把朱砂用作普通强调色或链接常态色。
- **Don't** 在窄基准（全章上千节）上画进度条——0.5% 看起来就是坏的，改用数字。
- **Don't** 把投影挂在带 `clip-path` 的同一元素上（会被裁掉）。
- **Don't** 用 emoji / 图形字符充当图标（★ 为源文本内容除外）。
- **Don't** 引入外部字体、CDN 或任何运行时网络依赖。
