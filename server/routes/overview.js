/* 总览与明细：/api/meta、/api/overview、/api/chapters/:code、/api/recent。
   小节计数用子查询预聚合，避免 JOIN 行数相乘；口径与联动规则一致。 */
module.exports = function registerOverviewRoutes(app, ctx) {
  const { getPool, requireDb, serverError, sectionsOf, outById } = ctx;

  // 文章元数据（阅读页 TOC/上下篇用）。构建产物、进程存活期内不变，交给 ETag 复核。
  app.get("/api/meta", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.json(ctx.meta);
  });

  app.get("/api/overview", async (_req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const [rows] = await (await getPool()).query(`
        SELECT c.code, c.name, c.blurb,
               a.id, (r.article_id IS NOT NULL) AS is_read, COALESCE(s.n, 0) AS sec
          FROM chapters c
          LEFT JOIN articles a ON a.chapter_code = c.code
          LEFT JOIN read_marks r ON r.article_id = a.id
          LEFT JOIN (SELECT article_id, COUNT(*) AS n FROM section_reads GROUP BY article_id) s
                 ON s.article_id = a.id
         ORDER BY c.ord, a.ord`);
      const [[meta]] = await (await getPool()).query(`SELECT MAX(read_at) AS lastReadAt FROM read_marks`);

      const byCode = new Map();
      for (const row of rows) {
        let c = byCode.get(row.code);
        if (!c) { c = { code: row.code, name: row.name, blurb: row.blurb, items: [] }; byCode.set(row.code, c); }
        if (!row.id) continue;
        const st = sectionsOf(row.id).length;
        // 零小节篇也入列（st=0）—— 首页刻度一篇一道，总数才等于 332
        c.items.push({ id: row.id, r: row.is_read ? 1 : 0, sr: Math.min(row.sec, st), st });
      }

      let gTotal = 0, gRead = 0, gSecTotal = 0, gSecRead = 0;
      const chapters = [...byCode.values()].map((c) => {
        const total = c.items.length;
        const read = c.items.filter((x) => x.r).length;
        const secTotal = c.items.reduce((s, x) => s + x.st, 0);
        // 整篇已读的篇其小节必然全划（联动保证），按 st 计防止历史脏数据
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

  app.get("/api/chapters/:code", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      const pool = await getPool();
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
          local: outById.get(row.id) || null,
          read: !!row.is_read, readAt: row.readAt,
          sectionsTotal: st,
          sectionsRead: Math.min(row.sec, st),
        });
      }
      const total = rows.length, read = rows.filter((r) => r.is_read).length;
      const secTotal = rows.reduce((s, r) => s + sectionsOf(r.id).length, 0);
      const secRead = rows.reduce((s, r) => s + (r.is_read ? sectionsOf(r.id).length : Math.min(r.sec, sectionsOf(r.id).length)), 0);
      // partial 与 /api/overview 同一口径：按钳制后的值算
      const partial = rows.filter((r) => !r.is_read && Math.min(r.sec, sectionsOf(r.id).length) > 0).length;
      res.set("Cache-Control", "no-cache");
      res.json({ code: ch.code, name: ch.name, blurb: ch.blurb, total, read,
        partial,
        secTotal, secRead,
        pct: total ? Math.round((read / total) * 1000) / 10 : 0, groups });
    } catch (e) { serverError(res, e); }
  });

  app.get("/api/recent", async (req, res) => {
    if (!(await requireDb(res))) return;
    try {
      // limit 双向钳制：负数会拼出 `LIMIT -1` 这种语法错误
      const raw = Math.trunc(Number(req.query.limit));
      const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 50) : 8;
      const [rows] = await (await getPool()).query(`
        SELECT r.article_id AS id, a.title, c.name AS chapterName, r.read_at AS readAt
          FROM read_marks r JOIN articles a ON a.id = r.article_id JOIN chapters c ON c.code = a.chapter_code
         ORDER BY r.read_at DESC LIMIT ${limit}`);
      res.set("Cache-Control", "no-cache");
      res.json({ items: rows });
    } catch (e) { serverError(res, e); }
  });
};
