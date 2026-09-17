---
name: workbench-headless-verify
description: 用无头 Chrome + CDP 验证「面试工作台」的前端改动 —— 截图、断言、回归、视觉验收、深浅色与减少动效模拟。含种子化会话开窗、媒体特性模拟、截图污染陷阱、本机代理与 coreutils 坑，以及 HTTP 缓存语义的验证方式。触发词：验证、验一下、截图、无头、headless、CDP、Chrome DevTools Protocol、断言、回归测试、视觉验收、screenshot、看看效果。
---

# 无头验证（Headless Verify）

**原则**：**数字对不代表好看，好看不代表对。** 两者都要 —— 先跑断言拿事实，再截图看观感。

本项目没装 Playwright / Puppeteer / jsdom（jsdom 无 layout，验不了滚动与 `backdrop-filter`），所以走**本机 Chrome + 裸 CDP**。参考实现就在仓库里：`tools/cdp-shot.mjs`（约 90 行，读它比读本文更快；它固定截 `http://localhost:3000/` 的构建产物）。

---

## 一、起验证环境

**两个进程**：目标服务 + 无头 Chrome。

```bash
# 1. 目标服务（改过 server/** 必须先重启）
npm start                       # → http://localhost:3000

# 2. 无头 Chrome，开调试端口
"C:/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless=new --remote-debugging-port=9333 \
  --user-data-dir="$TEMP/wb-verify-profile" \
  --window-size=1680,1050 --force-device-scale-factor=1 \
  --no-first-run --no-default-browser-check --disable-extensions --hide-scrollbars \
  about:blank
```

**要点**：

- `--user-data-dir` **每次换一个临时目录**（或在启动前删掉）。复用会拿上次的 localStorage，让「种子化」失效 → 你会看到上一次的窗口布局。
- `--force-device-scale-factor=1`：否则截图是 2x，像素坐标断言全偏。
- **验的是 `:3000` 的构建产物**。`dev:client` 的 5173 只适合快速看，最终验收走 3000（dist 与 dev 行为不总等价）。

---

## 二、怎么跟 Chrome 说话

连 `/json/list`，取 `type === "page"` 的 target 的 `webSocketDebuggerUrl`：

```js
const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
const ws = new WebSocket(page.webSocketDebuggerUrl);   // Node 22 内置 WebSocket，够用
```

> `tools/cdp-shot.mjs` 用的是 `undici` 的 `WebSocket`（根依赖里就有）。**两者都行**：内置的省依赖，undici 的与既有代码一致。选一个别混。

一个最小的命令封装：

```js
let seq = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
};
await new Promise((r) => (ws.onopen = r));
```

---

## 三、★ 种子化会话（开窗的关键）

新 profile 打开的是**空桌面**。要验窗口内的东西，必须先塞 `desk:session`，**而且要在 `Page.navigate` 之前**注入：

```js
await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: SEED });
await send("Page.navigate", { url: "http://localhost:3000/" });
await sleep(5000);                      // SPA 挂载 + 会话恢复（恢复本身有 90ms/窗 的错峰）
```

**`desk:session` 的结构**（由 `stores/windows.js` 的 `saveSession()` 写、`restoreSession()` 读）：

```js
const SEED = `try{localStorage.setItem('desk:session',JSON.stringify({
  v: 2,
  order: ['javaguide'],                       // 打开顺序
  front: 'javaguide',                         // 哪个在前
  wins: {
    javaguide: {
      x: 250, y: 56, w: 1180, h: 780,         // rect（左上角坐标以菜单栏下沿为原点，菜单栏高 28px）
      i: 0, noSide: 0, sideW: 224,            // 当前标签、侧栏开关与宽度
      tabs: [{ url: '/index.html', title: '首页', hist: ['/index.html'], hi: 0 }],
    },
  },
}))}catch(e){}`;
```

**两窗叠放**（复现「玻璃有没有模糊」这类层间问题必需）：在 `wins` 里再放一个 `jbl`，坐标**故意压住第一个窗的侧栏区**：

```js
jbl: { x: 180, y: 120, w: 900, h: 620, i: 0, noSide: 0, sideW: 200,
       tabs: [{ url: '/jbl/index.html', title: 'JBL', hist: ['/jbl/index.html'], hi: 0 }] },
```

`order: ['javaguide','jbl'], front: 'jbl'` → jbl 在上，压住 javaguide。

**偏好也可以种子化**（`desk:prefs`，由 `stores/prefs.js` 读）：

```js
localStorage.setItem('desk:prefs', JSON.stringify({ theme: 'dark', opaque: 1, wall: 'abyss', sideW: 226 }));
```

字段：`theme: 'auto'|'light'|'dark'`、`opaque: 0|1`、`wall: 'linen'|'abyss'|'dusk'|'moss'`、`sideW`。

---

## 四、断言与截图

```js
const r = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
console.log(r.result.value);

const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
```

**断言要写成一段返回对象的表达式**，一次拿全，别来回几十次 `Runtime.evaluate`：

```js
const PROBE = `(() => {
  const dock = document.querySelector('.dock');
  const w = document.querySelector('.win');
  const cs = (el, p) => el ? getComputedStyle(el)[p] : 'none';
  return {
    liquid: document.documentElement.dataset.deskLiquid || 'none',   // 液玻璃总闸
    wins: document.querySelectorAll('.win').length,
    winClass: w ? w.className : '',
    winDisplay: cs(w, 'display'),
    dockPos: cs(dock, 'position'),          // 应为 relative（增强层依赖它）
    dockBlur: cs(dock, 'backdropFilter'),
    wall: document.documentElement.dataset.deskWall,
    theme: document.documentElement.dataset.deskTheme,
  };
})()`;
```

**真鼠标事件**（悬停高光、点击涟漪必须真事件才触发 —— `element.click()` 不带坐标）：

```js
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
await sleep(120);   // 趁涟漪还在扩散时截图/断言
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
```

---

## 五、媒体特性模拟（深浅色 / 减少动效 / 降低透明度）

```js
await send("Emulation.setEmulatedMedia", {
  features: [
    { name: "prefers-color-scheme", value: "dark" },        // prefs 默认 auto 会跟随系统
    { name: "prefers-reduced-motion", value: "reduce" },
    { name: "prefers-reduced-transparency", value: "reduce" },
  ],
});
```

**必须放在 `Page.navigate` 之前**，媒体查询是在文档加载时求值的。

**验降级时最该断言的四项**：开关属性消失（如 `data-desk-liquid === 'none'`）、装饰层 `display: none`、**为增强而补的定位失效**（如 `dockPos === 'static'`）、伪元素 `content === 'none'`。全为真才说明**零残留**，而不是「只是没看出来」。

---

## 六、★ 四条踩过的坑（会误判成代码 bug）

### 1. 探测动作会污染截图

**在 Dock 中心按下会触发应用切换/最小化** —— 截图里窗口凭空消失，`wins: 0`，极像代码 bug。（本项目真发生过：一度以为增强层把窗口搞没了，实际是探测点错了。）

**规则**：截图前**先拍一张「什么都没动」的 pre 图**；要制造点击就用**无副作用的落点**：

- ✓ 窗口**标题栏中段**（单击无副作用，双击才最大化）
- ✗ Dock 图标（切换/最小化）
- ✗ 窗口控制按钮（关闭/最小化/缩放）

### 2. 别用 `animationName` 判断 reduced-motion 是否生效

全局兜底改的是 `animation-duration`（`.01ms` + 一次性迭代），**`animationName` 仍是原名** → 会误报「没生效」。要测就测：

```js
getComputedStyle(el).animationDuration      // 或
document.documentElement.dataset.deskLiquid // 属性在不在
```

### 3. 验 HTTP 缓存（ETag/304）与 Range 语义要用 `http.request`

**Node 的 `fetch`（undici）会把正确的 304 报成 200** → 你会得出「没走缓存」的错误结论。用 `require('http').request` 看原始 `statusCode` 与响应头。

### 4. 本机环境两条

- **Bash 里 curl 本地必须加 `--noproxy '*'`**：全局代理会把 `localhost` 变成 502 —— 那是代理报的错，不是服务挂了。
- **shell 偶发缺 coreutils**（`ls`/`cat`/`head` 报 not found）→ 用**绝对路径 node 跑内联脚本**，最稳：

```bash
"C:/Users/谢晨/.workbuddy/binaries/node/versions/22.22.2-3/node.exe" -e "
const fs=require('fs');
console.log(fs.readdirSync('D:/AAA-课程资料/面试资料/client/src').join(' '));
"
```

---

## 七、一次完整的验证流程

```bash
# 1. 构建 + 起服务
npm run build:client && npm start

# 2. 起无头 Chrome（临时 profile）
#    …见第一节…

# 3. 跑探测脚本：pre 截图 → 断言 → 真鼠标 → 断言 → after 截图
"<node>" probe.mjs "http://localhost:3000/" "out/pre" --win

# 4. 换档重跑
"<node>" probe.mjs "http://localhost:3000/" "out/dark" --win --dark
"<node>" probe.mjs "http://localhost:3000/" "out/rm"   --reduced

# 5. 收工：杀掉 Chrome 与临时 profile
```

**建议的目录约定**（别把临时产物写进仓库 —— 根目录那几张 `_shot-*.png` 就是这么来的）：

```
$TEMP/wb-verify/
  ├─ probe.mjs          探测脚本（一次写好，后续只改 URL 与档位）
  ├─ pre.png            没动过的干净版面
  ├─ after.png          操作后
  ├─ dark.png / dark-zoom.png
  └─ reduced.png
```

**看图的顺序**：先看整体（版面有没有塌、层次对不对），**再看放大图**（色散边、玻璃透不透这类细节在 1x 下看不出来）。放大图会夸大重叠问题，**结论要回到 1x 复核**。

---

## 八、验证清单

- [ ] `pre` 图：版面完整（菜单栏 / widgets / 窗口 / Dock 都在）
- [ ] 窗口 `winClass` 含 `active`，`winDisplay: flex`，`dockMinis: 0`（没有被误最小化）
- [ ] 断言的核心属性符合预期（不是「看起来对」）
- [ ] 深浅色两档都看过图
- [ ] `prefers-reduced-motion` / `prefers-reduced-transparency` 降级**零残留**
- [ ] 改动涉及叠层时：**两窗叠放**验过
- [ ] 截图里没有「凭空消失的窗口」这类探测污染
- [ ] 若验的是缓存 / Range：用的是 `http.request` 而非 `fetch`
