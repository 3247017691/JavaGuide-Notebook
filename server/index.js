/* 服务入口：装配数据上下文、进度服务、API 路由、静态资源，然后监听。
   行为约定与原 server.js 完全一致：
   · 启动期连不上库也照常监听 —— 「库不可用」是可呈现状态（503 + 中文提示），
     之后每次请求按需重试连接（5 秒冷却），MySQL 起来后刷新页面即可恢复。 */
const path = require("path");
const express = require("express");
const { createPool } = require("./db");
const { buildContext } = require("./context");
const { createProgressService } = require("./services/progress");
const { gzipShim } = require("./middleware/gzip");
const registerReadRoutes = require("./routes/reads");
const registerOverviewRoutes = require("./routes/overview");
const registerJblRoutes = require("./routes/jbl");
const registerDeskRoutes = require("./routes/desk");
const { mountStatics } = require("./statics");

const PORT = Number(process.env.PORT) || 3000;
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");
const NEED_DB = "MySQL 未就绪：请确认服务已启动（root/123456）后刷新";

let pool = null;
let poolRetryAt = 0;
let onConnected = null; // 首次成功连上后跑一次启动对账
let reconciled = false;

async function getPool() {
  if (pool) return pool;
  if (Date.now() < poolRetryAt) return null;
  poolRetryAt = Date.now() + 5000;
  try {
    pool = await createPool();
    console.log("[db] 已连接");
    if (onConnected && !reconciled) {
      reconciled = true;
      onConnected().catch((e) => console.error("[进度联动] 对账失败：", e.code || "", e.message));
    }
    return pool;
  } catch (e) {
    console.error("[db] 仍不可用：", e.code || "", e.message);
    return null;
  }
}

async function requireDb(res) {
  if (pool) return true;
  if (await getPool()) return true;
  res.status(503).json({ error: NEED_DB });
  return false;
}

/* 错误分级以错误码为准（mysql2 断连的 message 不含任何关键词），
   且不把数据库原文透传给客户端。 */
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

/* /api 的方法与路径闸门：方法不对 → 405 + Allow，路径不对 → 404，一律 JSON。 */
const API_ROUTES = [
  ["/api/meta", ["GET"]], ["/api/reads", ["GET"]], ["/api/section-reads", ["GET"]],
  ["/api/overview", ["GET"]], ["/api/recent", ["GET"]],
  ["/api/section-read", ["POST"]], ["/api/read", ["POST"]], ["/api/bulk", ["POST"]],
  ["/api/jbl/progress", ["GET", "POST"]], ["/api/jbl/reset", ["POST"]], ["/api/jbl/migrate", ["POST"]],
  ["/api/desk", ["GET"]], ["/api/search", ["GET"]],
];
function gateApi() {
  app.use((req, res, next) => {
    const p = req.path;
    if (p !== "/api" && !p.startsWith("/api/")) return next();
    if (req.method === "OPTIONS") return next();
    const hit = API_ROUTES.find(([route]) => route === p)
      || (/^\/api\/chapters\/[^/]+$/.test(p) ? [p, ["GET"]] : null);
    if (!hit) return res.status(404).json({ error: "接口不存在：" + p });
    const method = req.method === "HEAD" ? "GET" : req.method;
    if (hit[1].includes(method)) return next();
    res.set("Allow", hit[1].concat("OPTIONS").join(", "));
    return res.status(405).json({ error: `方法不被允许，可用：${hit[1].join(" / ")}` });
  });
}

const app = express();

async function main() {
  const ctx = buildContext();
  const progress = createProgressService({ getPool, sectionsOf: ctx.sectionsOf });
  // 小写别名：路由文件里统一用 meta/outById/deskToc/searchDocs
  ctx.meta = ctx.META;
  ctx.outById = ctx.OUT_BY_ID;
  ctx.deskToc = ctx.DESK_TOC;
  ctx.searchDocs = ctx.SEARCH_DOCS;
  Object.assign(ctx, { getPool, requireDb, serverError, NEED_DB, progress });

  app.use(gzipShim());
  app.use(express.json());

  gateApi();
  registerOverviewRoutes(app, ctx); // meta / overview / chapters / recent
  registerReadRoutes(app, ctx);     // reads / section-reads / read / bulk
  registerJblRoutes(app, ctx);      // jbl progress
  registerDeskRoutes(app, ctx);     // desk toc / search
  mountStatics(app, { clientDist: CLIENT_DIST });

  // 兜底错误处理：畸形 JSON / body 超限返回 JSON 而非 Express 默认 HTML 页
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    const msg = status === 413 ? "请求体过大"
      : status === 400 ? "请求体不是合法的 JSON"
      : "请求处理失败";
    console.error("[http]", status, err.type || err.code || "", err.message);
    res.status(status).json({ error: msg });
  });

  onConnected = progress.reconcileProgress;
  await getPool();
  if (!pool) console.error("启动时数据库不可用，服务仍会监听；MySQL 起起来后刷新页面即可。");
  app.listen(PORT, () => console.log(`面试工作台已就绪 → http://localhost:${PORT}`));
}

main().catch((e) => {
  console.error("启动失败：", e.code || "", e.message);
  process.exit(1);
});
