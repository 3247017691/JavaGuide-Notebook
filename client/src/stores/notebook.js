/* 小抄数据中枢：总览 / 元数据 / 已读 / 小节已读，三个视图共享。
   写操作乐观更新 + 服务端裁决回写；聚合口径与 server/routes/overview.js 一致。 */
import { defineStore } from "pinia";
import { getJSON, postJSON } from "../api";

export const useNotebook = defineStore("notebook", {
  state: () => ({
    overview: null,
    overviewError: null,
    meta: null,
    metaReq: null,
    reads: {},        // articleId -> true
    chapters: {},     // code -> payload | { error }
    secReads: {},     // articleId -> [headingId]
  }),
  getters: {
    metaByOut(s) {
      const m = new Map();
      (s.meta || []).forEach((x) => m.set(x.out, x));
      return m;
    },
  },
  actions: {
    async loadOverview() {
      const d = await getJSON("/api/overview");
      if (d.error) { this.overviewError = d.error; return null; }
      this.overviewError = null;
      this.overview = d;
      const reads = {};
      d.chapters.forEach((c) => c.items.forEach((it) => { if (it.r) reads[it.id] = true; }));
      this.reads = reads;
      return d;
    },
    async loadReads() {
      const d = await getJSON("/api/reads");
      if (d.error) return;
      const map = {};
      (d.ids || []).forEach((id) => { map[id] = true; });
      this.reads = map;
    },
    loadMeta() {
      if (this.meta) return Promise.resolve(this.meta);
      if (!this.metaReq) {
        this.metaReq = getJSON("/api/meta").then((d) => {
          this.meta = d.error ? [] : d;
          return this.meta;
        });
      }
      return this.metaReq;
    },
    async loadChapter(code) {
      const d = await getJSON("/api/chapters/" + code);
      this.chapters[code] = d.error ? { error: d.error } : d;
      return this.chapters[code];
    },
    async loadSecReads(articleId) {
      const d = await getJSON("/api/section-reads?article=" + encodeURIComponent(articleId));
      if (!d.error) this.secReads[articleId] = d.ids || [];
      return this.secReads[articleId] || [];
    },

    /* ---- 聚合重算（口径同服务端） ---- */
    _recomputeOverviewChapter(ch) {
      const items = ch.items;
      const total = items.length;
      const read = items.filter((x) => x.r).length;
      const secTotal = items.reduce((s, x) => s + x.st, 0);
      const secRead = items.reduce((s, x) => s + (x.r ? x.st : x.sr), 0);
      const partial = items.filter((x) => !x.r && x.sr > 0).length;
      Object.assign(ch, {
        total, read, partial, secTotal, secRead,
        pct: total ? Math.round((read / total) * 1000) / 10 : 0,
      });
      let gT = 0, gR = 0, gST = 0, gSR = 0;
      this.overview.chapters.forEach((c) => {
        gT += c.total; gR += c.read; gST += c.secTotal; gSR += c.secRead;
      });
      Object.assign(this.overview, {
        total: gT, read: gR, pct: gT ? Math.round((gR / gT) * 1000) / 10 : 0,
        sectionsTotal: gST, sectionsRead: gSR,
        pctSections: gST ? Math.round((gSR / gST) * 1000) / 10 : 0,
        lastReadAt: read > 0 ? (this.overview.lastReadAt || new Date().toISOString()) : this.overview.lastReadAt,
      });
    },
    _recomputeChapterCache(code) {
      const ch = this.chapters[code];
      if (!ch || ch.error) return;
      const all = ch.groups.flatMap((g) => g.items);
      ch.read = all.filter((i) => i.read).length;
      ch.partial = all.filter((i) => !i.read && (i.sectionsRead || 0) > 0).length;
      ch.secTotal = all.reduce((s, i) => s + (i.sectionsTotal || 0), 0);
      ch.secRead = all.reduce((s, i) => s + (i.read ? i.sectionsTotal || 0 : i.sectionsRead || 0), 0);
      ch.pct = ch.total ? Math.round((ch.read / ch.total) * 1000) / 10 : 0;
    },
    _findOverviewItem(id) {
      if (!this.overview) return null;
      for (const c of this.overview.chapters) {
        const item = c.items.find((x) => x.id === id);
        if (item) return { ch: c, item };
      }
      return null;
    },
    _findChapterItem(code, id) {
      const ch = this.chapters[code];
      if (!ch || ch.error) return null;
      for (const g of ch.groups) {
        const item = g.items.find((x) => x.id === id);
        if (item) return item;
      }
      return null;
    },
    _codeOf(id) {
      const hit = this._findOverviewItem(id);
      if (hit) return hit.ch.code;
      for (const code of Object.keys(this.chapters)) {
        if (this._findChapterItem(code, id)) return code;
      }
      if (this.meta) {
        const m = this.meta.find((x) => x.id === id);
        if (m) return m.code;
      }
      return null;
    },

    /* ---- 整篇已读：乐观更新 → 服务端裁决 → 回写真实值 ---- */
    async toggleArticle(id, next) {
      const code = this._codeOf(id);
      const before = {
        read: !!this.reads[id],
        sec: this.secReads[id] ? [...this.secReads[id]] : null,
      };
      const ov = this._findOverviewItem(id);
      const cacheItem = code ? this._findChapterItem(code, id) : null;
      const apply = (read, readAt, secRead, secTotal) => {
        if (read) this.reads[id] = true; else delete this.reads[id];
        if (ov) {
          ov.item.r = read ? 1 : 0;
          ov.item.sr = secTotal ? Math.min(secRead, secTotal) : 0;
          this._recomputeOverviewChapter(ov.ch);
        }
        if (cacheItem) {
          cacheItem.read = read;
          cacheItem.readAt = read ? (readAt || new Date().toISOString()) : null;
          if (secTotal) { cacheItem.sectionsRead = secRead; cacheItem.sectionsTotal = secTotal; }
          this._recomputeChapterCache(code);
        }
        if (secTotal) {
          this.secReads[id] = read
            ? null // 由调用方按 headings 填充；这里只占位
            : [];
        }
      };
      // 乐观：按当前已知小节数联动（集合本体由阅读页按真实 headings 回填/拉取）
      const st = (cacheItem && cacheItem.sectionsTotal) || (ov && ov.item.st) || 0;
        apply(next, new Date().toISOString(), next ? st : 0, st);
      if (!next) {
        this.secReads[id] = [];
      }
      const r = await postJSON("/api/read", { id, read: next });
      if (r.d.error || !r.ok) {
        apply(before.read, null, before.sec ? before.sec.length : 0, st);
        if (before.sec) this.secReads[id] = before.sec;
        return { error: r.d.error || "网络错误" };
      }
      apply(r.d.read, r.d.readAt, r.d.sectionsRead, r.d.sectionsTotal);
      return { ok: true, data: r.d };
    },

    /* ---- 小节划掉：联动自动盖章/撤章由服务端裁决 ---- */
    async toggleSection(articleId, headingId, headings, next) {
      const before = [...(this.secReads[articleId] || [])];
      const set = new Set(before);
      if (next) set.add(headingId); else set.delete(headingId);
      this.secReads[articleId] = [...set];
      const wasRead = !!this.reads[articleId];
      const r = await postJSON("/api/section-read", { article: articleId, heading: headingId, read: next });
      if (r.d.error || !r.ok) {
        this.secReads[articleId] = before;
        return { error: r.d.error || "网络错误" };
      }
      const d = r.d;
      if (typeof d.articleRead === "boolean" && d.articleRead !== wasRead) {
        const code = this._codeOf(articleId);
        const ov = this._findOverviewItem(articleId);
        const cacheItem = code ? this._findChapterItem(code, articleId) : null;
        if (d.articleRead) this.reads[articleId] = true; else delete this.reads[articleId];
        if (ov) {
          ov.item.r = d.articleRead ? 1 : 0;
          ov.item.sr = d.sectionsRead;
          this._recomputeOverviewChapter(ov.ch);
        }
        if (cacheItem) {
          cacheItem.read = d.articleRead;
          cacheItem.readAt = d.articleRead ? new Date().toISOString() : null;
          cacheItem.sectionsRead = d.sectionsRead;
          cacheItem.sectionsTotal = d.sectionsTotal;
          this._recomputeChapterCache(code);
        }
      }
      return { ok: true, data: d };
    },

    /* ---- 整章批量：服务端完成后全量刷新 ---- */
    async bulk(code, read) {
      const r = await postJSON("/api/bulk", { code, read });
      if (r.d.error || !r.ok) return { error: r.d.error || "网络错误" };
      await Promise.all([this.loadOverview(), this.loadChapter(code)]);
      return { ok: true };
    },
    async refreshAfterExternal() {
      await this.loadOverview();
      await this.loadReads();
      await Promise.all(Object.keys(this.chapters).map((code) => this.loadChapter(code)));
    },
  },
});
