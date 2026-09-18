/*  多档视觉矩阵探针：一个无头 Chrome 跑完所有「档位 × 视图」，每档截图 + 计算样式断言
    + 数据绑定断言（渲染文本 vs /api）+ 控制台/网络错误收集。
    用法：
      node tools/cdp-scenes.mjs                     # 全 15 档 → $TEMP/wb-verify/
      node tools/cdp-scenes.mjs --scenes 01,05,15   # 只跑编号前缀匹配的档
      node tools/cdp-scenes.mjs --zoom              # 看板档追加 2x 局部放大图
      node tools/cdp-scenes.mjs --url http://localhost:3000/ --chrome "C:\...\chrome.exe"
    前提：目标服务已在跑（npm start）。换档不换 Chrome：种子脚本靠
    Page.removeScriptToEvaluateOnNewDocument 摘掉上一档的，别让它累积。          */
import { spawn } from "node:child_process";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { WebSocket } from "undici";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? (argv[i + 1] || "1") : d; };
const has = (k) => argv.indexOf("--" + k) >= 0;

const CHROME = opt("chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
const PORT = Number(opt("port", "9336"));
const URL = opt("url", "http://localhost:3000/");
const OUT = opt("out", (process.env.TEMP || "/tmp") + "/wb-verify");
const ZOOM = has("zoom");
mkdirSync(OUT, { recursive: true });
const profile = OUT + "-profile";
rmSync(profile, { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tab = (url, title, hist) => ({ url, title, hist: hist || [url], hi: 0 });
const HOME = "/index.html";
const READ = "/read/java/basis/java-basic-questions-01.html";
const CHAP = "/chapter.html?c=02";
const JBL = "/jbl/index.html";

const jgHome = (rect) => Object.assign({ i: 0, noSide: 0, sideW: 226, tabs: [tab(HOME, "桌面卡阵")] }, rect);
const jgRead = (rect) => Object.assign({ i: 0, noSide: 0, sideW: 240, tabs: [tab(READ, "Java 基础常见面试题（上）")] }, rect);
const jgTabs = (rect) => Object.assign({
  i: 1, noSide: 0, sideW: 240,
  tabs: [tab(HOME, "桌面卡阵"), tab(READ, "Java 基础常见面试题（上）", [HOME, READ]), tab(CHAP, "02 Java", [HOME, CHAP])],
}, rect);
const jbl = (rect) => Object.assign({ i: 0, noSide: 0, sideW: 210, tabs: [tab(JBL, "JBL 火箭题库")] }, rect);
const sess = (wins, order, front) => ({ v: 2, order, front, wins });
const ONE = (w) => sess({ javaguide: w }, ["javaguide"], "javaguide");
const TWO = (a, b) => sess({ javaguide: a, jbl: b }, ["javaguide", "jbl"], "jbl");

const SCENES = [
  { name: "01-light-home", prefs: { theme: "light", wall: "linen" }, sess: ONE(jgHome({ x: 250, y: 40, w: 1180, h: 800 })) },
  { name: "02-dark-home", prefs: { theme: "dark", wall: "abyss" }, sess: ONE(jgHome({ x: 250, y: 40, w: 1180, h: 800 })) },
  { name: "03-light-read", prefs: { theme: "light", wall: "linen" }, sess: ONE(jgRead({ x: 230, y: 34, w: 1240, h: 830 })) },
  { name: "04-dark-read", prefs: { theme: "dark", wall: "abyss" }, sess: ONE(jgRead({ x: 230, y: 34, w: 1240, h: 830 })) },
  { name: "05-light-tabs", prefs: { theme: "light", wall: "linen" }, sess: ONE(jgTabs({ x: 230, y: 34, w: 1240, h: 830 })) },
  { name: "06-stack-dark", prefs: { theme: "dark", wall: "abyss" }, sess: TWO(jgHome({ x: 120, y: 30, w: 1120, h: 760 }), jbl({ x: 400, y: 170, w: 1000, h: 660 })) },
  { name: "07-stack-light", prefs: { theme: "light", wall: "linen" }, sess: TWO(jgHome({ x: 120, y: 30, w: 1120, h: 760 }), jbl({ x: 400, y: 170, w: 1000, h: 660 })) },
  { name: "08-wall-dusk", prefs: { theme: "light", wall: "dusk" }, sess: ONE(jgHome({ x: 250, y: 40, w: 1180, h: 800 })) },
  { name: "09-wall-moss", prefs: { theme: "dark", wall: "moss" }, sess: ONE(jgHome({ x: 250, y: 40, w: 1180, h: 800 })) },
  { name: "10-palette", prefs: { theme: "light", wall: "linen" }, sess: ONE(jgHome({ x: 250, y: 40, w: 1180, h: 800 })),
    keys: [{ mod: 2, key: "k", code: "KeyK", vk: 75 }], type: "Java" },
  { name: "11-palette-dark", prefs: { theme: "dark", wall: "abyss" }, sess: ONE(jgHome({ x: 250, y: 40, w: 1180, h: 800 })),
    keys: [{ mod: 2, key: "k", code: "KeyK", vk: 75 }] },
  { name: "12-launchpad", prefs: { theme: "light", wall: "linen" }, sess: ONE(jgHome({ x: 250, y: 40, w: 1180, h: 800 })),
    keys: [{ mod: 10, key: "A", code: "KeyA", vk: 65 }] },
  { name: "13-jbl-light", prefs: { theme: "light", wall: "linen" }, sess: sess({ jbl: jbl({ x: 230, y: 34, w: 1240, h: 830 }) }, ["jbl"], "jbl") },
  { name: "14-opaque-dark", prefs: { theme: "dark", wall: "abyss", opaque: 1 }, sess: ONE(jgHome({ x: 250, y: 40, w: 1180, h: 800 })) },
  { name: "15-reduced", prefs: { theme: "light", wall: "linen" },
    sess: TWO(jgHome({ x: 120, y: 30, w: 1120, h: 760 }), jbl({ x: 400, y: 170, w: 1000, h: 660 })),
    media: [{ name: "prefers-reduced-motion", value: "reduce" },
            { name: "prefers-reduced-transparency", value: "reduce" }] },
  { name: "16-opaque-light", prefs: { theme: "light", wall: "linen", opaque: 1 }, sess: ONE(jgHome({ x: 250, y: 40, w: 1180, h: 800 })) },
];

/* 计算样式断言：材质在不在、降级零不零残留、有没有破图与横向溢出 */
const PROBE = `(() => {
  const q = (s) => document.querySelector(s);
  const cs = (el, p) => (el ? getComputedStyle(el)[p] : null);
  const h = document.documentElement;
  const dock = q('.dock'), w = q('.win.active') || q('.win');
  const blob = q('.wallpaper .blob'), rip = q('.rip-layer');
  const imgs = [...document.images];
  const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0);
  return {
    theme: h.dataset.deskTheme, wall: h.dataset.deskWall, opaque: h.dataset.deskOpaque,
    liquid: h.dataset.deskLiquid || 'none', nbMode: h.dataset.nbMode || 'none',
    wins: document.querySelectorAll('.win').length,
    winBg: w ? cs(w, 'backgroundColor') : null,
    dockBlur: cs(dock, 'backdropFilter'), barBlur: cs(q('.win-bar'), 'backdropFilter'),
    sideBlur: cs(q('.win-side'), 'backdropFilter'),
    blobDisplay: blob ? cs(blob, 'display') : 'absent', ripDisplay: rip ? cs(rip, 'display') : 'absent',
    dockPos: cs(dock, 'position'),
    imgs: imgs.length, imgsBroken: broken.length,
    brokenSrc: broken.slice(0, 5).map((i) => i.getAttribute('src')),
    hOverflow: document.documentElement.scrollWidth > window.innerWidth + 1
      ? document.documentElement.scrollWidth + '>' + window.innerWidth : 'none',
  };
})()`;

/* 数据绑定断言：渲染出来的数字必须与 /api 一致。
   Vue 生产构建会剥掉「模板引用未定义」的警告，0/332 这类「落回兜底值」的 bug
   在 dist 上零报错零警告，只有这条断言（或肉眼）能抓。 */
const DATA_PROBE = `(async () => {
  const num = document.querySelector('.score-num');
  if (!num) return { skip: '视图里没有 .score-num' };
  const ov = await (await fetch('/api/overview')).json();
  const pct = document.querySelector('.score-pct');
  return {
    rendered: num.textContent.replace(/\\s+/g, ''),
    expected: ov.read + '/' + ov.total,
    pctRendered: pct ? pct.textContent.trim() : null,
    pctExpected: ov.pct.toFixed(1) + '%',
  };
})()`;

const ZOOM_CLIPS = [
  { name: "z-header", clip: { x: 900, y: 160, width: 540, height: 140 } },
  { name: "z-card01", clip: { x: 490, y: 340, width: 470, height: 240 } },
  { name: "z-dock", clip: { x: 700, y: 960, width: 280, height: 90 } },
  { name: "z-widgets", clip: { x: 0, y: 40, width: 220, height: 460 } },
];

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile,
  "--window-size=1680,1050", "--force-device-scale-factor=1",
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "about:blank",
], { stdio: "ignore" });

async function targetWs() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* 未就绪 */ }
    await sleep(300);
  }
  throw new Error("chrome devtools 未就绪（端口 " + PORT + "）");
}

const ws = new WebSocket(await targetWs());
let seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});

const noise = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") {
    noise.push("JS异常: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    noise.push("console.error: " + m.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 200));
  }
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    noise.push("log: " + m.params.entry.text.slice(0, 160) + " " + (m.params.entry.url || ""));
  }
  if (m.method === "Network.loadingFailed") {
    noise.push("网络失败: " + m.params.errorText + " " + m.params.type);
  }
};
await new Promise((r) => (ws.onopen = r));

await send("Runtime.enable");
await send("Log.enable");
await send("Network.enable");
await send("Page.enable");

/* 换档不换 Chrome：上一档的种子脚本必须摘掉，否则多段种子叠加、后写的被先写的盖住 */
let initId = null;
async function seed(sessObj, prefs) {
  if (initId) { try { await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: initId }); } catch { /* 忽略 */ } }
  const src = `try{
    localStorage.setItem('desk:session', ${JSON.stringify(JSON.stringify(sessObj))});
    localStorage.setItem('desk:prefs', ${JSON.stringify(JSON.stringify(prefs || {}))});
  }catch(e){}`;
  initId = (await send("Page.addScriptToEvaluateOnNewDocument", { source: src })).identifier;
}

const filter = opt("scenes", "");
const wanted = filter ? filter.split(",").map((s) => s.trim()).filter(Boolean) : null;
const list = SCENES.filter((s) => !wanted || wanted.some((w) => s.name.startsWith(w)));
if (!list.length) { console.error("没有匹配的档位：" + filter); process.exit(1); }

const summary = [];
for (const sc of list) {
  noise.length = 0;
  await send("Emulation.setEmulatedMedia", { features: sc.media || [] });
  await seed(sc.sess, sc.prefs);
  await send("Page.navigate", { url: URL });
  await sleep(6500);

  for (const k of sc.keys || []) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", modifiers: k.mod, key: k.key, code: k.code,
      windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
    await send("Input.dispatchKeyEvent", { type: "keyUp", modifiers: k.mod, key: k.key, code: k.code,
      windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
    await sleep(600);
  }
  if (sc.type) { await send("Input.insertText", { text: sc.type }); await sleep(1200); }

  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${sc.name}.png`, Buffer.from(shot.data, "base64"));
  if (ZOOM && /home/.test(sc.name)) {
    for (const c of ZOOM_CLIPS) {
      const z = await send("Page.captureScreenshot", { format: "png", clip: Object.assign({ scale: 2 }, c.clip) });
      writeFileSync(`${OUT}/${sc.name}-${c.name}.png`, Buffer.from(z.data, "base64"));
    }
  }

  const r = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
  const d = await send("Runtime.evaluate", { expression: DATA_PROBE, returnByValue: true, awaitPromise: true });
  const data = d.result.value || {};
  data.ok = data.skip ? true : (data.rendered === data.expected && data.pctRendered === data.pctExpected);
  const errs = noise.slice(0, 8);
  summary.push({ scene: sc.name, probe: r.result.value, data, errors: errs });
  console.log("✓", sc.name, "wins=" + r.result.value.wins, "errs=" + errs.length,
    data.skip ? "" : (data.ok ? "data=ok" : `data=MISMATCH ${data.rendered}≠${data.expected}`));
}

writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
console.log("\n=== 汇总 ===");
let bad = 0;
for (const s of summary) {
  const p = s.probe;
  const blurOk = p.dockBlur !== "none" && p.barBlur !== "none" && p.sideBlur !== "none";
  const solidOk = p.dockBlur === "none" && p.barBlur === "none" && p.sideBlur === "none";
  const expectSolid = /^(14|15|16)/.test(s.scene);
  const matOk = expectSolid ? solidOk : blurOk;
  if (!matOk || p.imgsBroken || p.hOverflow !== "none" || s.errors.length || !s.data.ok) bad++;
  console.log(`${s.scene}: theme=${p.theme} wall=${p.wall} liquid=${p.liquid} wins=${p.wins} ` +
    `材质=${matOk ? "ok" : "与档位不符"} blob=${p.blobDisplay} img=${p.imgs}/${p.imgsBroken}破 ` +
    `溢出=${p.hOverflow} 数据=${s.data.ok ? "ok" : "MISMATCH"} errs=${s.errors.length}`);
}
console.log(bad ? `\n✗ ${bad} 档有问题，看 ${OUT}/summary.json` : "\n✓ 全档通过");
ws.close();
chrome.kill();
process.exit(bad ? 1 : 0);
