/* JBL 火箭题库 · 共享逻辑：进度存取（MySQL 为主）、模式切换、Toast */
(function () {
  'use strict';

  var KEY_MASTERED = 'jbl-rocket:mastered';
  var KEY_MODE = 'jbl-rocket:mode';
  var API_PROGRESS = '/api/jbl/progress';
  var API_MIGRATE = '/api/jbl/migrate';
  var API_RESET = '/api/jbl/reset';

  /* ---- 进度存储：本机 MySQL 为主，localStorage 是镜像与离线后备 ----
     · http(s) 打开：启动时从 /api/jbl/progress 拉全量，之后每次打勾写库；
       写库失败（服务没起 / MySQL 没起）自动降级为「暂存本机」并提示。
     · file:// 直开：不发请求，行为与纯浏览器存储版一致。
     · 首次连库且库里为空、本机镜像有进度 —— 一次性搬进库，迁移不丢进度。 */
  var mem = {};
  try { mem = JSON.parse(localStorage.getItem(KEY_MASTERED) || '{}') || {}; } catch (e) { mem = {}; }
  function mirror() {
    try { localStorage.setItem(KEY_MASTERED, JSON.stringify(mem)); } catch (e) { /* 隐私模式等 */ }
  }
  var storage = 'checking';   // checking | mysql | local

  function setStorage(s) {
    storage = s;
    var el = document.getElementById('store-state');
    if (el) el.textContent = s === 'mysql' ? '进度存于本机 MySQL'
      : (s === 'local' ? '进度暂存本机浏览器（未连到进度库）' : '进度库检测中…');
  }
  function fireProgress() {
    document.dispatchEvent(new CustomEvent('jbl:progress', { detail: { storage: storage } }));
  }
  function postJson(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  }

  function pullFromServer() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') {
      setStorage('local'); fireProgress(); return;
    }
    fetch(API_PROGRESS, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (j) {
        var ids = j.ids || [];
        var localIds = Object.keys(mem);
        if (!ids.length && localIds.length) {
          postJson(API_MIGRATE, { ids: localIds }).then(function () {
            mem = {}; localIds.forEach(function (id) { mem[id] = 1; });
            mirror();
          }).catch(function () { /* 迁移失败不拦路：以本地镜像继续 */ });
        } else {
          mem = {}; ids.forEach(function (id) { mem[id] = 1; });
        }
        setStorage('mysql');
        mirror();
        fireProgress();
      })
      .catch(function () { setStorage('local'); fireProgress(); });
  }

  var JBL = {
    data: window.JBL_DATA,

    /** 当前进度存储形态：checking | mysql | local */
    storageMode: function () { return storage; },

    isDone: function (id) { return !!mem[id]; },

    /** 切换掌握状态；返回切换后的布尔值。乐观更新 + 写库，失败自动降级为本机暂存 */
    toggle: function (id) {
      var done;
      if (mem[id]) { delete mem[id]; done = false; } else { mem[id] = 1; done = true; }
      mirror();
      if (storage === 'mysql') {
        postJson(API_PROGRESS, { id: id, done: done }).catch(function () {
          setStorage('local');
          JBL.toast('进度库断开，这条先记在本机浏览器');
        });
      }
      return done;
    },

    reset: function () {
      mem = {};
      mirror();
      if (storage === 'mysql') {
        postJson(API_RESET, {}).catch(function () {
          setStorage('local');
          JBL.toast('进度库断开，重置只作用于本机暂存');
        });
      }
    },

    /** 某章已掌握数 */
    chapterDone: function (ch) {
      var n = 0;
      ch.questions.forEach(function (q) { if (mem[q.id]) n++; });
      return n;
    },

    totalDone: function () {
      var n = 0;
      this.data.chapters.forEach(function (c) { c.questions.forEach(function (q) { if (mem[q.id]) n++; }); });
      return n;
    },

    /* ---- 日间 / 夜间模式（默认日间） ---- */
    applyMode: function () {
      var m = 'day';
      try { m = localStorage.getItem(KEY_MODE) || 'day'; } catch (e) { /* ignore */ }
      document.documentElement.dataset.mode = (m === 'night') ? 'night' : 'day';
    },
    toggleMode: function () {
      var cur = document.documentElement.dataset.mode === 'night' ? 'night' : 'day';
      var next = cur === 'night' ? 'day' : 'night';
      try { localStorage.setItem(KEY_MODE, next); } catch (e) { /* ignore */ }
      document.documentElement.dataset.mode = next;
    },

    /* ---- Toast ---- */
    toast: (function () {
      var el = null, timer = null;
      return function (msg) {
        if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(timer);
        timer = setTimeout(function () { el.classList.remove('show'); }, 1600);
      };
    })(),

    /* ---- 通用元素构建 ---- */
    el: function (tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    },

    /* 顶栏（两页共用） */
    masthead: function (active) {
      var d = window.JBL_DATA;
      var head = document.createElement('header');
      head.className = 'masthead';
      var wrap = this.el('div', 'wrap');
      wrap.innerHTML =
        '<svg class="patch" viewBox="0 0 48 48" aria-hidden="true">' +
        '<circle cx="24" cy="24" r="22.5" fill="none" stroke="var(--accent)" stroke-width="1.6"/>' +
        '<circle cx="24" cy="24" r="19" fill="none" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 3"/>' +
        '<path d="M24 8c3.6 3.4 5.4 8 5.4 13.2 0 3.4-.8 6.6-2.2 9.4h-6.4c-1.4-2.8-2.2-6-2.2-9.4C18.6 16 20.4 11.4 24 8z" fill="var(--panel-3)" stroke="var(--ink)" stroke-width="1.3"/>' +
        '<circle cx="24" cy="19" r="2.4" fill="var(--info)"/>' +
        '<path d="M18.9 27.5 15 33.5l4.6-1.6M29.1 27.5 33 33.5l-4.6-1.6" fill="none" stroke="var(--ink)" stroke-width="1.3"/>' +
        '<path d="M22 31.5c.3 2.8 1 4.6 2 6.5 1-1.9 1.7-3.7 2-6.5z" fill="var(--accent)"/>' +
        '</svg>';
      var box = this.el('div');
      var h1 = this.el('h1', 'masthead-title');
      h1.appendChild(document.createTextNode('JBL 火箭题库'));
      var sup = this.el('span', 'sup', 'MISSION');
      h1.appendChild(sup);
      var sub = this.el('p', 'masthead-sub');
      sub.innerHTML = '<b>' + d.chapters.length + '</b> 个系统 · <b>' + d.meta.total +
        '</b> 项检查 · <span id="store-state">进度库检测中…</span>';
      box.appendChild(h1); box.appendChild(sub);
      wrap.appendChild(box);

      var grow = this.el('div', 'grow');
      wrap.appendChild(grow);

      var btn = this.el('button', 'mode-btn');
      btn.type = 'button';
      btn.title = '日间 / 夜间模式';
      btn.setAttribute('aria-label', '切换日间/夜间模式');
      btn.innerHTML =
        '<svg class="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5"/></svg>' +
        '<svg class="ico-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z"/></svg>';
      var self = this;
      btn.addEventListener('click', function () { self.toggleMode(); });
      wrap.appendChild(btn);
      head.appendChild(wrap);
      setStorage(storage);   // 顶栏就位后立刻同步一次存储状态（拉取可能先于建栏完成）
      return head;
    },
  };

  window.JBL = JBL;
  JBL.applyMode();
  pullFromServer();
})();
