// 校验 public/content 里的站内链接质量（每次 build-content.js 之后跑一遍）
//   node verify-links.js
// 检查三件事：
//   1. 还有多少 javaguide.cn 外链（理想值：只剩这个仓库里确实没有的页面）
//   2. 每条 /read/*.html 是否都有对应文件（落点缺失 = 点了 404）
//   3. 链接带 #锚点 时，目标页是否真有这个 id（对不上 = 点了不滚动）
const fs = require("fs");
const path = require("path");

const CONTENT = path.join(__dirname, "public", "content");

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".html")) acc.push(p);
  }
  return acc;
}
const files = walk(CONTENT);
const pageOf = (f) => "/read/" + path.relative(CONTENT, f).replace(/\\/g, "/");
const exist = new Set(files.map(pageOf));

// 每页的 id 集合（锚点校验用）
const ids = new Map();
for (const f of files) {
  const set = new Set();
  const h = fs.readFileSync(f, "utf8");
  const re = /\sid="([^"]+)"/g;
  let m;
  while ((m = re.exec(h))) set.add(m[1]);
  ids.set(pageOf(f), set);
}

// 与 server.js 的阅读壳页路由保持一致。这里必须拿**浏览器实际发出的形态**去测：
// 非 ASCII 路径会被百分号编码，而 Express 是拿「编码后」的路径去匹配路由的 ——
// 旧版白名单 [\w\-./\u4e00-\u9fff] 就是因为编码后的路径含 % 而把中文篇目全部 404，
// 而本脚本当时只验「文件存在」，于是给了一条运行时死链绿灯。现在两边一起验。
const READ_ROUTE = /^\/read\/.+\.html$/i;

let inner = 0, broken = 0, badAnchor = 0, siteOut = 0, trueOut = 0, badRoute = 0;
const brokenList = [], anchorList = [], routeList = [], siteOutList = new Map();

for (const f of files) {
  const h = fs.readFileSync(f, "utf8");
  const rel = path.relative(CONTENT, f).replace(/\\/g, "/");
  for (const m of h.matchAll(/href="([^"]*)"/g)) {
    const href = m[1];
    if (/^https?:\/\/[^"]*javaguide\.cn/i.test(href)) {
      siteOut++;
      siteOutList.set(href, (siteOutList.get(href) || 0) + 1);
      continue;
    }
    if (/^https?:\/\//i.test(href)) { trueOut++; continue; }
    if (!href.startsWith("/read/")) continue;
    inner++;
    const [page, frag] = href.split("#");
    // 先验路由可达，再验文件存在 —— 反过来做就会漏掉「文件在、路由服务不了」这类死链
    if (!READ_ROUTE.test(encodeURI(page))) {
      badRoute++;
      if (routeList.length < 20) routeList.push(`${rel} → ${page}（浏览器会发成 ${encodeURI(page)}）`);
      continue;
    }
    if (!exist.has(page)) {
      broken++;
      if (brokenList.length < 20) brokenList.push(`${rel} → ${page}`);
      continue;
    }
    if (frag && ids.get(page) && !ids.get(page).has(decodeURIComponent(frag))) {
      badAnchor++;
      if (anchorList.length < 20) anchorList.push(`${rel} → ${page}#${frag}`);
    }
  }
}

console.log(`页面 ${files.length} 个`);
console.log(`站内链接 ${inner} 条 · 外站链接 ${trueOut} 条 · 残留 javaguide.cn 外链 ${siteOut} 条`);
console.log(`  ✗ 落点缺失 ${broken}`);
console.log(`  ✗ 锚点对不上 ${badAnchor}`);
console.log(`  ✗ 路由不可达（服务端 /read/ 路由匹配不了该路径）${badRoute}`);
if (siteOutList.size) {
  console.log("\n残留的 javaguide.cn 外链（应只含本仓库没有的页面）：");
  [...siteOutList].sort((a, b) => b[1] - a[1]).forEach(([h, n]) => console.log(`  ${n}× ${h}`));
}
if (brokenList.length) { console.log("\n落点缺失样例："); brokenList.forEach((x) => console.log("  " + x)); }
if (anchorList.length) { console.log("\n锚点对不上样例："); anchorList.forEach((x) => console.log("  " + x)); }
if (routeList.length) { console.log("\n路由不可达样例："); routeList.forEach((x) => console.log("  " + x)); }
process.exit(broken || badAnchor || badRoute ? 1 : 0);
