/*  headless Chrome CDP 截图：种子化 localStorage 会话 → 打开桌面 + 窗口，
    可选再模拟右键弹出上下文菜单，各截一张 PNG。
    用法：node tools/cdp-shot.mjs <outA.png> [outB.png] [rightClickX,rightClickY]   */
import { spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { WebSocket } from "undici";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const [outA, outB, rc] = process.argv.slice(2);
const profile = process.env.TEMP + "\\cdp-shot-profile";
rmSync(profile, { recursive: true, force: true });

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile,
  "--window-size=1680,1050", "--force-device-scale-factor=1",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 未就绪 */ }
    await sleep(300);
  }
  throw new Error("chrome devtools 未就绪");
}

const ws = new WebSocket(await targetWs());
let seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
};
await new Promise((r) => (ws.onopen = r));

const SEED = `try{localStorage.setItem('desk:session',JSON.stringify({
  order:['javaguide'], front:'javaguide',
  wins:{ javaguide:{ x:250, y:56, w:1180, h:780, i:0, noSide:0, sideW:224,
    tabs:[{ url:'/index.html', title:'首页', hist:['/index.html'], hi:0 }] } }
}))}catch(e){}`;

await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: SEED });
// 验收走 :3000 的构建产物（dist 与 dev 行为不总等价）；要截 dev 态手动改成 5173
await send("Page.navigate", { url: "http://localhost:3000/" });
await sleep(6000);

let shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(outA, Buffer.from(shot.data, "base64"));
console.log("saved", outA);

if (outB) {
  const [x, y] = (rc || "840,520").split(",").map(Number);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", {
      type, x, y, button: "right", clickCount: 1, buttons: type === "mousePressed" ? 2 : 0,
    });
    await sleep(120);
  }
  await sleep(700);
  shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(outB, Buffer.from(shot.data, "base64"));
  console.log("saved", outB);
}

ws.close();
chrome.kill();
process.exit(0);
