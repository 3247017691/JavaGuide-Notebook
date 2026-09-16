/* 窗口管理器：每应用一窗、多标签、历史栈、层叠/最小化/最大化/分屏、会话持久化。
   行为规格逐一对应原 desktop.js；rect 直接作为响应式状态由 WinFrame 绑定。 */
import { defineStore } from "pinia";
import { APPS, appById } from "../lib/apps";
import { safeHref } from "../lib/nburl";
import { useUi } from "./ui";
import { useDesk } from "./desk";

const KEY_SESSION = "desk:session";
const MB_H = 28; // 菜单栏高度：窗口坐标以菜单栏下沿为原点（stage 的 top 偏移）
const SIDE_MIN = 168, SIDE_MAX = 340, SIDE_DEF = 226;

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function loadJSON(key, def) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "");
    return v && typeof v === "object" ? v : def;
  } catch { return def; }
}
function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 忽略 */ } }

export const useWins = defineStore("wins", {
  state: () => ({
    wins: {},
    order: [],
    front: null,
    zTop: 10,
    tabSeq: 0,
    maxPrev: {},
    sideW: SIDE_DEF,
  }),
  getters: {
    frontWin(s) { return s.front && s.wins[s.front] ? s.wins[s.front] : null; },
    frontTab(s) {
      const w = s.front && s.wins[s.front];
      return w ? w.tabs[w.i] : null;
    },
    minimized(s) { return Object.keys(s.wins).filter((id) => s.wins[id].min); },
    running(s) { return new Set(Object.keys(s.wins)); },
  },
  actions: {
    stage() {
      const w = window.innerWidth, h = window.innerHeight - MB_H;
      return w < 200 || h < 200
        ? { w: Math.max(w, 640), h: Math.max(h, 480) }
        : { w, h };
    },
    defaultRect(a, n) {
      const S = this.stage();
      const ww = Math.min(a.w || 1024, Math.max(S.w - 60, 320));
      const hh = Math.min(a.h || 700, Math.max(S.h - 40, 240));
      const x = clamp(Math.round((S.w - ww) / 2) + (n * 34 - 17), 8, Math.max(S.w - ww - 8, 8));
      const y = clamp(Math.round((S.h - hh) / 2.4) + (n * 30 - 15), 8, Math.max(S.h - hh - 8, 8));
      return { x, y, w: ww, h: hh };
    },

    openApp(id, opts = {}) {
      const a = appById[id];
      if (!a) return null;
      if (this.wins[id]) {
        if (this.wins[id].min) this.setMin(id, false);
        this.focusWin(id);
        if (opts.url) this.go(id, opts.url);
        return this.wins[id];
      }
      const S = this.stage();
      const r = (opts.rect && opts.rect.w > 60 && opts.rect.h > 60) ? opts.rect : this.defaultRect(a, this.order.length);
      r.w = Math.min(r.w, S.w); r.h = Math.min(r.h, S.h);
      r.x = clamp(r.x, 0, Math.max(S.w - r.w, 0));
      r.y = clamp(r.y, 0, Math.max(S.h - r.h, 0));

      const win = {
        id, appId: id,
        rect: { x: r.x, y: r.y, w: r.w, h: r.h },
        min: false, max: false, tile: null,
        noSide: !!opts.noSide,
        sideW: clamp(Number(opts.sideW) || this.sideW, SIDE_MIN, SIDE_MAX),
        tabs: [], i: 0,
      };
      this.wins[id] = win;

      const saved = (opts.tabs || []).map((t) => {
        const u = safeHref(t && (t.url || t));
        return u ? { url: u, hi: t.hi, hist: (t.hist || []).map(safeHref).filter(Boolean), title: t.title } : null;
      }).filter(Boolean);
      if (!saved.length) saved.push({ url: safeHref(opts.url) || a.src });
      saved.forEach((t) => this.addTab(id, t.url, t));
      win.i = clamp(Number(opts.i) || 0, 0, win.tabs.length - 1);

      if (opts.max) this.toggleMax(id, true);
      else if (opts.tile) this.tile(id, opts.tile, true);
      this.focusWin(id);
      if (!opts.silent) {
        const ui = useUi();
        ui.launchpad = false;
        document.dispatchEvent(new CustomEvent("dock-bounce", { detail: id }));
      }
      this.saveSession();
      return win;
    },

    closeWin(id) {
      const w = this.wins[id];
      if (!w) return;
      w.closing = true;
      setTimeout(() => {
        delete this.wins[id];
        this.order = this.order.filter((x) => x !== id);
        if (this.front === id) {
          this.front = null;
          const next = this.order.slice().reverse().find((x) => this.wins[x] && !this.wins[x].min);
          if (next) this.focusWin(next);
        }
        this.saveSession();
      }, 200);
    },

    setMin(id, on) {
      const w = this.wins[id];
      if (!w) return;
      w.min = on;
      if (on) {
        if (this.front === id) {
          this.front = null;
          const rest = this.order.slice().reverse().find((x) => x !== id && this.wins[x] && !this.wins[x].min);
          if (rest) this.focusWin(rest);
        }
      } else {
        this.focusWin(id);
      }
      this.saveSession();
    },
    hideAll() { Object.keys(this.wins).forEach((id) => this.setMin(id, true)); },
    showAll() { Object.keys(this.wins).forEach((id) => { if (this.wins[id].min) this.setMin(id, false); }); },

    toggleMax(id, force) {
      const w = this.wins[id];
      if (!w) return;
      const want = typeof force === "boolean" ? force : !w.max;
      if (!want && !w.max && !w.tile) return;
      if (w.max || w.tile) { this.unmax(id); return; }
      this.maxPrev[id] = { ...w.rect, tile: w.tile };
      const S = this.stage();
      // 最大化铺满工作区（菜单栏下沿 → 页面最底端），程序坞悬浮在窗口上方
      w.rect = { x: 0, y: 0, w: S.w, h: S.h };
      w.max = true; w.tile = null;
      this.focusWin(id);
      this.saveSession();
    },
    unmax(id) {
      const w = this.wins[id];
      if (!w) return;
      const prev = this.maxPrev[id];
      w.max = false; w.tile = null;
      if (prev && prev.w > 60) w.rect = { x: prev.x, y: prev.y, w: prev.w, h: prev.h };
      this.saveSession();
    },
    tile(id, side, quiet) {
      const w = this.wins[id];
      if (!w) return;
      const S = this.stage();
      if (!w.max && !w.tile) this.maxPrev[id] = { ...w.rect };
      const half = Math.round(S.w / 2);
      w.max = false;
      // 半屏同样铺到页面最底端，坞悬浮在上
      w.rect = { x: side === "right" ? half : 0, y: 0, w: half, h: S.h };
      w.tile = side;
      this.focusWin(id);
      if (!quiet) useUi().showToast(side === "left" ? "窗口已贴到左半屏" : "窗口已贴到右半屏");
      this.saveSession();
    },
    tileAll() {
      const ids = this.order.slice(-2);
      if (ids.length < 2) { useUi().showToast("并列排布需要两个窗口", true); return; }
      ids.forEach((x, i) => { if (this.wins[x].min) this.setMin(x, false); this.tile(x, i ? "right" : "left", true); });
      useUi().showToast("两个窗口已并列排布");
    },

    focusWin(id) {
      const w = this.wins[id];
      if (!w) return;
      this.zTop += 1;
      w.z = this.zTop;
      this.front = id;
      this.order = this.order.filter((x) => x !== id);
      this.order.push(id);
      this.saveSession();
    },
    cycleWin() {
      const list = this.order.filter((id) => this.wins[id] && !this.wins[id].min);
      if (list.length < 2) { useUi().showToast("只有一个窗口开着"); return; }
      const i = list.indexOf(this.front);
      const next = list[(i + 1) % list.length];
      this.focusWin(next);
      useUi().showToast("已切到「" + appById[this.wins[next].appId].name + "」");
    },
    dockClick(id) {
      const w = this.wins[id];
      if (!w) { this.openApp(id); return; }
      if (w.min) { this.setMin(id, false); this.focusWin(id); return; }
      if (this.front === id) { this.setMin(id, true); return; }
      this.focusWin(id);
    },

    /* ---------------- 标签页 ---------------- */
    addTab(winId, url, saved) {
      const w = this.wins[winId];
      if (!w) return null;
      const t = {
        id: ++this.tabSeq,
        url,
        title: (saved && saved.title) || "",
        hist: saved && saved.hist && saved.hist.length ? saved.hist.slice(-40) : [url],
        hi: 0,
        loading: true,
        rt: 0,
      };
      if (t.hist[t.hist.length - 1] !== url) t.hist.push(url);
      t.hi = clamp(saved && typeof saved.hi === "number" ? saved.hi : t.hist.length - 1, 0, t.hist.length - 1);
      w.tabs.push(t);
      return t;
    },
    tabNew(winId, url) {
      const w = this.wins[winId] || this.frontWin;
      if (!w) return;
      if (w.tabs.length >= 9) { useUi().showToast("标签页已到 9 个上限，先关几个", true); return; }
      this.addTab(w.id, safeHref(url) || appById[w.appId].src);
      w.i = w.tabs.length - 1;
      this.focusWin(w.id);
      this.saveSession();
    },
    tabClose(winId, tabId) {
      const w = this.wins[winId];
      if (!w) return;
      const idx = tabId ? w.tabs.findIndex((x) => x.id === tabId) : w.i;
      if (idx < 0) return;
      if (w.tabs.length === 1) { this.closeWin(w.id); return; }
      w.tabs.splice(idx, 1);
      if (w.i > idx) w.i--;
      else if (w.i >= w.tabs.length) w.i = w.tabs.length - 1;
      this.saveSession();
    },
    closeOthers(winId, tabId) {
      const w = this.wins[winId];
      if (!w) return;
      const keep = w.tabs.find((t) => t.id === tabId);
      if (!keep) return;
      w.tabs = [keep];
      w.i = 0;
      this.saveSession();
    },
    showTab(winId, tabId) {
      const w = this.wins[winId];
      if (!w) return;
      if (tabId) {
        const k = w.tabs.findIndex((t) => t.id === tabId);
        if (k >= 0) w.i = k;
      }
      this.saveSession();
    },
    cycleTab(back) {
      const w = this.frontWin;
      if (!w || w.tabs.length < 2) return;
      const next = (w.i + (back ? -1 : 1) + w.tabs.length) % w.tabs.length;
      w.i = next;
      this.saveSession();
    },

    /* ---------------- 导航 ---------------- */
    go(winId, href) {
      const w = this.wins[winId] || this.frontWin;
      if (!w) return;
      const t = w.tabs[w.i];
      if (!t) return;
      href = safeHref(href) || appById[w.appId].src;
      if (t.url === href) { this.tabReload(winId); return; }
      t.hist = t.hist.slice(0, t.hi + 1);
      t.hist.push(href);
      t.hi = t.hist.length - 1;
      if (t.hist.length > 40) { t.hist.shift(); t.hi--; }
      t.url = href;
      t.title = "";
      t.loading = appById[w.appId].native ? false : true;
      useDesk().rememberRecent(href, "");
      // 窄屏侧栏抽屉：选完就收
      this.saveSession();
    },
    tabBack(winId) {
      const w = this.wins[winId] || this.frontWin;
      const t = w && w.tabs[w.i];
      if (!w || !t || t.hi <= 0) return;
      t.hi--;
      t.url = t.hist[t.hi];
      t.loading = !appById[w.appId].native;
      this.saveSession();
    },
    tabForward(winId) {
      const w = this.wins[winId] || this.frontWin;
      const t = w && w.tabs[w.i];
      if (!w || !t || t.hi >= t.hist.length - 1) return;
      t.hi++;
      t.url = t.hist[t.hi];
      t.loading = !appById[w.appId].native;
      this.saveSession();
    },
    tabReload(winId) {
      const w = this.wins[winId] || this.frontWin;
      const t = w && w.tabs[w.i];
      if (!t) return;
      t.rt = (t.rt || 0) + 1;
      if (!appById[w.appId].native) t.loading = true;
    },
    tabLoaded(winId, tabId, title) {
      const w = this.wins[winId];
      if (!w) return;
      const t = w.tabs.find((x) => x.id === tabId);
      if (!t) return;
      t.loading = false;
      if (title) t.title = title;
      this.saveSession();
    },
    /* iframe 内部导航后同步 URL/历史/标题（原 onFrameSync 的等价物） */
    frameSync(winId, tabId, url, title) {
      const w = this.wins[winId];
      if (!w) return;
      const t = w.tabs.find((x) => x.id === tabId);
      if (!t) return;
      if (url && t.url !== url) {
        t.url = url;
        if (t.hist[t.hi] !== url) {
          t.hist = t.hist.slice(0, t.hi + 1);
          t.hist.push(url);
          t.hi = t.hist.length - 1;
          if (t.hist.length > 40) { t.hist.shift(); t.hi--; }
        }
        if (title) useDesk().rememberRecent(url, title);
      }
      if (title) t.title = title;
      this.saveSession();
    },
    setTabTitle(winId, tabId, title) {
      const w = this.wins[winId];
      if (!w) return;
      const t = w.tabs.find((x) => x.id === tabId);
      if (!t) return;
      t.title = title || "";
      this.saveSession();
    },

    /* ---------------- 侧栏 ---------------- */
    toggleSide(winId) {
      const w = this.wins[winId] || this.frontWin;
      if (!w) return;
      w.noSide = !w.noSide;
      this.saveSession();
    },
    setSideW(winId, px) {
      const w = this.wins[winId];
      if (w) w.sideW = clamp(px, SIDE_MIN, SIDE_MAX);
      this.sideW = clamp(px, SIDE_MIN, SIDE_MAX);
      const prefs = JSON.parse(localStorage.getItem("desk:prefs") || "{}");
      prefs.sideW = this.sideW;
      saveJSON("desk:prefs", prefs);
      this.saveSession();
    },

    /* ---------------- 会话 ---------------- */
    saveSession() {
      clearTimeout(this._st);
      this._st = setTimeout(() => {
        const s = { v: 2, wins: {}, order: [], front: this.front };
        this.order.forEach((id) => {
          const w = this.wins[id];
          if (!w || !(w.rect.w > 60 && w.rect.h > 60)) return;
          s.wins[id] = {
            x: w.rect.x, y: w.rect.y, w: w.rect.w, h: w.rect.h,
            max: w.max ? 1 : 0, min: w.min ? 1 : 0, tile: w.tile || 0,
            noSide: w.noSide ? 1 : 0, sideW: w.sideW, i: w.i,
            tabs: w.tabs.map((t) => ({ url: t.url, title: t.title, hist: t.hist, hi: t.hi })),
          };
        });
        s.order = this.order.filter((id) => !!s.wins[id]);
        saveJSON(KEY_SESSION, s);
      }, 200);
    },
    restoreSession() {
      const s = loadJSON(KEY_SESSION, {});
      const ids = s.order || [];
      if (!ids.length) return;
      ids.forEach((id, i) => {
        const g = s.wins && s.wins[id];
        if (!g || !appById[id]) return;
        setTimeout(() => {
          this.openApp(id, {
            rect: { x: g.x, y: g.y, w: g.w, h: g.h }, tabs: g.tabs, i: g.i,
            noSide: !!g.noSide, sideW: g.sideW, max: !!g.max, tile: g.tile || null, silent: true,
          });
        }, i * 90);
      });
      setTimeout(() => {
        if (s.front && this.wins[s.front]) {
          if (this.wins[s.front].min) this.setMin(s.front, false);
          this.focusWin(s.front);
        }
        Object.keys(this.wins).forEach((id) => { if (s.wins[id] && s.wins[id].min) this.setMin(id, true); });
      }, ids.length * 90 + 80);
    },
    fitWindows() {
      const S = this.stage();
      Object.keys(this.wins).forEach((id) => {
        const w = this.wins[id];
        if (w.max) { w.rect.w = S.w; w.rect.h = S.h; }
        else if (w.tile) { this.tile(id, w.tile, true); return; }
        else {
          w.rect.w = Math.min(w.rect.w, S.w);
          w.rect.h = Math.min(w.rect.h, S.h);
          w.rect.x = clamp(w.rect.x, 0, Math.max(S.w - w.rect.w, 0));
          w.rect.y = clamp(w.rect.y, 0, Math.max(S.h - w.rect.h, 0));
        }
      });
      this.saveSession();
    },

    /* 整章划线（外壳菜单/面板入口）：确认走 UI，写库走小抄接口 */
    async bulkChapter() {
      const w = this.frontWin;
      const t = w && w.tabs[w.i];
      const { chapterOf } = await import("../lib/nburl");
      const desk = useDesk();
      await desk.loadCatalog();
      const code = t ? chapterOf(t.url, desk.catalog && desk.catalog.javaguide && desk.catalog.javaguide.routes) : null;
      if (!code) { useUi().showToast("当前页面不属于任何一章，换个位置再试", true); return; }
      const toc = desk.catalog && desk.catalog[w.appId === "jbl" ? "jbl" : "javaguide"];
      let name = code;
      if (toc) toc.chapters.forEach((c) => { if (c.code === code) name = c.name; });
      const ui = useUi();
      const { ElMessageBox } = await import("element-plus");
      try {
        await ElMessageBox.confirm(
          `「${name}」的全部篇目都会落朱线，小节同步划满。这一步会写进本机进度库，撤消需要逐篇退回。`,
          "把整章标记为已读？",
          { confirmButtonText: "确认划线", cancelButtonText: "取消", type: "warning" },
        );
      } catch { return; }
      const { postJSON } = await import("../api");
      const r = await postJSON("/api/bulk", { code, read: true });
      if (!r.ok || r.d.error) { ui.showToast(r.d.error || "进度库未启动，写不进去", true); return; }
      ui.showToast(`「${name}」整章已划线`);
      const { useNotebook } = await import("./notebook");
      const nb = useNotebook();
      nb.refreshAfterExternal();
      if (w) this.tabReload(w.id);
    },

    run(act, arg) {
      const w = this.frontWin;
      switch (act) {
        case "back": return this.tabBack(w && w.id);
        case "forward": return this.tabForward(w && w.id);
        case "reload": return this.tabReload(w && w.id);
        case "side-toggle": return this.toggleSide(w && w.id);
        case "tab-new": return this.tabNew(w && w.id);
        case "tab-close": return this.tabClose(w && w.id);
        case "win-close": return w && this.closeWin(w.id);
        case "win-min": return w && this.setMin(w.id, true);
        case "win-max": return w && this.toggleMax(w.id);
        case "tile:left": return w && this.tile(w.id, "left");
        case "tile:right": return w && this.tile(w.id, "right");
        case "tile:all": return this.tileAll();
        case "palette": return useUi().openPalette();
        case "opaque": { usePrefsToggle(); return; }
        case "cycle-theme": {
          import("./prefs").then(({ usePrefs }) => usePrefs().cycleTheme());
          return;
        }
        case "theme:auto": case "theme:light": case "theme:dark": {
          import("./prefs").then(({ usePrefs }) => usePrefs().setTheme(act.slice(6)));
          return;
        }
        case "about": return useUi().openSheet("about");
        case "prefs": return useUi().openSheet("prefs");
        case "guide": return useUi().openSheet("guide");
        case "shortcuts": return useUi().openSheet("shortcuts");
        case "closeall": return Object.keys(this.wins).forEach((id) => this.closeWin(id));
        case "cycle-win": return this.cycleWin();
        case "cycle-tab": return this.cycleTab(!!arg);
        case "hide-all": return this.hideAll();
        case "show-all": return this.showAll();
        case "launchpad": return useUi().openLaunchpad();
        case "reload-desk": return location.reload();
        case "bulk:chapter": return this.bulkChapter();
        default:
          if (act && act.indexOf("open:") === 0) return this.dockClick(act.slice(5));
          if (act && act.indexOf("goto:") === 0) return this.gotoModule(act.slice(5));
          useUi().showToast("没有这个动作：" + act, true);
      }
    },
    gotoModule(href) {
      const app = String(href).indexOf("/jbl/") === 0 ? "jbl" : "javaguide";
      if (this.wins[app]) this.go(app, href);
      else this.openApp(app, { url: href });
    },
    openRecent(r) {
      const app = String(r.url || "").indexOf("/jbl/") === 0 ? "jbl" : "javaguide";
      if (this.wins[app]) this.go(app, r.url);
      else this.openApp(app, { url: r.url });
    },
  },
});

function usePrefsToggle() {
  import("./prefs").then(({ usePrefs }) => usePrefs().toggleOpaque());
}

export { SIDE_MIN, SIDE_MAX, SIDE_DEF };
