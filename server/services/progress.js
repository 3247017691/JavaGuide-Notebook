/* 进度联动服务：小节（section_reads）⟺ 整篇（read_marks）的双向同步。
   全部「读—判定—写」走事务 + 篇目行锁，死锁按错误码重试。 */
const RETRYABLE = new Set(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);

function createProgressService({ getPool, sectionsOf }) {
  const pool = async () => {
    const p = await getPool();
    if (!p) throw new Error("pool-unavailable");
    return p;
  };

  async function withTx(fn, tries = 4) {
    for (let attempt = 1; ; attempt++) {
      const conn = await (await pool()).getConnection();
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

  // 篇 → 节：盖章把这篇所有小节一起划掉，并清掉对不上真实小节的残留行
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

  // 节 → 篇：小节全划掉自动盖章，退掉任一小节自动撤章。调用方必须先 lockArticle。
  async function syncArticleFromSections(conn, id) {
    const hs = sectionsOf(id);
    if (!hs.length) return null;
    const [rows] = await conn.query("SELECT heading_id FROM section_reads WHERE article_id = ?", [id]);
    const marked = new Set(rows.map((r) => r.heading_id));
    const n = hs.reduce((s, h) => s + (marked.has(h) ? 1 : 0), 0); // 只数真实小节
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

  // 启动对账：补齐联动规则上线前的历史「孤岛」，幂等
  async function reconcileProgress() {
    const [rows] = await (await pool()).query(`
      SELECT a.id, (r.article_id IS NOT NULL) AS is_read, COALESCE(s.n, 0) AS sec
        FROM articles a
        LEFT JOIN read_marks r ON r.article_id = a.id
        LEFT JOIN (SELECT article_id, COUNT(*) AS n FROM section_reads GROUP BY article_id) s
               ON s.article_id = a.id`);
    let healed = 0;
    for (const row of rows) {
      const hs = sectionsOf(row.id);
      if (!hs.length) continue;
      const [[{ n }]] = await (await pool()).query(
        "SELECT COUNT(*) AS n FROM section_reads WHERE article_id = ? AND heading_id IN (?)", [row.id, hs]);
      const junk = row.sec - n;
      if (junk > 0) {
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

  return { withTx, lockArticle, lockChapter, syncSectionsFromArticle, syncArticleFromSections, syncChapterSections, reconcileProgress };
}

module.exports = { createProgressService };
