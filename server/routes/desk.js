/* 面试工作台 · 侧栏目录与全局搜索（不依赖数据库）。 */
module.exports = function registerDeskRoutes(app, ctx) {
  const { DESK_TOC, SEARCH_DOCS, makeSnip } = ctx;

  app.get("/api/desk", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.json(DESK_TOC);
  });

  app.get("/api/search", (req, res) => {
    const raw = String(req.query.q || "").trim();
    const q = raw.slice(0, 64);
    const rl = Math.trunc(Number(req.query.limit));
    const limit = Number.isFinite(rl) ? Math.min(Math.max(rl, 1), 40) : 24;
    res.set("Cache-Control", "no-cache");
    if (!q) return res.json({ q: "", hits: [], truncated: false });
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
    const scored = [];
    for (const d of SEARCH_DOCS) {
      let total = 0;
      let all = true;
      let first = -1;
      for (const t of terms) {
        let pts = 0;
        const ti = d.titleLower.indexOf(t);
        if (ti >= 0) pts = ti === 0 ? 90 : 66; // 标题开头 > 标题中间
        else if (d.subLower.indexOf(t) >= 0) pts = 44;
        else if (d.headLower.indexOf(t) >= 0) pts = 30;
        else {
          const bi = d.bodyLower.indexOf(t);
          if (bi >= 0) { pts = 12; if (first < 0) first = bi; }
        }
        if (!pts) { all = false; break; }
        total += pts;
      }
      if (!all) continue;
      if (first < 0) first = d.bodyLower.indexOf(terms[0]);
      scored.push({ d, total, first });
    }
    // 同分先给短标题（更"像答案"），再按应用与编号稳定排序
    scored.sort((a, b) => b.total - a.total || a.d.title.length - b.d.title.length
      || a.d.app.localeCompare(b.d.app) || String(a.d.id).localeCompare(String(b.d.id)));
    const hits = scored.slice(0, limit).map(({ d, total, first }) => ({
      app: d.app, id: d.id, title: d.title, sub: d.sub, kind: d.kind, url: d.url, score: total,
      snip: first >= 0 && d.body ? makeSnip(d.body, first) : "",
    }));
    res.json({ q: raw, hits, truncated: scored.length > hits.length, total: scored.length });
  });
};
