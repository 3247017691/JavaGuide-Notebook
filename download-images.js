// 下载 image-map.json 里的 oss.javaguide.cn 图片到 public/img/（走本地代理，16 并发，失败重试 2 次）
const fs = require("fs");
const path = require("path");
const { ProxyAgent, setGlobalDispatcher } = require("undici");

const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || "http://127.0.0.1:7892";
setGlobalDispatcher(new ProxyAgent(PROXY));

const map = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "image-map.json"), "utf8"));
const OUT = path.join(__dirname, "public", "img");
fs.mkdirSync(OUT, { recursive: true });

const entries = Object.entries(map);
let done = 0, failed = 0;
const failures = [];
// 文件名（扩展名）是按原始 URL 定的，而原站有些图的扩展名和真实格式不符。
// 这里不改名（名字是构建管线的约定，build-content.js 重建时会按 URL 重新算），
// 只把不符的记录到 data/img-type-mismatch.txt；服务端会按文件头魔数修正 Content-Type。
const typeMismatch = [];
const EXT_OF = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/gif": ["gif"], "image/webp": ["webp"], "image/bmp": ["bmp"] };
function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return "image/bmp";
  return null;
}

async function fetchOne(url, local, attempt) {
  const dest = path.join(__dirname, "public", local.replace(/^\//, "").replace(/\//g, path.sep));
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return true;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error("empty");
    const real = sniff(buf);
    const ext = path.extname(dest).slice(1).toLowerCase();
    if (real && !(EXT_OF[real] || []).includes(ext)) {
      typeMismatch.push(`${local} :: 扩展名 .${ext}，实际 ${real}`);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return true;
  } catch (e) {
    if (attempt < 4) return fetchOne(url, local, attempt + 1);
    failures.push(url + " :: " + e.message);
    return false;
  }
}

async function pool(items, n, worker) {
  const q = items.slice();
  const run = async () => { while (q.length) { const it = q.shift(); await worker(it); done++; if (done % 200 === 0) console.log(`进度 ${done}/${items.length}`); } };
  await Promise.all(Array.from({ length: n }, run));
}

pool(entries, 5, async ([url, local]) => { if (!(await fetchOne(url, local, 0))) failed++; }).then(() => {
  console.log(`完成 ${done} / 失败 ${failed}`);
  if (failures.length) fs.writeFileSync(path.join(__dirname, "data", "img-failures.txt"), failures.join("\n"));
  if (typeMismatch.length) {
    fs.writeFileSync(path.join(__dirname, "data", "img-type-mismatch.txt"), typeMismatch.join("\n"));
    console.log(`扩展名与实际格式不符 ${typeMismatch.length} 张（清单 → data/img-type-mismatch.txt，服务端会按文件头纠正 Content-Type）`);
  }
});
