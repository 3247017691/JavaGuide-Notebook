/* 进度写/读接口：单篇划线、整章批量、小节划掉。
   联动一律在事务里由服务端裁决，返回联动后的状态给前端就地更新。 */
const HEADING_MAX = 191; // section_reads.heading_id 是 VARCHAR(191)

module.exports = function registerReadRoutes(app, ctx) {
  const { getPool, requireDb, serverError, sectionsOf, progress } = ctx;

  app.get("/api/reads", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const [rows] = await (await getPool()).query("SELECT article_id FROM read_marks");
      res.set("Cache-Control", "no-cache");
      res.json({ ids: rows.map((r) => r.article_id) });
    } catch (e) { serverError(res, e); }
  });

  app.get("/api/section-reads", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const [rows] = await (await getPool()).query("SELECT heading_id FROM section_reads WHERE article_id = ?", [String(req.query.article || "")]);
      res.set("Cache-Control", "no-cache");
      res.json({ ids: rows.map((r) => r.heading_id) });
    } catch (e) { serverError(res, e); }
  });

  app.post("/api/section-read", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const { article, heading, read } = req.body || {};
      // 类型与长度卡死：否则对象会被序列化落库、超长串会把数据库原文抛给客户端
      if (typeof article !== "string" || !article || typeof heading !== "string" || !heading || typeof read !== "boolean") {
        return res.status(400).json({ error: "参数：article(string)、heading(string)、read(boolean) 必填" });
      }
      if (heading.length > HEADING_MAX) {
        return res.status(400).json({ error: `heading 过长：最多 ${HEADING_MAX} 字符（当前 ${heading.length}）` });
      }
      const pool = await getPool();
      const [[a]] = await pool.query("SELECT id FROM articles WHERE id = ?", [article]);
      if (!a) return res.status(404).json({ error: "找不到该篇目" });
      // 关键校验：heading 必须真的属于这篇目，否则凑行数就能伪造「整篇已读」
      const hs = sectionsOf(article);
      if (!hs.length) return res.status(400).json({ error: "该篇目没有小节，无法逐节标记（请直接标记整篇）" });
      if (!hs.includes(heading)) return res.status(400).json({ error: "该小节不属于这篇目" });

      const out = await progress.withTx(async (conn) => {
        await progress.lockArticle(conn, article);
        if (read) {
          await conn.query(
            "INSERT INTO section_reads (article_id, heading_id) VALUES (?,?) ON DUPLICATE KEY UPDATE heading_id = VALUES(heading_id)",
            [article, heading]);
        } else {
          await conn.query("DELETE FROM section_reads WHERE article_id = ? AND heading_id = ?", [article, heading]);
        }
        return progress.syncArticleFromSections(conn, article);
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

  app.post("/api/read", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const { id, read } = req.body || {};
      if (typeof id !== "string" || !id || typeof read !== "boolean") {
        return res.status(400).json({ error: "参数：id(string) 与 read(boolean) 必填" });
      }
      const pool = await getPool();
      const [[a]] = await pool.query("SELECT id FROM articles WHERE id = ?", [id]);
      if (!a) return res.status(404).json({ error: "找不到该篇目" });

      const out = await progress.withTx(async (conn) => {
        await progress.lockArticle(conn, id);
        if (read) {
          await conn.query("INSERT INTO read_marks (article_id) VALUES (?) ON DUPLICATE KEY UPDATE article_id = article_id", [id]);
        } else {
          await conn.query("DELETE FROM read_marks WHERE article_id = ?", [id]);
        }
        const secTotal = await progress.syncSectionsFromArticle(conn, id, read);
        const [[r]] = await conn.query("SELECT read_at AS readAt FROM read_marks WHERE article_id = ?", [id]);
        return { readAt: r ? r.readAt : null, secTotal };
      });

      res.set("Cache-Control", "no-cache");
      res.json({ ok: true, id, read, readAt: out.readAt, sectionsRead: read ? out.secTotal : 0, sectionsTotal: out.secTotal });
    } catch (e) { serverError(res, e); }
  });

  app.post("/api/bulk", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const { code, read } = req.body || {};
      if (typeof code !== "string" || !code || typeof read !== "boolean") {
        return res.status(400).json({ error: "参数：code(string) 与 read(boolean) 必填" });
      }
      const pool = await getPool();
      const [[c]] = await pool.query("SELECT code FROM chapters WHERE code = ?", [code]);
      if (!c) return res.status(404).json({ error: "找不到该科目" });

      await progress.withTx(async (conn) => {
        await progress.lockChapter(conn, code);
        if (read) {
          await conn.query(`INSERT IGNORE INTO read_marks (article_id) SELECT id FROM articles WHERE chapter_code = ?`, [code]);
        } else {
          await conn.query(`DELETE r FROM read_marks r JOIN articles a ON a.id = r.article_id WHERE a.chapter_code = ?`, [code]);
        }
        await progress.syncChapterSections(conn, code, read);
      });

      res.set("Cache-Control", "no-cache");
      res.json({ ok: true, code, read });
    } catch (e) { serverError(res, e); }
  });
};
