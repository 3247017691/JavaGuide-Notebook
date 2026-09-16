/* JBL 火箭题库 · 掌握进度（MySQL 版）。qid 形如 q-1-12，卡死格式免得往库里塞垃圾。 */
const JBL_QID = /^q-\d{1,2}-\d{1,3}$/;

module.exports = function registerJblRoutes(app, ctx) {
  const { getPool, requireDb, serverError } = ctx;

  app.get("/api/jbl/progress", async (_req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const [rows] = await (await getPool()).query("SELECT qid FROM jbl_mastered");
      res.set("Cache-Control", "no-cache");
      res.json({ ids: rows.map((r) => r.qid) });
    } catch (e) { serverError(res, e); }
  });

  app.post("/api/jbl/progress", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const { id, done } = req.body || {};
      if (typeof id !== "string" || !JBL_QID.test(id) || typeof done !== "boolean") {
        return res.status(400).json({ error: "参数：id(形如 q-1-12) 与 done(boolean) 必填" });
      }
      if (done) await (await getPool()).query("INSERT IGNORE INTO jbl_mastered (qid) VALUES (?)", [id]);
      else await (await getPool()).query("DELETE FROM jbl_mastered WHERE qid = ?", [id]);
      res.set("Cache-Control", "no-cache");
      res.json({ ok: true, id, done });
    } catch (e) { serverError(res, e); }
  });

  // 一次性迁移：浏览器里攒下的进度搬进库（仅在客户端检测到库为空时调用）
  app.post("/api/jbl/migrate", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const { ids } = req.body || {};
      if (!Array.isArray(ids)) return res.status(400).json({ error: "参数：ids(string[]) 必填" });
      const mine = ids.filter((x) => typeof x === "string" && JBL_QID.test(x)).slice(0, 500);
      for (const qid of mine) await (await getPool()).query("INSERT IGNORE INTO jbl_mastered (qid) VALUES (?)", [qid]);
      res.json({ ok: true, moved: mine.length });
    } catch (e) { serverError(res, e); }
  });

  app.post("/api/jbl/reset", async (_req, res) => {
    if (!(await requireDb(res))) return;
    try {
      await (await getPool()).query("DELETE FROM jbl_mastered");
      res.json({ ok: true });
    } catch (e) { serverError(res, e); }
  });
};
