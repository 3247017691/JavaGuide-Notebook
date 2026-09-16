/* 静态资源与页面路由。
   优先级：/desktop（旧壳留档）→ /jbl（纯静态题库）→ /img（魔数嗅探）→
   client/dist（SPA 壳 + 构建资产）→ /content /vendor（构建产物正文）→
   SPA fallback（/index.html、/chapter.html、/read/*.html 等全部落到 SPA，
   由 vue-router 的同名路由接住）。 */
const fs = require("fs");
const path = require("path");
const express = require("express");

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function sniffImageType(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(PNG_SIG)) return "image/png";
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  return null;
}

function mountStatics(app, { clientDist }) {
  // 旧桌面外壳留档在 /legacy（新外壳由 SPA 的 / 接管），便于回退比对
  app.use("/legacy", express.static(path.join(__dirname, "..", "desktop"), { index: "index.html" }));
  app.use("/jbl", express.static(path.join(__dirname, "..", "JBL火箭题库"), { extensions: ["html"] }));

  // 图片 Content-Type 纠正：data/image-map.json 的文件名按原始 URL 扩展名落盘，
  // 62 张图的扩展名与真实格式不符，express.static 会给出错误的 Content-Type。
  // 按**文件头魔数**先设类型 —— send 见到已有 Content-Type 就不再覆盖，
  // Range / ETag / Last-Modified 全部照旧。
  const IMG_ROOT = path.join(__dirname, "..", "public", "img");
  app.use("/img", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    let rel;
    try { rel = decodeURIComponent(req.path); } catch (e) { return next(); }
    const abs = path.resolve(IMG_ROOT, "." + rel);
    if (!abs.startsWith(IMG_ROOT + path.sep)) return next(); // 目录穿越：交给后面去 404
    let fd = null;
    try {
      fd = fs.openSync(abs, "r");
      const b = Buffer.alloc(12);
      const n = fs.readSync(fd, b, 0, 12, 0);
      fs.closeSync(fd); fd = null;
      const t = sniffImageType(b.subarray(0, n));
      if (t) res.type(t);
    } catch (e) {
      if (fd !== null) { try { fs.closeSync(fd); } catch (_) { /* 忽略 */ } }
      return next();
    }
    res.sendFile(abs, (err) => { if (err) next(err); });
  });

  // SPA 构建产物（生产）；dist 不存在时（未构建）跳过，让 fallback 给出可读提示
  if (fs.existsSync(path.join(clientDist, "index.html"))) {
    app.use(express.static(clientDist, { index: "index.html" }));
  }

  // 正文与离线 mermaid：构建产物在 public/ 下，路径不变（正文里的 /content /img /vendor 根绝对链接零改动）
  app.use("/content", express.static(path.join(__dirname, "..", "public", "content")));
  app.use("/vendor", express.static(path.join(__dirname, "..", "public", "vendor")));

  // SPA fallback：所有接受 HTML 的 GET 都回 SPA 壳（/read/*.html 含中文路径也一样，
  // 壳页不读磁盘，没有穿越风险；/api 已在前面的闸门里 404/405，到不了这里）。
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const accept = String(req.headers.accept || "");
    if (!accept.includes("text/html")) return next();
    if (!fs.existsSync(path.join(clientDist, "index.html"))) {
      return res.status(503).send("前端尚未构建：请在 client/ 目录执行 npm run build");
    }
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

module.exports = { mountStatics };
