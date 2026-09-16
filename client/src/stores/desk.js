/* 外壳数据：目录（/api/desk）、进度库探测（45s 轮询）、最近打开。
   目录失败外壳照样能开窗导航 —— 只有进度数字需要库。 */
import { defineStore } from "pinia";
import { getJSON } from "../api";

const KEY_RECENT = "desk:recent";

function loadRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY_RECENT) || "");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export const useDesk = defineStore("desk", {
  state: () => ({
    catalog: null,        // { __fail } | { javaguide, jbl }
    catalogReq: null,
    progress: { javaguide: null, jbl: null },   // { done, total } | null
    dbOk: null,           // null=检测中 true/false
    recent: loadRecent(),
    _probeTimer: 0,
  }),
  getters: {
    toc: (s) => (appId) => {
      const c = s.catalog;
      return c && !c.__fail ? c[appId] : null;
    },
  },
  actions: {
    loadCatalog() {
      if (this.catalogReq) return this.catalogReq;
      this.catalogReq = getJSON("/api/desk").then((d) => {
        this.catalog = d && d.javaguide ? d : { __fail: 1 };
        return this.catalog;
      });
      return this.catalogReq;
    },
    async probeDb() {
      let got = 0, ok = 0;
      const settle = () => {
        if (got < 2) return;
        this.dbOk = ok > 0;
      };
      const ov = await getJSON("/api/overview");
      got++;
      if (ov && typeof ov.read === "number") {
        this.progress.javaguide = { done: ov.read, total: ov.total };
        ok++;
      }
      settle();
      const jbl = await getJSON("/api/jbl/progress");
      got++;
      if (jbl && Array.isArray(jbl.ids)) {
        const cat = await this.loadCatalog();
        this.progress.jbl = { done: jbl.ids.length, total: (cat && cat.jbl && cat.jbl.total) || 308 };
        ok++;
      }
      settle();
    },
    startPolling() {
      this.loadCatalog();
      this.probeDb();
      clearInterval(this._probeTimer);
      this._probeTimer = setInterval(() => this.probeDb(), 45000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) this.probeDb(); });
    },
    rememberRecent(url, title) {
      let list = Array.isArray(this.recent) ? this.recent.slice() : [];
      list = list.filter((r) => r.url !== url);
      list.unshift({ url, title, ts: Date.now() });
      this.recent = list.slice(0, 12);
      try { localStorage.setItem(KEY_RECENT, JSON.stringify(this.recent)); } catch { /* 忽略 */ }
    },
  },
});
