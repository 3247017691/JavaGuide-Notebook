const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const express = require("express");
const { createPool } = require("./db");

const PORT = Number(process.env.PORT) || 3000;
const app = express();

/* ============================================================ 数据库连接
   以前启动时连不上库就 process.exit(1)，端口根本不监听，浏览器只看到
   「无法访问此网站」—— 而 serverError 里明明备好了「MySQL 未就绪」的中文提示。
   现在改成：启动失败也照常监听端口，把「库不可用」当成一种可呈现的状态；
   之后每次请求按需重试连接（5 秒冷却），用户把 MySQL 起起来、刷新页面即可恢复。 */
let pool = null;
let poolRetryAt = 0;
let poolErr = null;
let onConnected = null;   // main() 注册：首次成功连上后跑一次启动对账
let reconciled = false;

async function getPool() {
  if (pool) return pool;
  if (Date.now() < poolRetryAt) return null;
  poolRetryAt = Date.now() + 5000;
  try {
    pool = await createPool();
    poolErr = null;
    console.log("[db] 已连接");
    // 启动期库不可用的话，对账不能就这么被跳过 —— 首次连上时补跑一次
    if (onConnected && !reconciled) {
      reconciled = true;
      onConnected().catch((e) => console.error("[进度联动] 对账失败：", e.code || "", e.message));
    }
    return pool;
  } catch (e) {
    poolErr = e;
    console.error("[db] 仍不可用：", e.code || "", e.message);
    return null;
  }
}

const NEED_DB = "MySQL 未就绪：请确认服务已启动（root/123456）后刷新";
// 必须是真的去「试一次连接」而不只是看 pool 是否为空 —— 否则启动期连不上库之后，
// 即使用户把 MySQL 起起来了，也没有任何请求会触发重连，那句「刷新页面即可」就是空话。
async function requireDb(res) {
  if (pool) return true;
  if (await getPool()) return true;
  res.status(503).json({ error: NEED_DB });
  return false;
}

/* ============================================================ 无损压缩
   之前整个服务没有任何压缩层：打开一篇文章首屏 713 KB，其中 /api/meta 占 623 KB
   （87%）。这里用 zlib 直接做一个最小实现，不引入新依赖。
   两个要点：
     · 响应头里的 Content-Type 在第一次 write 时已经由框架写好，据此决定要不要压；
       不可压缩的类型（图片等）立刻转成直通模式，不缓冲大文件、不碰流式传输。
     · Range 请求直接放行 —— 否则会破坏 206 分段响应。 */
function gzipShim() {
  const COMPRESSIBLE = /^(application\/json|application\/javascript|text\/|image\/svg\+xml|application\/xml)/i;
  const MIN = 1024;
  return function (req, res, next) {
    if (!/\bgzip\b/i.test(String(req.headers["accept-encoding"] || ""))) return next();
    if (req.headers.range) return next();

    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    let mode = null;          // null=未决定  "buffer"=缓冲待压  "pass"=直通
    let chunks = [];
    let total = 0;

    const decide = () => {
      if (mode) return;
      const ct = String(res.getHeader("Content-Type") || "");
      mode = (res.statusCode === 200 && COMPRESSIBLE.test(ct)) ? "buffer" : "pass";
    };

    res.write = function (chunk, enc, cb) {
      decide();
      if (mode === "pass") return origWrite(chunk, enc, cb);
      if (typeof chunk === "string") chunk = Buffer.from(chunk, enc || "utf8");
      if (chunk && chunk.length) { chunks.push(chunk); total += chunk.length; }
      if (typeof enc === "function") enc();
      else if (typeof cb === "function") cb();
      return true;
    };

    res.end = function (chunk, enc, cb) {
      if (typeof chunk === "function") { cb = chunk; chunk = null; }
      if (typeof enc === "function") { cb = enc; enc = undefined; }
      decide();
      if (chunk) {
        if (typeof chunk === "string") chunk = Buffer.from(chunk, enc || "utf8");
        if (mode === "pass") return origEnd(chunk, cb);
        if (chunk.length) { chunks.push(chunk); total += chunk.length; }
      }
      if (mode === "pass") return origEnd(cb);

      const body = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, total);
      chunks = [];
      if (total < MIN || res.getHeader("Content-Encoding")) {
        res.setHeader("Content-Length", body.length);
        return origEnd(body, cb);
      }
      const gz = zlib.gzipSync(body, { level: 6 });
      if (gz.length >= body.length) {
        res.setHeader("Content-Length", body.length);
        return origEnd(body, cb);
      }
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Content-Length", gz.length);
      return origEnd(gz, cb);
    };
    next();
  };
}

/* ============================================================ 事务与重试
   进度联动有三个「读—判定—写」的地方，之前全都没有事务：
   两个并发请求各读到中间态、后写者覆盖前者，「小节划完 ⟺ 整篇已读」就会破裂。
   实测「盖章 + 撤掉一个小节」并发时有 90% 概率留下非法状态。
   现在统一走事务，并按篇目行加锁把同一篇的并发写串行化；
   死锁（InnoDB 正常现象）按错误码重试，不再变成 500 抛给用户。 */
const RETRYABLE = new Set(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);

async function withTx(fn, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    const conn = await pool.getConnection();
    let retry = false;
    try {
      await conn.beginTransaction();
      const out = await fn(conn);
      await conn.commit();
      return out;
    } catch (e) {
      try { await conn.rollback(); } catch (_) { /* 连接已断，忽略 */ }
      retry = RETRYABLE.has(e.code) && attempt < tries;
      if (!retry) throw e;
    } finally {
      conn.release();
    }
    if (retry) await new Promise((r) => setTimeout(r, 15 * attempt));
  }
}

// 锁住篇目行：同一篇的所有并发写都从这里开始，天然的串行化点
const lockArticle = (conn, id) => conn.query("SELECT id FROM articles WHERE id = ? FOR UPDATE", [id]);
const lockChapter = (conn, code) =>
  conn.query("SELECT id FROM articles WHERE chapter_code = ? ORDER BY id FOR UPDATE", [code]);

async function main() {
  const META = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "articles-meta.json"), "utf8"));
  const OUT_BY_ID = new Map(META.filter((m) => m.local).map((m) => [m.id, m.out]));

  /* ---- 进度联动：悬浮目录（小节）↔ 章节页/首页（整篇）----------------------------
     小节状态（section_reads）以前是个孤岛：只在阅读页目录里可见。现在它和整篇已读
     （read_marks）双向同步，一处操作三处一致。两张表仍是各自的事实来源，联动在服务端
     统一裁决，客户端无论从哪个页面触发都拿到同一个结果。
       · 只处理「本地正式篇」：延伸页不计进度；付费/无正文篇 headings 为空（共 10 篇），
         不参与节日联动，否则会永远卡在 0 节无法自动成篇（它们只能手动盖章）。
       · 判定「划满了没有」必须按**与真实小节求交集**的数量，不能数表里的行数 ——
         否则任意编造的 heading_id 凑够行数就能伪造「整篇已读」（已实测复现）。 */
  const SECTIONS = new Map();
  for (const m of META) {
    if (!m.local || m.supplementary) continue;
    SECTIONS.set(m.id, (m.headings || []).map((h) => h.id));
  }
  const sectionsOf = (id) => SECTIONS.get(id) || [];

  // 篇 → 节：盖章时把这篇所有小节一起划掉；撤章时一起清空。
  // 盖章同时清掉对不上真实小节的残留行（重建正文后 slug 变了会留下这些孤儿）。
  async function syncSectionsFromArticle(conn, id, read) {
    const hs = sectionsOf(id);
    if (!hs.length) return 0;
    if (read) {
      const rows = hs.map((h) => [id, h]);
      for (let i = 0; i < rows.length; i += 200) {
        await conn.query("INSERT IGNORE INTO section_reads (article_id, heading_id) VALUES ?", [rows.slice(i, i + 200)]);
      }
      await conn.query("DELETE FROM section_reads WHERE article_id = ? AND heading_id NOT IN (?)", [id, hs]);
    } else {
      await conn.query("DELETE FROM section_reads WHERE article_id = ?", [id]);
    }
    return hs.length;
  }

  // 节 → 篇：小节全部划掉 → 自动盖整篇；退掉任一小节 → 自动撤章。
  // 调用前调用方必须已经锁定该篇目行（lockArticle），本函数只做「查—判—写」。
  async function syncArticleFromSections(conn, id) {
    const hs = sectionsOf(id);
    if (!hs.length) return null;
    const [rows] = await conn.query("SELECT heading_id FROM section_reads WHERE article_id = ?", [id]);
    const marked = new Set(rows.map((r) => r.heading_id));
    const n = hs.reduce((s, h) => s + (marked.has(h) ? 1 : 0), 0);   // 只数真实小节
    const full = n === hs.length;
    const [[cur]] = await conn.query("SELECT article_id FROM read_marks WHERE article_id = ?", [id]);
    if (full && !cur) await conn.query("INSERT IGNORE INTO read_marks (article_id) VALUES (?)", [id]);
    else if (!full && cur) await conn.query("DELETE FROM read_marks WHERE article_id = ?", [id]);
    return { read: full, sectionsRead: n, sectionsTotal: hs.length };
  }

  // 批量：整章盖章 / 清除时，小节跟着一起铺满 / 清空
  async function syncChapterSections(conn, code, read) {
    const [arts] = await conn.query("SELECT id FROM articles WHERE chapter_code = ?", [code]);
    const mine = arts.map((a) => a.id).filter((id) => sectionsOf(id).length);
    if (!mine.length) return;
    if (read) {
      const rows = [];
      mine.forEach((id) => sectionsOf(id).forEach((h) => rows.push([id, h])));
      for (let i = 0; i < rows.length; i += 200) {
        await conn.query("INSERT IGNORE INTO section_reads (article_id, heading_id) VALUES ?", [rows.slice(i, i + 200)]);
      }
    } else {
      await conn.query("DELETE FROM section_reads WHERE article_id IN (?)", [mine]);
    }
  }

  // 启动时对账一次：把联动规则上线前产生的历史「孤岛」状态补齐。
  // 典型场景：一篇的小节早被全划掉，但整篇没盖章 —— 首页/章节页就一直显示 0。
  // 幂等，每次启动跑一遍只花一次查询。
  // 注意：判定同样只认**真实小节**的交集数量，并顺手清掉对不上的残留行。
  async function reconcileProgress() {
    const [rows] = await pool.query(`
      SELECT a.id, (r.article_id IS NOT NULL) AS is_read, COALESCE(s.n, 0) AS sec
        FROM articles a
        LEFT JOIN read_marks r ON r.article_id = a.id
        LEFT JOIN (SELECT article_id, COUNT(*) AS n FROM section_reads GROUP BY article_id) s
               ON s.article_id = a.id`);
    let healed = 0;
    for (const row of rows) {
      const hs = sectionsOf(row.id);
      if (!hs.length) continue;
      const [[{ n }]] = await pool.query(
        "SELECT COUNT(*) AS n FROM section_reads WHERE article_id = ? AND heading_id IN (?)", [row.id, hs]);
      const junk = row.sec - n;
      if (junk > 0) {   // 有对不上真实小节的残留：清掉，它们不该参与任何判断
        await withTx((c) => c.query("DELETE FROM section_reads WHERE article_id = ? AND heading_id NOT IN (?)", [row.id, hs]));
        healed++;
      }
      if (n >= hs.length && !row.is_read) {
        await withTx(async (c) => { await lockArticle(c, row.id); await c.query("INSERT IGNORE INTO read_marks (article_id) VALUES (?)", [row.id]); });
        healed++;
      } else if (row.is_read && n < hs.length) {
        await withTx(async (c) => { await lockArticle(c, row.id); await syncSectionsFromArticle(c, row.id, true); });
        healed++;
      }
    }
    if (healed) console.log(`[进度联动] 已校正 ${healed} 篇的历史状态（小节 ↔ 整篇）`);
  }

  app.use(gzipShim());
  app.use(express.json());

  /* ---- 图片 Content-Type 纠正 --------------------------------------------------
     data/image-map.json 里的文件名是按**原始 URL 的扩展名**定的，download-images.js
     直接按这个路径落盘 —— 但原站有 62 张图的扩展名和真实格式不符（.png 实际是 JPEG、
     .jpg 实际是 PNG…）。express.static 只会照扩展名给 Content-Type，于是这些图片
     带着错误的类型发出去（浏览器靠嗅探还能显示，但响应头是错的）。
     这里在静态服务之前按**文件头魔数**嗅探一次并先设好 Content-Type —— send 模块
     见到 Content-Type 已存在就不再覆盖，Range / ETag / Last-Modified 全部照旧。
     注：不给文件改名，因为文件名是构建管线的约定（重建正文时会按 URL 重新算）。 */
  const IMG_ROOT = path.join(__dirname, "public", "img");
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  function sniffImageType(b) {
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b.length >= 8 && b.subarray(0, 8).equals(PNG_SIG)) return "image/png";
    if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1"))) return "image/gif";
    if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
    if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
    return null;
  }
  app.use("/img", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    let rel;
    try { rel = decodeURIComponent(req.path); } catch (e) { return next(); }
    const abs = path.resolve(IMG_ROOT, "." + rel);
    if (!abs.startsWith(IMG_ROOT + path.sep)) return next();   // 目录穿越：交给后面去 404
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

  // 本机自用、改完就要立刻看到 —— 不给静态资源设 max-Age（默认 max-age=0，
  // 靠 ETag/Last-Modified 每次 304 复核）。之前 maxAge:"1h" 会让浏览器整整一小时
  // 拿旧 HTML/JS/CSS 渲染，"重启后还是旧内容"就是这么来的。
  app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

  /* ---- /api 的方法与路径闸门 ---------------------------------------------------
     以前 PUT /api/read 会掉进 Express 的兜底 404（而非 405），不存在的 /api 路径
     返回的也是 HTML。这里统一成 JSON：方法不对 → 405 + Allow，路径不对 → 404。 */
  const API_ROUTES = [
    ["/api/meta", ["GET"]], ["/api/reads", ["GET"]], ["/api/section-reads", ["GET"]],
    ["/api/overview", ["GET"]], ["/api/recent", ["GET"]],
    ["/api/section-read", ["POST"]], ["/api/read", ["POST"]], ["/api/bulk", ["POST"]],
  ];
  const allowedFor = (p) => {
    if (/^\/api\/chapters\/[^/]+$/.test(p)) return ["GET"];
    const hit = API_ROUTES.find(([route]) => route === p);
    return hit ? hit[1] : null;
  };
  app.use((req, res, next) => {
    const p = req.path;
    if (p !== "/api" && !p.startsWith("/api/")) return next();
    if (req.method === "OPTIONS") return next();          // 交给 Express 默认的 OPTIONS 响应
    const allow = allowedFor(p);
    if (!allow) return res.status(404).json({ error: "接口不存在：" + p });
    // HEAD 由 GET 路由自动处理（Express 会只发头不发体），别把闸门做成新的回归
    const method = req.method === "HEAD" ? "GET" : req.method;
    if (allow.includes(method)) return next();
    res.set("Allow", allow.concat("OPTIONS").join(", "));
    return res.status(405).json({ error: `方法不被允许，可用：${allow.join(" / ")}` });
  });

  // 文章元数据（阅读页 TOC/上下篇用）。内容由构建产生、进程存活期内不变，交给 ETag 复核。
  app.get("/api/meta", (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.json(META);
  });

  // 已读 id 列表（桌面格表/文章页盖章态用）
  app.get("/api/reads", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const [rows] = await pool.query("SELECT article_id FROM read_marks");
      res.set("Cache-Control", "no-cache");
      res.json({ ids: rows.map((r) => r.article_id) });
    } catch (e) { serverError(res, e); }
  });

  // 悬浮目录条目（小节）的划掉状态
  app.get("/api/section-reads", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const [rows] = await pool.query("SELECT heading_id FROM section_reads WHERE article_id = ?", [String(req.query.article || "")]);
      res.set("Cache-Control", "no-cache");
      res.json({ ids: rows.map((r) => r.heading_id) });
    } catch (e) { serverError(res, e); }
  });

  const HEADING_MAX = 191;   // section_reads.heading_id 是 VARCHAR(191)
  app.post("/api/section-read", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const { article, heading, read } = req.body || {};
      // 类型与长度都要卡死：以前传对象会被 mysql2 序列化成 "[object Object]" 落库，
      // 传超长字符串会直接抛 "Data too long for column" 并把数据库原文返回给客户端。
      if (typeof article !== "string" || !article || typeof heading !== "string" || !heading || typeof read !== "boolean") {
        return res.status(400).json({ error: "参数：article(string)、heading(string)、read(boolean) 必填" });
      }
      if (heading.length > HEADING_MAX) {
        return res.status(400).json({ error: `heading 过长：最多 ${HEADING_MAX} 字符（当前 ${heading.length}）` });
      }
      const [[a]] = await pool.query("SELECT id FROM articles WHERE id = ?", [article]);
      if (!a) return res.status(404).json({ error: "找不到该篇目" });
      // 关键校验：这个 heading 必须真的属于这篇目。
      // 缺了它，随便编几个字符串凑够行数就能把一篇伪造标记成「已读」（已实测复现）。
      const hs = sectionsOf(article);
      if (!hs.length) return res.status(400).json({ error: "该篇目没有小节，无法逐节标记（请直接标记整篇）" });
      if (!hs.includes(heading)) return res.status(400).json({ error: "该小节不属于这篇目" });

      const out = await withTx(async (conn) => {
        await lockArticle(conn, article);
        if (read) {
          await conn.query(
            "INSERT INTO section_reads (article_id, heading_id) VALUES (?,?) ON DUPLICATE KEY UPDATE heading_id = VALUES(heading_id)",
            [article, heading]);
        } else {
          await conn.query("DELETE FROM section_reads WHERE article_id = ? AND heading_id = ?", [article, heading]);
        }
        // 联动：小节全划掉就自动盖整篇章，退掉一节就自动撤章
        return syncArticleFromSections(conn, article);
      });

      res.set("Cache-Control", "no-cache");
      res.json({
        ok: true, article, heading, read,
        articleRead: out ? out.read : null,
        sectionsRead: out ? out.sectionsRead : 0,
        sectionsTotal: out ? out.sectionsTotal : 0,
      });
    } catch (e) { serverError(res, e); }
  });

  // 总览：各科已读统计 + 全局进度 + 最近批阅 + 小节级「部分进度」
  app.get("/api/overview", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      // 一次查全：按章节分组的每篇状态（整篇已读 + 已划小节数）。
      // 小节数用子查询预聚合，避免 JOIN 行数相乘。
      const [rows] = await pool.query(`
        SELECT c.code, c.name, c.blurb,
               a.id, (r.article_id IS NOT NULL) AS is_read, COALESCE(s.n, 0) AS sec
          FROM chapters c
          LEFT JOIN articles a ON a.chapter_code = c.code
          LEFT JOIN read_marks r ON r.article_id = a.id
          LEFT JOIN (SELECT article_id, COUNT(*) AS n FROM section_reads GROUP BY article_id) s
                 ON s.article_id = a.id
         ORDER BY c.ord, a.ord`);
      const [[meta]] = await pool.query(`SELECT MAX(read_at) AS lastReadAt FROM read_marks`);

      const byCode = new Map();
      for (const row of rows) {
        let c = byCode.get(row.code);
        if (!c) { c = { code: row.code, name: row.name, blurb: row.blurb, items: [] }; byCode.set(row.code, c); }
        if (!row.id) continue;
        const st = sectionsOf(row.id).length;
        // 零小节篇也入列（st=0）——首页刻度必须一篇一道，总数才等于 332
        c.items.push({ id: row.id, r: row.is_read ? 1 : 0, sr: Math.min(row.sec, st), st });
      }

      let gTotal = 0, gRead = 0, gSecTotal = 0, gSecRead = 0;
      const chapters = [...byCode.values()].map((c) => {
        const total = c.items.length;
        const read = c.items.filter((x) => x.r).length;
        const secTotal = c.items.reduce((s, x) => s + x.st, 0);
        // 整篇已读的篇，其小节必然全划（联动保证），按 st 计而不是按 sr，防止历史脏数据
        const secRead = c.items.reduce((s, x) => s + (x.r ? x.st : x.sr), 0);
        const partial = c.items.filter((x) => !x.r && x.sr > 0).length;
        gTotal += total; gRead += read; gSecTotal += secTotal; gSecRead += secRead;
        return {
          code: c.code, name: c.name, blurb: c.blurb,
          total, read, partial, secTotal, secRead,
          pct: total ? Math.round((read / total) * 1000) / 10 : 0,
          items: c.items,
        };
      });

      res.set("Cache-Control", "no-cache");
      res.json({
        total: gTotal, read: gRead,
        pct: gTotal ? Math.round((gRead / gTotal) * 1000) / 10 : 0,
        sectionsTotal: gSecTotal, sectionsRead: gSecRead,
        pctSections: gSecTotal ? Math.round((gSecRead / gSecTotal) * 1000) / 10 : 0,
        lastReadAt: meta ? meta.lastReadAt : null,
        chapters,
      });
    } catch (e) { serverError(res, e); }
  });

  // 某章明细：分组 + 每篇的已读状态
  app.get("/api/chapters/:code", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const [[ch]] = await pool.query("SELECT code, name, blurb FROM chapters WHERE code = ?", [req.params.code]);
      if (!ch) return res.status(404).json({ error: "找不到该科目" });
      const [rows] = await pool.query(`
        SELECT a.id, a.grp, a.title, a.url, a.ext, (r.article_id IS NOT NULL) AS is_read, r.read_at AS readAt, a.ord,
               COALESCE(s.n, 0) AS sec
          FROM articles a
          LEFT JOIN read_marks r ON r.article_id = a.id
          LEFT JOIN (SELECT article_id, COUNT(*) AS n FROM section_reads GROUP BY article_id) s
                 ON s.article_id = a.id
         WHERE a.chapter_code = ?
         ORDER BY a.ord`, [ch.code]);
      const groups = [];
      for (const row of rows) {
        let g = groups.find((x) => x.group === row.grp);
        if (!g) { g = { group: row.grp, items: [] }; groups.push(g); }
        const st = sectionsOf(row.id).length;
        g.items.push({
          id: row.id, title: row.title, url: row.url, ext: !!row.ext,
          local: OUT_BY_ID.get(row.id) || null,
          read: !!row.is_read, readAt: row.readAt,
          sectionsTotal: st,
          sectionsRead: Math.min(row.sec, st),
        });
      }
      const total = rows.length, read = rows.filter((r) => r.is_read).length;
      const secTotal = rows.reduce((s, r) => s + sectionsOf(r.id).length, 0);
      const secRead = rows.reduce((s, r) => s + (r.is_read ? sectionsOf(r.id).length : Math.min(r.sec, sectionsOf(r.id).length)), 0);
      // partial 与 /api/overview 用同一个口径：按钳制后的值算，否则两个接口会各说各话
      const partial = rows.filter((r) => !r.is_read && Math.min(r.sec, sectionsOf(r.id).length) > 0).length;
      res.set("Cache-Control", "no-cache");
      res.json({ code: ch.code, name: ch.name, blurb: ch.blurb, total, read,
        partial,
        secTotal, secRead,
        pct: total ? Math.round((read / total) * 1000) / 10 : 0, groups });
    } catch (e) { serverError(res, e); }
  });

  // 单篇划线 / 撤线
  app.post("/api/read", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const { id, read } = req.body || {};
      if (typeof id !== "string" || !id || typeof read !== "boolean") {
        return res.status(400).json({ error: "参数：id(string) 与 read(boolean) 必填" });
      }
      const [[a]] = await pool.query("SELECT id FROM articles WHERE id = ?", [id]);
      if (!a) return res.status(404).json({ error: "找不到该篇目" });

      const out = await withTx(async (conn) => {
        await lockArticle(conn, id);
        if (read) {
          await conn.query("INSERT INTO read_marks (article_id) VALUES (?) ON DUPLICATE KEY UPDATE article_id = article_id", [id]);
        } else {
          await conn.query("DELETE FROM read_marks WHERE article_id = ?", [id]);
        }
        // 联动：盖章 → 这篇所有小节一起划掉；撤章 → 小节全清
        const secTotal = await syncSectionsFromArticle(conn, id, read);
        const [[r]] = await conn.query("SELECT read_at AS readAt FROM read_marks WHERE article_id = ?", [id]);
        return { readAt: r ? r.readAt : null, secTotal };
      });

      res.set("Cache-Control", "no-cache");
      res.json({ ok: true, id, read, readAt: out.readAt, sectionsRead: read ? out.secTotal : 0, sectionsTotal: out.secTotal });
    } catch (e) { serverError(res, e); }
  });

  // 整科全部已读 / 全部清除
  app.post("/api/bulk", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const { code, read } = req.body || {};
      if (typeof code !== "string" || !code || typeof read !== "boolean") {
        return res.status(400).json({ error: "参数：code(string) 与 read(boolean) 必填" });
      }
      const [[c]] = await pool.query("SELECT code FROM chapters WHERE code = ?", [code]);
      if (!c) return res.status(404).json({ error: "找不到该科目" });

      await withTx(async (conn) => {
        await lockChapter(conn, code);   // 按 id 顺序锁全章，避免与单篇写操作互相踩
        if (read) {
          await conn.query(`INSERT IGNORE INTO read_marks (article_id) SELECT id FROM articles WHERE chapter_code = ?`, [code]);
        } else {
          await conn.query(`DELETE r FROM read_marks r JOIN articles a ON a.id = r.article_id WHERE a.chapter_code = ?`, [code]);
        }
        // 联动：整章盖章/清除时，小节跟着一起铺满/清空
        await syncChapterSections(conn, code, read);
      });

      res.set("Cache-Control", "no-cache");
      res.json({ ok: true, code, read });
    } catch (e) { serverError(res, e); }
  });

  // 最近批阅日志（首页下方用）
  app.get("/api/recent", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      // 以前只压了上限：limit=-1 / 2.5 会原样拼进 SQL 触发语法错误，
      // 500 的响应体里还带着 MySQL 的报错原文。现在取整 + 双向钳制。
      const raw = Math.trunc(Number(req.query.limit));
      const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 50) : 8;
      const [rows] = await pool.query(`
        SELECT r.article_id AS id, a.title, c.name AS chapterName, r.read_at AS readAt
          FROM read_marks r JOIN articles a ON a.id = r.article_id JOIN chapters c ON c.code = a.chapter_code
         ORDER BY r.read_at DESC LIMIT ${limit}`);
      res.set("Cache-Control", "no-cache");
      res.json({ items: rows });
    } catch (e) { serverError(res, e); }
  });

  // 页面路由
  app.get(["/", "/index.html"], (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
  app.get(["/chapter", "/chapter.html"], (req, res) => res.sendFile(path.join(__dirname, "public", "chapter.html")));
  // /read/<path>.html → 阅读壳页（正文由 read.js 拉 /content/ 注入）
  // 这里**不能**用字符白名单：Express 的路由是拿「百分号编码后」的路径去匹配的，
  // 而编码后的路径必然含 %，任何不含 % 的字符集都会把中文篇目全部 404
  // （实测 /read/system-design/J2EE基础知识.html）。壳页不读磁盘，放宽没有穿越风险。
  app.get(/^\/read\/.+\.html$/i, (req, res) => res.sendFile(path.join(__dirname, "public", "read.html")));

  // 兜底错误处理：畸形 JSON / body 超限以前会返回 Express 默认的 HTML 错误页，
  // 前端 r.json() 直接抛 SyntaxError，toast 里出现的是 "Unexpected token <"。
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    const msg = status === 413 ? "请求体过大"
      : status === 400 ? "请求体不是合法的 JSON"
      : "请求处理失败";
    console.error("[http]", status, err.type || err.code || "", err.message);
    res.status(status).json({ error: msg });
  });

  // 对账挂到「首次连上」的钩子上：正常启动会立刻跑，启动期库不可用则等恢复后补跑
  onConnected = reconcileProgress;
  await getPool();
  if (!pool) console.error("启动时数据库不可用，服务仍会监听；MySQL 起起来后刷新页面即可。");
  app.listen(PORT, () => console.log(`离线小抄已就绪 → http://localhost:${PORT}`));
}

/* 错误分级：以前用正则去猜 message 里有没有 "ECONNREFUSED|PROTOCOL|…"，
   但 mysql2 连接中途断开抛的是 "Connection lost: The server closed the connection."
   （一个关键词都不含，code 才是 PROTOCOL_CONNECTION_LOST）—— 于是那句备好的中文
   提示永远不出现，InnoDB 的英文原文直接显示在页面上。
   现在以错误码为准，并且不再把数据库原文透传给客户端。 */
const DB_DOWN_CODES = new Set([
  "PROTOCOL_CONNECTION_LOST", "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
  "ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT", "ENOTFOUND",
  "ER_ACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR", "ER_CON_COUNT_ERROR", "ER_NO_SUCH_TABLE",
]);
function serverError(res, e) {
  console.error("[api]", e.code || "", e.message);
  if (res.headersSent) return;
  const dbDown = DB_DOWN_CODES.has(e.code)
    || /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|Connection lost|server has gone away/i.test(e.message || "");
  res.status(dbDown ? 503 : 500).json({
    error: dbDown ? NEED_DB : "服务内部错误，详情见终端日志",
  });
}

main().catch((e) => {
  console.error("启动失败：", e.code || "", e.message);
  process.exit(1);
});
