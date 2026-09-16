/* ============================================================
   面试工作台 · 桌面外壳逻辑
   ------------------------------------------------------------
   职责边界：外壳只管「窗口 / 标签 / 侧栏 / 菜单 / 主题 / 快捷键」，
   不碰 iframe 里两个应用的内容与视觉世界。外壳与子应用之间只有三条通道：
     1. 同源直读 —— contentWindow.location / document.title 用来同步标签标题与侧栏高亮
     2. 主题下发 —— 优先调子应用自己的 DESK_applyMode()（它带 mermaid 重绘等副作用），
        调不到才退化成「写 localStorage + 改 data-mode」
     3. 桥接上报 —— 子应用里的 desk-bridge.js 把窗口内按下的快捷键回传给外壳

   没有右键也能用：同一份动作清单有四条入口 —— 顶部菜单栏、工具栏「⋯」、
   指针菜单（右键或长按 0.5 秒，同一实现）、⌘K 命令面板。加上一套键盘快捷键。
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 被嵌在窗口里说明是误入（比如小抄面包屑点了「桌面」），拉回真桌面 ---------- */
  if (window.top !== window.self) {
    try { window.top.location.replace('/'); } catch (e) { /* 跨域无权跳转，安静留在原地 */ }
    return;
  }

  /* ============================ 0. 工具 ============================ */
  var APPS = window.DESK_APPS || [];
  var GLYPH = window.DESK_GLYPHS || {};
  var ICONS = window.DESK_ICONS || {};
  var byId = {};
  APPS.forEach(function (a, i) { a.idx = i; byId[a.id] = a; });

  var KEY_SESSION = 'desk:session', KEY_PREF = 'desk:prefs', KEY_RECENT = 'desk:recent';
  var DOCK_BASE = 48, DOCK_MAX = 1.5, DOCK_SPAN = 46;
  var DOCK_KEEP = 92;                 /* 最大化 / 分屏时给程序坞留的空 */
  var SIDE_MIN = 168, SIDE_MAX = 340, SIDE_DEF = 226;
  var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  var MOD = isMac ? '⌘' : 'Ctrl';
  var MODK = isMac ? '⌘' : 'Ctrl+';

  function $(id) { return document.getElementById(id); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function gl(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (GLYPH[name] || '') + '</svg>';
  }
  function toURL(href) { try { return new URL(href, location.origin); } catch (e) { return null; } }
  /* 会话从 localStorage 恢复，落地前必须校验：只收同源绝对路径，挡掉 //evil 与 javascript: */
  function safeHref(h) {
    if (typeof h !== 'string' || h.charAt(0) !== '/' || h.slice(0, 2) === '//') return null;
    return h;
  }
  function loadJSON(key, def) {
    try { var v = JSON.parse(localStorage.getItem(key) || ''); return (v && typeof v === 'object') ? v : def; }
    catch (e) { return def; }
  }
  function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { } }
  function debounce(fn, ms) {
    var t = 0; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
  }
  function shortTitle(t) {
    var s = (t && (t.title || t.url)) || '';
    s = String(s).replace(/^https?:\/\/[^/]+/, '') || '（无标题）';
    return s.length > 26 ? s.slice(0, 25) + '…' : s;
  }

  var stage = $('stage'), layer = $('win-layer'), dock = $('dock'), dockWins = $('dock-wins'),
    iconsBox = $('desk-icons'), mbApp = $('mb-app'), mbMenus = $('mb-menus'),
    mbLogo = $('mb-logo'), mbTheme = $('mb-theme');
  function stageRect() { return { w: stage.clientWidth, h: stage.clientHeight }; }

  /* ============================ 1. 偏好与主题 ============================ */
  var prefs = loadJSON(KEY_PREF, {});
  if (['auto', 'light', 'dark'].indexOf(prefs.theme) < 0) prefs.theme = 'auto';
  prefs.opaque = prefs.opaque ? 1 : 0;
  prefs.sideW = clamp(Number(prefs.sideW) || SIDE_DEF, SIDE_MIN, SIDE_MAX);
  function savePrefs() { saveJSON(KEY_PREF, prefs); }

  var mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  function resolvedTheme() {
    if (prefs.theme === 'light' || prefs.theme === 'dark') return prefs.theme;
    return mqDark.matches ? 'dark' : 'light';
  }
  function modeOfTheme(t) { return t === 'dark' ? 'night' : 'day'; }
  function themeLabel(t) { return t === 'auto' ? '跟随系统' : (t === 'light' ? '浅色' : '深色'); }
  function applyTheme() {
    var t = resolvedTheme();
    document.documentElement.dataset.deskTheme = t;
    document.documentElement.dataset.deskOpaque = prefs.opaque ? '1' : '0';
    mbTheme.innerHTML = gl(t === 'dark' ? 'moon' : 'sun');
    mbTheme.setAttribute('title', '外观：' + themeLabel(prefs.theme));
    mbTheme.setAttribute('aria-label', '外观：' + themeLabel(prefs.theme) + '，点击切换');
    broadcastTheme();
    savePrefs();
  }
  function onSchemeChange() { if (prefs.theme === 'auto') applyTheme(); }
  if (mqDark.addEventListener) mqDark.addEventListener('change', onSchemeChange);
  else if (mqDark.addListener) mqDark.addListener(onSchemeChange);   /* Safari < 14 */

  function setTheme(mode, quiet) {
    prefs.theme = mode; applyTheme();
    if (!quiet) toast('外观：' + themeLabel(mode));
  }
  function cycleTheme() {
    var seq = ['auto', 'light', 'dark'];
    setTheme(seq[(seq.indexOf(prefs.theme) + 1) % seq.length]);
  }

  /* 主题下发：同源直改子文档，跨域静默失败（外部应用本来也拿不到）。
     「跟随系统」时 persist=false —— 只改这次渲染，不把用户的自动偏好写进应用的存储里，
     免得离开桌面单独打开小抄时被悄悄固化成 day/night。
     下发只有两个时机：标签页首次载入、外壳主题变化。不在每次 iframe load 上重推 ——
     应用内那颗夜读按钮改了偏好之后又被重推回去，两边就互相覆盖了。 */
  function pushTheme(tab, force) {
    var frame = tab && tab.frame; if (!frame) return;
    if (tab.pushed && !force) return;
    tab.pushed = 1;
    var mode = modeOfTheme(resolvedTheme());
    var persist = prefs.theme !== 'auto';
    try {
      var w = frame.contentWindow, d = w && w.document;
      if (!d || !d.documentElement) return;
      /* 应用自己的切换函数优先 —— 小抄的夜读还要重画 mermaid，裸改属性会留下旧配色 */
      if (typeof w.DESK_applyMode === 'function') { w.DESK_applyMode(mode, persist); return; }
      var app = byId[tab.appId];
      var key = (app && app.modeKey) || (/\/jbl\//.test(frame.src || '') ? 'jbl-rocket:mode' : 'read-mode');
      if (persist) { try { w.localStorage.setItem(key, mode); } catch (e) { } }
      d.documentElement.dataset.mode = mode;
    } catch (e) { /* 忽略 */ }
  }
  function broadcastTheme() {
    Object.keys(wins).forEach(function (id) { wins[id].tabs.forEach(function (t) { pushTheme(t, true); }); });
  }
  /* 子应用里自己点了夜读：只有外壳没做显式选择（跟随系统）时才跟着翻。
     显式选了浅色/深色时外壳是事实来源，那颗按钮只影响应用自己的页面。 */
  function adoptMode(mode) {
    if (prefs.theme !== 'auto') return;
    var want = mode === 'night' ? 'dark' : 'light';
    if (resolvedTheme() === want) return;
    prefs.theme = want; applyTheme();
    toast('外观已跟随应用：' + themeLabel(want));
  }

  /* ============================ 2. 数据：目录 / 搜索 / 进度 ============================ */
  var catalog = null, catalogReq = null;
  function loadCatalog() {
    if (catalogReq) return catalogReq;
    catalogReq = fetch('/api/desk', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : { __fail: 1 }; })
      .catch(function () { return { __fail: 1 }; })
      .then(function (d) {
        catalog = d || { __fail: 1 };
        if (catalog.__fail) catalog = { __fail: 1 };
        Object.keys(wins).forEach(function (id) { renderSidebar(wins[id]); });
        return catalog;
      });
    return catalogReq;
  }

  var progress = { javaguide: null, jbl: null };
  function probeDb(manual) {
    var chip = $('db-chip'), txt = $('db-text'), got = 0, ok = 0;
    if (manual) { chip.classList.remove('s-ok', 's-bad'); txt.textContent = '检测中…'; }
    function settle() {
      if (got < 2) return;
      chip.classList.remove('s-ok', 's-bad');
      if (!ok) { chip.classList.add('s-bad'); txt.textContent = '进度库未启动'; }
      else {
        chip.classList.add('s-ok');
        var a = progress.javaguide, b = progress.jbl;
        txt.textContent = '已读 ' + (a ? a.done + '/' + a.total : '?') + ' · 掌握 ' + (b ? b.done + '/' + b.total : '?');
      }
      Object.keys(wins).forEach(function (id) { paintSideFoot(wins[id]); });
    }
    getJSON('/api/overview').then(function (d) {
      got++;
      if (d && typeof d.read === 'number') { progress.javaguide = { done: d.read, total: d.total }; ok++; }
      settle();
    });
    getJSON('/api/jbl/progress').then(function (d) {
      got++;
      if (d && Array.isArray(d.ids)) {
        loadCatalog().then(function (c) {
          progress.jbl = { done: d.ids.length, total: (c.jbl && c.jbl.total) || 308 }; ok++; settle();
        });
      } else settle();
    });
  }
  function getJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  /* 单篇划线走小抄自己的接口：进度写库由服务端裁决，外壳不自己算 */
  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .catch(function (e) { return { ok: false, d: { error: (e && e.message) || '网络错误' } }; });
  }

  /* ============================ 3. 提示条与弹窗 ============================ */
  var toastEl = null, toastTimer = 0;
  function toast(msg, bad) {
    if (!toastEl) {
      toastEl = document.createElement('div'); toastEl.className = 'desk-toast';
      toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.classList.toggle('bad', !!bad);
    toastEl.innerHTML = '<span class="t-ic">' + gl(bad ? 'xmark' : 'checkmark') + '</span><span>' + esc(msg) + '</span>';
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  var scrim = null, sheetEl = null, sheetPrev = null;
  function closeSheet() {
    if (sheetEl) { sheetEl.remove(); sheetEl = null; }
    if (scrim) { scrim.remove(); scrim = null; }
    if (sheetPrev && sheetPrev.focus) { try { sheetPrev.focus(); } catch (e) { } }
    sheetPrev = null;
    document.removeEventListener('keydown', sheetKeys, true);
  }
  function sheetKeys(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeSheet(); return; }
    if (ev.key === 'Enter' && sheetEl && ev.target.tagName !== 'TEXTAREA' && !ev.target.closest('.sh-acts')) {
      var d = sheetEl.querySelector('[data-def]'); if (d) { ev.preventDefault(); d.click(); }
      return;
    }
    if (ev.key === 'Tab' && sheetEl) {                    /* 焦点圈在模态框里 */
      var f = sheetEl.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  }
  /* 确认框、说明面板、快捷键表共用：一条 title + 任意 html + 动作数组 */
  function sheet(o) {
    closeSheet(); closePopup();
    sheetPrev = document.activeElement;
    scrim = document.createElement('div'); scrim.className = 'scrim';
    scrim.addEventListener('click', closeSheet);
    sheetEl = document.createElement('section');
    sheetEl.className = 'sheet glass glass-thick' + (o.wide ? ' wide' : '');
    sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-modal', 'true');
    sheetEl.setAttribute('aria-label', o.title || '对话框');
    sheetEl.innerHTML = '<h2>' + esc(o.title || '') + '</h2>' +
      (o.html ? '<div class="sh-body">' + o.html + '</div>' : '') + '<div class="sh-acts"></div>';
    var acts = sheetEl.querySelector('.sh-acts');
    var list = o.actions || [{ label: '好', kind: 'pri' }];
    list.forEach(function (a, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn' + (a.kind ? ' ' + a.kind : '');
      b.textContent = a.label;
      b.addEventListener('click', function () { closeSheet(); if (a.fn) a.fn(); });
      if (a.kind === 'pri' || (!a.kind && i === 0)) b.dataset.def = '1';
      acts.appendChild(b);
    });
    document.body.appendChild(scrim); document.body.appendChild(sheetEl);
    var focusTo = o.focus ? sheetEl.querySelector(o.focus) : null;
    (focusTo || sheetEl.querySelector('[data-def]') || acts.firstChild).focus();
    document.addEventListener('keydown', sheetKeys, true);
    return sheetEl;
  }

  /* ============================ 4. 菜单引擎 ============================ */
  /* items 里每项：{label, glyph, kbd, checked, disabled, danger, title, sep, fn | act, arg}
     菜单栏、工具栏「⋯」、指针菜单（右键 / 长按）都吃同一份清单，动作只写一处。 */
  var popupEl = null, popupOwner = null, popupHi = -1;
  function closePopup() {
    if (popupEl) { popupEl.remove(); popupEl = null; }
    popupOwner = null; popupHi = -1;
    mbMenus.querySelectorAll('.mb-item.open').forEach(function (n) {
      n.classList.remove('open'); n.setAttribute('aria-expanded', 'false');
    });
  }
  function renderMenu(items, el) {
    el.innerHTML = '';
    items.forEach(function (it, i) {
      if (!it) return;
      if (it.sep) { var s = document.createElement('div'); s.className = 'menu-sep'; el.appendChild(s); return; }
      if (it.title) { var h = document.createElement('div'); h.className = 'menu-title'; h.textContent = it.title; el.appendChild(h); return; }
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.i = i;
      b.className = 'menu-item' + (it.danger ? ' danger' : '');
      b.setAttribute('role', 'menuitem');
      if (it.disabled) b.setAttribute('disabled', '');
      var left = it.glyph
        ? '<span class="mi-g">' + gl(it.glyph) + '</span>'
        : '<span class="tick">' + (it.checked ? '✓' : '') + '</span>';
      b.innerHTML = left + '<span>' + esc(it.label) + '</span>' + (it.kbd ? '<span class="kbd">' + esc(it.kbd) + '</span>' : '');
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (it.disabled) return;
        if (!it.keepOpen) { closePopup(); }
        if (it.fn) it.fn(); else if (it.act) run(it.act, it.arg);
      });
      el.appendChild(b);
    });
  }
  function mountPopup(items, o) {
    o = o || {};
    closeSheet();
    if (popupEl) closePopup();
    var el = document.createElement('div');
    el.className = 'menu-pop ctx glass glass-thick';
    el.setAttribute('role', 'menu');
    renderMenu(items, el);
    el.style.left = '0px'; el.style.top = '0px';
    document.body.appendChild(el);
    popupEl = el; popupOwner = o.owner || null;
    /* 贴边翻转：菜单宁可整体让位，也不能被屏幕切一半 */
    var r = el.getBoundingClientRect();
    var x = o.x, y = o.y;
    if (o.anchor) {
      var a = o.anchor.getBoundingClientRect();
      x = a.left; y = a.bottom + 3;
      if (x + r.width > innerWidth - 8) x = Math.max(8, a.right - r.width);
    } else {
      if (x + r.width > innerWidth - 8) x = Math.max(8, innerWidth - r.width - 8);
      if (y + r.height > innerHeight - 8) y = Math.max(8, (o.anchorY || y) - r.height - 6);
      if (y < 0) y = 8;
    }
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    popupHi = -1;
    return el;
  }
  function openPopup(spec) {
    var items = Array.isArray(spec) ? spec : spec.items;
    items = (items || []).filter(Boolean);
    if (!items.length) return null;
    var o = Array.isArray(spec) ? { x: lastPointer.x, y: lastPointer.y } : spec;
    var el = mountPopup(items, o);
    menuHi(firstEnabled(el));
    return el;
  }
  function firstEnabled(el) {
    var n = -1, btns = el.querySelectorAll('.menu-item');
    for (var i = 0; i < btns.length; i++) if (!btns[i].hasAttribute('disabled')) { n = i; break; }
    return n;
  }
  function menuHi(i) {
    if (!popupEl) return;
    var btns = popupEl.querySelectorAll('.menu-item');
    if (!btns.length) return;
    popupHi = (i + btns.length) % btns.length;
    btns.forEach(function (b, k) { b.classList.toggle('hi', k === popupHi); });
    if (btns[popupHi]) btns[popupHi].scrollIntoView({ block: 'nearest' });
  }
  function stepMenu(dir) {
    if (!popupEl) return;
    var btns = popupEl.querySelectorAll('.menu-item'), next = popupHi;
    for (var k = 0; k < btns.length; k++) {
      next += dir;
      if (next < 0) next = btns.length - 1;
      if (next >= btns.length) next = 0;
      if (!btns[next].hasAttribute('disabled')) break;
    }
    menuHi(next);
  }
  function activateMenu() {
    if (!popupEl || popupHi < 0) return;
    var b = popupEl.querySelectorAll('.menu-item')[popupHi];
    if (b) b.click();
  }

  /* ============================ 5. 指针菜单入口（右键 / 长按） ============================ */
  var lastPointer = { x: 0, y: 0 };
  document.addEventListener('pointerdown', function (ev) {
    lastPointer = { x: ev.clientX, y: ev.clientY };
  }, true);
  var swallowClick = false;

  /* 一个元素挂一份菜单：contextmenu 与长按共用 getItems()，
     于是「右键被环境禁掉」只是少了一条入口，不会少一个功能。 */
  function wirePointerMenu(el, getItems) {
    el.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
      openPopup({ items: getItems(ev), x: ev.clientX, y: ev.clientY });
    });
    el.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 || ev.pointerType === 'mouse' && ev.shiftKey) return;
      var sx = ev.clientX, sy = ev.clientY, timer = setTimeout(function () {
        fired = true;
        openPopup({ items: getItems({ clientX: sx, clientY: sy }), x: sx, y: sy });
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { } }
      }, 500);
      var fired = false;
      function mv(e) {
        if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) { clearTimeout(timer); off(); }
      }
      function up() {
        clearTimeout(timer);
        if (fired) { swallowClick = true; setTimeout(function () { swallowClick = false; }, 320); }
        off();
      }
      function off() {
        el.removeEventListener('pointermove', mv);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      }
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
  }

  document.addEventListener('click', function (ev) {
    if (swallowClick) { ev.stopPropagation(); ev.preventDefault(); return; }
    if (!popupEl) return;
    if (popupEl.contains(ev.target)) return;
    if (ev.target.closest('.mb-item[data-menu], #mb-logo, #mb-theme, [data-menu-anchor]')) return;
    closePopup();
  }, true);

  /* ============================ 6. 窗口：工具栏 + 侧栏 + 多标签 ============================ */
  var wins = {}, order = [], zTop = 10, front = null, tabSeq = 0, maxPrev = {};

  function openApp(id, opts) {
    opts = opts || {};
    var a = byId[id]; if (!a) return null;
    if (wins[id]) {
      if (wins[id].min) setMin(id, false);
      focusWin(id);
      if (opts.url) go(id, opts.url);
      return wins[id];
    }
    var S = stageRect();
    var r = (opts.rect && opts.rect.w > 60 && opts.rect.h > 60) ? opts.rect : defaultRect(a, order.length);
    if (S.w < 200 || S.h < 200) S = { w: Math.max(S.w, 640), h: Math.max(S.h, 480) };
    r.w = Math.min(r.w, S.w); r.h = Math.min(r.h, S.h);
    r.x = clamp(r.x, 0, Math.max(S.w - r.w, 0)); r.y = clamp(r.y, 0, Math.max(S.h - r.h, 0));

    var w = wins[id] = {
      id: id, app: a, rect: r, min: false, max: false, tile: null,
      noSide: !!opts.noSide, sideW: clamp(Number(opts.sideW) || prefs.sideW, SIDE_MIN, SIDE_MAX),
      tabs: [], i: 0,
    };
    buildWin(w);
    layer.appendChild(w.el);

    var saved = (opts.tabs || []).map(function (t) {
      var u = safeHref(t && (t.url || t));
      return u ? { url: u, hi: t.hi, hist: (t.hist || []).map(safeHref).filter(Boolean), title: t.title } : null;
    }).filter(Boolean);
    if (!saved.length) saved = [{ url: safeHref(opts.url) || a.src }];
    saved.forEach(function (t) { addTab(w, t.url, t); });
    w.i = clamp(Number(opts.i) || 0, 0, w.tabs.length - 1);
    paintTabs(w); showTab(w);
    applyRect(w);
    if (opts.max) toggleMax(id, true); else if (opts.tile) tile(id, opts.tile, true);
    setRunning(id, true);
    focusWin(id);
    if (!opts.silent) bounceDock(id);
    order = order.filter(function (x) { return x !== id; }); order.push(id);
    paintSideFoot(w);
    saveSession();
    return w;
  }

  function defaultRect(a, n) {
    var S = stageRect();
    if (S.w < 200 || S.h < 200) S = { w: Math.max(S.w, 640), h: Math.max(S.h, 480) };
    var ww = Math.min(a.w || 1024, Math.max(S.w - 60, 320));
    var hh = Math.min(a.h || 700, Math.max(S.h - 40, 240));
    var x = clamp(Math.round((S.w - ww) / 2) + (n * 34 - 17), 8, Math.max(S.w - ww - 8, 8));
    var y = clamp(Math.round((S.h - hh) / 2.4) + (n * 30 - 15), 8, Math.max(S.h - hh - 8, 8));
    return { x: x, y: y, w: ww, h: hh };
  }

  function buildWin(w) {
    var a = w.app;
    var el = document.createElement('section');
    el.className = 'win opening' + (w.noSide ? ' no-side' : '');
    el.dataset.app = a.id;
    el.style.setProperty('--acc', a.accent || 'var(--accent)');
    el.setAttribute('aria-label', a.name + ' 窗口');
    el.innerHTML =
      '<header class="win-bar" data-region="bar">' +
        '<div class="lights">' +
          '<button class="light cl hit" type="button" aria-label="关闭窗口" title="关闭">' + gl('xmark') + '</button>' +
          '<button class="light mi hit" type="button" aria-label="最小化窗口" title="最小化">' + gl('minus') + '</button>' +
          '<button class="light ma hit" type="button" aria-label="缩放窗口" title="缩放">' + gl('expand') + '</button>' +
        '</div>' +
        '<div class="tb-group">' +
          '<button class="tb-btn hit" type="button" data-cmd="side" aria-pressed="false" aria-label="显示或隐藏侧边栏" title="侧边栏（' + MOD + ' B）">' + gl('sidebar') + '</button>' +
          '<span class="tb-sep"></span>' +
          '<button class="tb-btn hit" type="button" data-cmd="back" aria-label="后退" title="后退（' + MOD + ' [）">' + gl('arrow-left') + '</button>' +
          '<button class="tb-btn hit" type="button" data-cmd="forward" aria-label="前进" title="前进（' + MOD + ' ］）">' + gl('arrow-right') + '</button>' +
        '</div>' +
        '<div class="tb-title"><span class="t"></span><span class="s"></span></div>' +
        '<div class="tb-group">' +
          '<button class="tb-search hit" type="button" data-cmd="search" aria-label="在' + esc(a.name) + '中搜索">' + gl('search') +
            '<span>搜索</span><kbd>' + (isMac ? '⌘K' : 'Ctrl K') + '</kbd></button>' +
          '<button class="tb-btn hit" type="button" data-cmd="more" data-menu-anchor="1" aria-haspopup="menu" aria-label="更多操作" title="更多操作（也可长按标题栏）">' + gl('ellipsis') + '</button>' +
        '</div>' +
      '</header>' +
      '<div class="win-main">' +
        '<aside class="win-side">' +
          '<div class="side-scroll" role="navigation" aria-label="内容模块"></div>' +
          '<div class="side-foot"></div>' +
          '<div class="side-resize" role="separator" aria-orientation="vertical" aria-label="拖拽调整侧边栏宽度" tabindex="0"></div>' +
        '</aside>' +
        '<div class="win-content">' +
          '<div class="tabbar" role="tablist" aria-label="标签页"></div>' +
          '<div class="frames" data-region="frames"></div>' +
        '</div>' +
      '</div>' +
      ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'].map(function (d) {
        return '<i class="rz rz-' + d + '" data-dir="' + d + '"></i>';
      }).join('');

    w.el = el;
    w.sideBox = el.querySelector('.side-scroll');
    w.sideEl = el.querySelector('.win-side');
    w.tabbar = el.querySelector('.tabbar');
    w.frames = el.querySelector('.frames');
    w.tTitle = el.querySelector('.tb-title .t');
    w.tSub = el.querySelector('.tb-title .s');
    w.sideEl.style.width = w.sideW + 'px';

    el.querySelector('[data-cmd="side"]').addEventListener('click', function () { toggleSide(w.id); });
    el.querySelector('[data-cmd="back"]').addEventListener('click', function () { tabBack(w.id); });
    el.querySelector('[data-cmd="forward"]').addEventListener('click', function () { tabForward(w.id); });
    el.querySelector('[data-cmd="search"]').addEventListener('click', function () { openPalette({ scope: a.id }); });
    el.querySelector('[data-cmd="more"]').addEventListener('click', function (ev) {
      ev.stopPropagation();
      openPopup({ items: winMenuItems(w), anchor: ev.currentTarget });
    });
    el.querySelector('.light.cl').addEventListener('click', function () { closeWin(w.id); });
    el.querySelector('.light.mi').addEventListener('click', function () { setMin(w.id, true); });
    el.querySelector('.light.ma').addEventListener('click', function () { toggleMax(w.id); });
    el.addEventListener('pointerdown', function () { focusWin(w.id); }, true);

    wireDrag(w); wireResize(w); wireSideResize(w);
    wirePointerMenu(el.querySelector('.win-bar'), function () { return winMenuItems(w); });
    wirePointerMenu(w.frames, function () { return frameMenuItems(w); });
    el.querySelector('.side-resize').addEventListener('keydown', function (ev) {
      var d = ev.key === 'ArrowLeft' ? -12 : (ev.key === 'ArrowRight' ? 12 : 0);
      if (!d) return;
      ev.preventDefault(); setSideW(w.id, w.sideW + d);
    });
    renderSidebar(w);
    loadCatalog();
  }

  /* 工具栏「⋯」/ 标题栏长按 / 内容区长按 共用这份动作清单 */
  function winMenuItems(w) {
    var t = frontTab(w);
    return [
      { title: w.app.name },
      { label: '新建标签页', glyph: 'plus', kbd: MODK + 'T', fn: function () { tabNew(w.id); } },
      { label: '重新载入这一页', glyph: 'reload', kbd: MODK + 'R', fn: function () { tabReload(w.id); } },
      { label: '后退', glyph: 'arrow-left', disabled: !(t && t.hi > 0), fn: function () { tabBack(w.id); } },
      { label: '前进', glyph: 'arrow-right', disabled: !(t && t.hi < t.hist.length - 1), fn: function () { tabForward(w.id); } },
      { sep: 1 },
      { label: (w.noSide ? '显示' : '隐藏') + '侧边栏', glyph: 'sidebar', kbd: MODK + 'B', fn: function () { toggleSide(w.id); } },
      { label: '在浏览器新标签页打开', glyph: 'external', disabled: !t, fn: function () { if (t) window.open(t.url, '_blank', 'noopener'); } },
      { label: '复制当前地址', glyph: 'list', disabled: !t, fn: function () { copyText(t ? new URL(t.url, location.origin).href : ''); } },
      { sep: 1 },
      { label: '窗口居左半屏', glyph: 'tile-left', kbd: MODK + '⇧←', fn: function () { tile(w.id, 'left'); } },
      { label: '窗口居右半屏', glyph: 'tile-right', kbd: MODK + '⇧→', fn: function () { tile(w.id, 'right'); } },
      { label: '两窗并列', glyph: 'tile-all', disabled: Object.keys(wins).length !== 2, fn: function () { tileAll(); } },
      { label: (w.max || w.tile) ? '恢复窗口大小' : '缩放窗口', glyph: 'expand', fn: function () { (w.max || w.tile) ? unmax(w.id) : toggleMax(w.id); } },
      { sep: 1 },
      { label: '最小化', glyph: 'minus', kbd: MODK + 'M', fn: function () { setMin(w.id, true); } },
      { label: '关闭窗口', glyph: 'trash', danger: 1, kbd: MODK + '⇧W', fn: function () { closeWin(w.id); } },
    ];
  }
  function frameMenuItems(w) {
    var t = frontTab(w);
    var items = [];
    if (t) {
      items.push({ title: shortTitle(t) });
      if (w.app.bulk) items.push({ label: '把这一章整章标记已读', glyph: 'checkmark', fn: function () { bulkChapter(w); } });
      items.push({ label: '关闭标签页', glyph: 'xmark', danger: 1, disabled: w.tabs.length < 2, fn: function () { tabClose(w.id, t.id); } });
      items.push({ sep: 1 });
    }
    return items.concat(winMenuItems(w));
  }
  /* 整章划线走小抄自己的 /api/bulk —— 篇⟺节的联动由服务端裁决，外壳只负责确认与刷新 */
  function bulkChapter(w) {
    var code = chapterOf(currentHref(w));
    if (!code) { toast('当前页面不属于任何一章，换个位置再试', true); return; }
    var name = code;
    var toc = catalog && catalog[w.app.toc];
    if (toc) toc.chapters.forEach(function (c) { if (c.code === code) name = c.name; });
    sheet({
      title: '把整章标记为已读？',
      html: '<p>「' + esc(name) + '」的全部篇目都会落朱线，小节同步划满。<br>这一步会写进本机进度库，撤消需要逐篇退回。</p>',
      actions: [
        { label: '取消' },
        { label: '确认划线', kind: 'pri', fn: function () {
          postJSON('/api/bulk', { code: code, read: true }).then(function (r) {
            if (!r.ok || r.d.error) { toast(r.d.error || '进度库未启动，写不进去', true); return; }
            probeDb(); refreshFrame(w);
            toast('「' + name + '」整章已划线');
          });
        } },
      ],
    });
  }
  function refreshFrame(w) { var t = frontTab(w); if (t && t.loaded) { try { t.frame.contentWindow.location.reload(); } catch (e) { tabReload(w.id); } } }
  function currentHref(w) { var t = frontTab(w); return t ? t.url : null; }
  function frontWin() { return front && wins[front] ? wins[front] : null; }
  function frontTab(w) { return w && w.tabs[w.i] || null; }
  function copyText(s) {
    if (!s) return;
    var ok = function () { toast('已复制：' + (s.length > 32 ? s.slice(0, 31) + '…' : s)); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(ok, fallback);
    else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = s; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { toast('复制失败，请手动选中地址栏', true); }
      ta.remove();
    }
  }

  /* ---------- 6.1 标签页 ---------- */
  function addTab(w, url, saved) {
    var t = { id: ++tabSeq, appId: w.app.id, url: url, title: (saved && saved.title) || '' };
    var hist = saved && saved.hist && saved.hist.length ? saved.hist.slice(-40) : [url];
    if (hist[hist.length - 1] !== url) hist.push(url);
    t.hist = hist;
    t.hi = clamp(saved && typeof saved.hi === 'number' ? saved.hi : hist.length - 1, 0, hist.length - 1);

    t.el = document.createElement('button');
    t.el.type = 'button'; t.el.className = 'tab'; t.el.setAttribute('role', 'tab');
    t.el.setAttribute('aria-selected', 'false'); t.el.tabIndex = -1;
    t.el.dataset.tab = t.id;
    t.el.innerHTML = '<span class="tab-t"></span>' +
      '<span class="tab-x hit" role="button" aria-label="关闭标签页">' + gl('xmark') + '</span>';
    t.el.querySelector('.tab-t').textContent = shortTitle(t);
    t.el.addEventListener('click', function (ev) {
      if (ev.target.closest('.tab-x')) { ev.stopPropagation(); tabClose(w.id, t.id); return; }
      showTab(w, t.id);
    });
    t.el.addEventListener('auxclick', function (ev) { if (ev.button === 1) { ev.preventDefault(); tabClose(w.id, t.id); } });
    t.el.addEventListener('keydown', function (ev) {
      if (ev.key === 'Delete') { ev.preventDefault(); tabClose(w.id, t.id); }
      if (ev.key === 'ArrowLeft' && ev.ctrlKey) { ev.preventDefault(); showTab(w, prevTabId(w, t.id)); }
      if (ev.key === 'ArrowRight' && ev.ctrlKey) { ev.preventDefault(); showTab(w, nextTabId(w, t.id)); }
    });
    wirePointerMenu(t.el, function () { return tabMenuItems(w, t); });
    wireTabDrag(w, t);

    t.frameEl = document.createElement('div');
    t.frameEl.className = 'frame'; t.frameEl.setAttribute('role', 'tabpanel');
    t.frame = document.createElement('iframe');
    t.frame.src = url; t.frame.title = w.app.name;
    t.frame.setAttribute('allow', 'fullscreen; clipboard-write');
    t.load = document.createElement('div'); t.load.className = 'frame-load';
    t.load.innerHTML = '<i class="spin"></i><span>正在打开 ' + esc(w.app.name) + '…</span>';
    t.err = document.createElement('div'); t.err.className = 'frame-err'; t.err.hidden = true;
    t.err.innerHTML = '<h3>这一页没能唤起</h3><p>入口没有响应（' + esc(url) +
      '）。确认本机服务还开着，或者换个入口。</p><div class="be"><button class="btn pri js-retry" type="button">重试</button></div>';
    t.frameEl.appendChild(t.frame); t.frameEl.appendChild(t.load); t.frameEl.appendChild(t.err);
    t.err.querySelector('.js-retry').addEventListener('click', function () { retryTab(w, t); });
    w.frames.appendChild(t.frameEl);

    var failTimer = 0;
    t.armFail = function () {
      clearTimeout(failTimer);
      failTimer = setTimeout(function () { if (!t.loaded) { t.err.hidden = false; t.load.hidden = true; } }, 12000);
    };
    t.frame.addEventListener('load', function () {
      t.armFail();
      t.loaded = true; t.load.hidden = true; t.err.hidden = true;
      onFrameSync(w, t); wireFrameDoc(w, t); pushTheme(t);
    });
    t.frame.addEventListener('error', function () { t.err.hidden = false; t.load.hidden = true; });
    t.armFail();

    w.tabs.push(t);
    return t;
  }
  function retryTab(w, t) {
    t.loaded = false; t.err.hidden = true; t.load.hidden = false;
    t.frame.src = t.url + (t.url.indexOf('?') < 0 ? '?' : '&') + '_r' + Date.now();
    t.armFail();
  }
  function tabMenuItems(w, t) {
    return [
      { title: shortTitle(t) },
      { label: '切换到该标签页', glyph: 'checkmark', disabled: w.tabs[w.i] === t, fn: function () { showTab(w, t.id); } },
      { label: '复制为新标签页', glyph: 'plus', fn: function () { tabNew(w.id, t.url); } },
      { label: '重新载入', glyph: 'reload', fn: function () { showTab(w, t.id); retryTab(w, t); } },
      { sep: 1 },
      { label: '关闭标签页', glyph: 'xmark', danger: 1, disabled: w.tabs.length < 2, fn: function () { tabClose(w.id, t.id); } },
      { label: '关闭其他标签页', glyph: 'trash', danger: 1, disabled: w.tabs.length < 2, fn: function () { closeOthers(w, t); } },
      { sep: 1 },
      { label: '复制地址', glyph: 'list', fn: function () { copyText(new URL(t.url, location.origin).href); } },
      { label: '在浏览器新标签页打开', glyph: 'external', fn: function () { window.open(t.url, '_blank', 'noopener'); } },
    ];
  }
  function closeOthers(w, keep) {
    w.tabs.slice().forEach(function (t) { if (t !== keep) killTab(w, t); });
    w.tabs = [keep]; w.i = 0; paintTabs(w); showTab(w); saveSession();
  }
  function killTab(w, t) {
    t.el.remove(); t.frameEl.remove();
    var k = w.tabs.indexOf(t);
    if (k >= 0) w.tabs.splice(k, 1);
    if (w.i > k) w.i--;
  }
  /* 标签页拖拽排序：拖到目标左半边 = 插在前面，右半边 = 插在后面。
     只用 HTML5 拖放（不引库），源与目标都在同一个标签条内 —— 一个应用只有一个窗口，
     跨窗拖标签在这里没有落点，所以不做（不做等于不撒谎）。 */
  var dragTab = null;
  function wireTabDrag(w, t) {
    var el = t.el;
    el.draggable = true;
    el.addEventListener('dragstart', function (ev) {
      dragTab = { w: w, t: t };
      el.classList.add('dragging');
      try { ev.dataTransfer.setData('text/plain', w.id + ':' + t.id); ev.dataTransfer.effectAllowed = 'move'; } catch (e) { }
    });
    el.addEventListener('dragover', function (ev) {
      if (!dragTab || dragTab.w !== w || dragTab.t === t) return;
      ev.preventDefault();
      try { ev.dataTransfer.dropEffect = 'move'; } catch (e) { }
      var r = el.getBoundingClientRect();
      var before = (ev.clientX - r.left) < r.width / 2;
      el.classList.toggle('drop-before', before);
      el.classList.toggle('drop-after', !before);
    });
    el.addEventListener('dragleave', function () { el.classList.remove('drop-before', 'drop-after'); });
    el.addEventListener('drop', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      el.classList.remove('drop-before', 'drop-after');
      if (!dragTab || dragTab.w !== w || dragTab.t === t) return;
      /* 方向判定不依赖 dragover 留下的 class（合成拖放可能跳过 dragover），
         直接用落点 X 现场重算，公式与 dragover 完全一致 */
      var r = el.getBoundingClientRect();
      var after = ev.clientX ? (ev.clientX - r.left) >= r.width / 2 : el.classList.contains('drop-after');
      var src = w.tabs.indexOf(dragTab.t);
      var dst = w.tabs.indexOf(t) + (after ? 1 : 0);
      if (src < 0) return;
      var moved = w.tabs.splice(src, 1)[0];
      if (dst > src) dst--;
      w.tabs.splice(clamp(dst, 0, w.tabs.length), 0, moved);
      w.i = w.tabs.indexOf(moved);
      paintTabs(w); showTab(w); dragTab = null; saveSession();
    });
    el.addEventListener('dragend', function () {
      el.classList.remove('dragging', 'drop-before', 'drop-after');
      dragTab = null;
    });
  }
  function tabNew(winId, url) {
    var w = wins[winId] || frontWin(); if (!w) return;
    if (w.tabs.length >= 9) { toast('标签页已到 9 个上限，先关几个', true); return; }
    addTab(w, safeHref(url) || w.app.src);
    w.i = w.tabs.length - 1; paintTabs(w); showTab(w);
    focusWin(w.id); saveSession();
    w.tabbar.scrollLeft = w.tabbar.scrollWidth;
  }
  function tabClose(winId, tabId) {
    var w = wins[winId]; if (!w) return;
    var t = tabId ? w.tabs.filter(function (x) { return x.id === tabId; })[0] : w.tabs[w.i];
    if (!t) return;
    if (w.tabs.length === 1) { closeWin(w.id); return; }
    killTab(w, t); paintTabs(w); showTab(w); saveSession();
  }
  function prevTabId(w, id) { var k = w.tabs.findIndex(function (t) { return t.id === id; }); return w.tabs[(k - 1 + w.tabs.length) % w.tabs.length].id; }
  function nextTabId(w, id) { var k = w.tabs.findIndex(function (t) { return t.id === id; }); return w.tabs[(k + 1) % w.tabs.length].id; }
  function cycleTab(back) {
    var w = frontWin(); if (!w || w.tabs.length < 2) return;
    showTab(w, back ? prevTabId(w, w.tabs[w.i].id) : nextTabId(w, w.tabs[w.i].id));
    saveSession();
  }
  function showTab(w, tabId) {
    if (tabId) {
      var k = -1; w.tabs.forEach(function (t, i) { if (t.id === tabId) k = i; });
      if (k >= 0) w.i = k;
    }
    w.tabs.forEach(function (t, i) {
      var on = i === w.i;
      t.frameEl.classList.toggle('on', on);
      t.el.classList.toggle('on', on);
      t.el.setAttribute('aria-selected', on ? 'true' : 'false');
      t.el.tabIndex = on ? 0 : -1;
    });
    w.el.classList.toggle('one-tab', w.tabs.length < 2);
    w.el.querySelector('[data-cmd="side"]').setAttribute('aria-pressed', w.noSide ? 'false' : 'true');
    syncBar(w); paintSidebar(w);
    if (front === w.id) { mbApp.textContent = w.app.name; saveSession(); }
  }
  function paintTabs(w) {
    w.tabbar.innerHTML = '';
    w.tabs.forEach(function (t) { w.tabbar.appendChild(t.el); });
    var neu = document.createElement('button');
    neu.type = 'button'; neu.className = 'tab-new hit';
    neu.setAttribute('aria-label', '新建标签页'); neu.title = '新建标签页（' + MOD + ' T）';
    neu.innerHTML = gl('plus');
    neu.addEventListener('click', function () { tabNew(w.id); });
    var end = document.createElement('span'); end.className = 'tabbar-end';
    w.tabbar.appendChild(neu); w.tabbar.appendChild(end);
    paintTabsText(w);
  }
  function paintTabsText(w) { w.tabs.forEach(function (t) { t.el.querySelector('.tab-t').textContent = shortTitle(t); }); }
  function syncBar(w) {
    var t = frontTab(w);
    w.tTitle.textContent = t ? (t.title || w.app.name) : w.app.name;
    w.tSub.textContent = w.app.name;
    w.tTitle.title = t ? (t.title || '') : '';
    var back = w.el.querySelector('[data-cmd="back"]'), fwd = w.el.querySelector('[data-cmd="forward"]');
    var canB = !!(t && t.hi > 0), canF = !!(t && t.hi < t.hist.length - 1);
    back.classList.toggle('off', !canB); fwd.classList.toggle('off', !canF);
    back.disabled = !canB; fwd.disabled = !canF;
    back.setAttribute('aria-disabled', canB ? 'false' : 'true');
    fwd.setAttribute('aria-disabled', canF ? 'false' : 'true');
  }
  /* 框架内导航后同步标题 / 历史 / 侧栏高亮（同源才读得到） */
  function onFrameSync(w, t) {
    try {
      var here = t.frame.contentWindow.location.pathname + t.frame.contentWindow.location.search;
      if (t.url !== here) {
        t.url = here;
        if (t.hist[t.hi] !== here) {
          t.hist = t.hist.slice(0, t.hi + 1); t.hist.push(here); t.hi = t.hist.length - 1;
          if (t.hist.length > 40) { t.hist.shift(); t.hi--; }
        }
        rememberRecent(here, t.frame.contentDocument.title || here);
      }
      var ti = (t.frame.contentDocument.title || '').trim();
      if (ti) t.title = ti;
    } catch (e) { /* 外部应用：标题保持原样 */ }
    paintTabsText(w); syncBar(w); paintSidebar(w);
    if (front === w.id) mbApp.textContent = w.app.name;
    saveSession();
  }
  function rememberRecent(url, title) {
    var list = loadJSON(KEY_RECENT, []); if (!Array.isArray(list)) list = [];
    list = list.filter(function (r) { return r.url !== url; });
    list.unshift({ url: url, title: title, ts: Date.now() });
    saveJSON(KEY_RECENT, list.slice(0, 12));
  }
  /* 子文档接线：置顶、指针菜单（长按/右键）、快捷键回传 */
  function wireFrameDoc(w, t) {
    var d = null;
    try { d = t.frame.contentDocument; } catch (e) { return; }
    if (!d || d.__deskWired) return;
    d.__deskWired = 1;
    d.addEventListener('pointerdown', function () { focusWin(w.id); }, true);
    d.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
      var r = t.frame.getBoundingClientRect();
      openPopup({ items: frameMenuItems(w), x: r.left + ev.clientX, y: r.top + ev.clientY });
    }, true);
    var timer = 0, sx = 0, sy = 0, moved = false;
    d.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      sx = ev.clientX; sy = ev.clientY; moved = false;
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (moved) return;
        var r = t.frame.getBoundingClientRect();
        openPopup({ items: frameMenuItems(w), x: r.left + sx, y: r.top + sy });
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { } }
      }, 500);
    }, true);
    d.addEventListener('pointermove', function (ev) {
      if (Math.abs(ev.clientX - sx) > 10 || Math.abs(ev.clientY - sy) > 10) { moved = true; clearTimeout(timer); }
    }, true);
    ['pointerup', 'pointercancel'].forEach(function (k) {
      d.addEventListener(k, function () { clearTimeout(timer); }, true);
    }, true);
  }

  /* ---------- 6.2 侧栏 ---------- */
  function chapterOf(url) {
    var u = toURL(url); if (!u) return null;
    var c = u.searchParams.get('c'); if (c) return c;
    var jg = catalog && catalog.javaguide;
    if (jg && jg.routes) {
      var code = jg.routes[u.pathname];
      if (code) return code;
    }
    return null;
  }
  function sideItems(app) {
    var out = [];
    (app.modules || []).forEach(function (g) {
      out.push({ title: g.title });
      (g.items || []).forEach(function (it) { out.push({ label: it.label, glyph: it.glyph, href: it.href, hint: it.hint }); });
    });
    var toc = catalog && catalog[app.toc];
    if (catalog && catalog.__fail) {
      out.push({ title: '目录' }, { label: '目录加载失败：服务未启动？', disabled: true });
      return out;
    }
    if (toc && toc.chapters && toc.chapters.length) {
      out.push({ title: app.toc === 'jbl' ? '检查系统' : '章节' });
      toc.chapters.forEach(function (c) {
        out.push({
          label: c.name, glyph: (app.chapterIcons && app.chapterIcons[c.code]) || 'list',
          color: app.chapterColors && app.chapterColors[c.code],
          href: c.href, count: c.count, code: c.code,
        });
      });
    } else if (!catalog) {
      out.push({ title: app.toc === 'jbl' ? '检查系统' : '章节' }, { label: '载入中…', disabled: true });
    }
    return out;
  }
  function renderSidebar(w) {
    var box = w.sideBox;
    if (!catalog) {
      box.innerHTML = '<div class="side-group-t">载入中</div>' + '<div class="side-skel"></div>'.repeat(7);
      return;
    }
    box.innerHTML = '';
    sideItems(w.app).forEach(function (it) {
      if (it.title) {
        var h = document.createElement('div'); h.className = 'side-group-t'; h.textContent = it.title;
        box.appendChild(h); return;
      }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'side-row'; b.dataset.href = it.href || '';
      if (it.color) b.style.setProperty('--acc', it.color);
      if (it.disabled) b.disabled = true;
      b.innerHTML = '<span class="sr-g">' + gl(it.glyph || 'list') + '</span><span class="sr-t"></span>' +
        (it.count ? '<span class="sr-n">' + it.count + '</span>' : '');
      b.querySelector('.sr-t').textContent = it.label;
      if (it.hint) b.title = it.hint; else b.title = it.label;
      if (!it.disabled) {
        b.addEventListener('click', function () { go(w.id, it.href); });
        wirePointerMenu(b, function () { return [
          { title: it.label },
          { label: '在当前标签页打开', glyph: 'checkmark', fn: function () { go(w.id, it.href); } },
          { label: '在新标签页打开', glyph: 'plus', fn: function () { tabNew(w.id, it.href); } },
          { label: '在浏览器新标签页打开', glyph: 'external', fn: function () { window.open(it.href, '_blank', 'noopener'); } },
        ]; });
      }
      box.appendChild(b);
    });
    paintSidebar(w);
  }
  function paintSidebar(w) {
    var href = currentHref(w), u = href ? toURL(href) : null, code = href ? chapterOf(href) : null;
    var appSrc = toURL(w.app.src);
    /* 应用首页有 /、/index.html、/jbl/index.html 三种写法，先归一再比 */
    function isHome(pathname) {
      if (!appSrc) return false;
      if (pathname === appSrc.pathname) return true;
      return pathname === '/' && appSrc.pathname === '/index.html';
    }
    w.sideBox.querySelectorAll('.side-row').forEach(function (row) {
      var ru = toURL(row.dataset.href);
      var on = false;
      if (u && ru) {
        if (ru.pathname === u.pathname && ru.search === u.search) on = true;
        /* 正文页 /read/java/xxx.html 里没有章号，靠 routes 表把「当前章」找回来 */
        else if (code && ru.searchParams.get('c') === code) on = true;
        /* 首页行只在真的停在首页时亮 —— 之前漏了路径比对，读文章时它也跟着亮 */
        else if (isHome(ru.pathname) && isHome(u.pathname) && !u.search) on = true;
      }
      row.classList.toggle('on', on);
      if (on) row.setAttribute('aria-current', 'page'); else row.removeAttribute('aria-current');
    });
  }
  function paintSideFoot(w) {
    var foot = w.el.querySelector('.side-foot'); if (!foot) return;
    var p = progress[w.app.id];
    var tot = (catalog && catalog[w.app.toc] && catalog[w.app.toc].total) || (p && p.total) || 0;
    if (!p) {
      foot.innerHTML = '<div class="sf-line">' + (tot ? '<span class="num">' + tot + '</span> 项 · 进度库未连接' : '进度库未连接') + '</div>';
      return;
    }
    var pct = tot ? clamp(p.done / tot, 0, 1) : 0;
    foot.innerHTML = '<div class="sf-line"><span>' + (w.app.id === 'jbl' ? '已掌握' : '已划线') +
      ' <b class="num">' + p.done + '</b> / <span class="num">' + tot + '</span></span>' +
      '<span class="num" style="margin-left:auto">' + Math.round(pct * 100) + '%</span></div>' +
      '<div class="side-bar"><i style="transform:scaleX(' + pct.toFixed(4) + ')"></i></div>';
  }
  function toggleSide(id) {
    var w = wins[id]; if (!w) return;
    w.noSide = !w.noSide;
    w.el.classList.toggle('no-side', w.noSide);
    w.el.querySelector('[data-cmd="side"]').setAttribute('aria-pressed', w.noSide ? 'false' : 'true');
    saveSession();
  }
  function setSideW(id, px) {
    var w = wins[id]; if (!w) return;
    w.sideW = clamp(px, SIDE_MIN, SIDE_MAX);
    w.sideEl.style.width = w.sideW + 'px';
    prefs.sideW = w.sideW; savePrefs(); saveSession();
  }
  function wireSideResize(w) {
    var h = w.el.querySelector('.side-resize');
    h.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      ev.preventDefault(); ev.stopPropagation();
      var x0 = ev.clientX, base = w.sideEl.getBoundingClientRect().width;
      h.classList.add('on'); w.el.classList.add('drag-side');
      try { h.setPointerCapture(ev.pointerId); } catch (e) { }
      focusWin(w.id);
      function mv(e) { setSideW(w.id, base + e.clientX - x0); }
      function up() {
        h.classList.remove('on'); w.el.classList.remove('drag-side');
        h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up);
      }
      h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up);
    });
    h.addEventListener('dblclick', function () { setSideW(w.id, SIDE_DEF); toast('侧边栏宽度已复位到 ' + SIDE_DEF + ' px'); });
  }

  /* ---------- 6.3 导航 ---------- */
  function go(winId, href) {
    var w = wins[winId] || frontWin(); if (!w) return;
    var t = frontTab(w); if (!t) return;
    href = safeHref(href) || w.app.src;
    focusWin(w.id);
    if (t.url === href) { refreshFrame(w); return; }
    t.url = href;
    t.hist = t.hist.slice(0, t.hi + 1); t.hist.push(href); t.hi = t.hist.length - 1;
    if (t.hist.length > 40) { t.hist.shift(); t.hi--; }
    t.loaded = false; t.load.hidden = false; t.err.hidden = true; t.armFail();
    t.frame.src = href;
    syncBar(w); paintSidebar(w); saveSession();
    /* 窄屏下侧栏是盖在正文上的抽屉，选完就该收起 —— 别让抽屉一直压着刚打开的内容 */
    if (NARROW.matches && !w.noSide) toggleSide(w.id);
  }
  var NARROW = window.matchMedia('(max-width: 760px)');
  function tabBack(id) { var w = wins[id] || frontWin(); var t = frontTab(w); if (!w || !t || t.hi <= 0) return; t.hi--; navHist(w, t); }
  function tabForward(id) { var w = wins[id] || frontWin(); var t = frontTab(w); if (!w || !t || t.hi >= t.hist.length - 1) return; t.hi++; navHist(w, t); }
  function navHist(w, t) {
    var href = t.hist[t.hi];
    syncBar(w);
    if (t.url === href) return;
    t.url = href; t.loaded = false; t.load.hidden = false; t.armFail(); t.frame.src = href;
    saveSession();
  }
  function tabReload(id) { var w = wins[id] || frontWin(); var t = frontTab(w); if (w && t) retryTab(w, t); }

  /* ---------- 6.4 拖拽 / 缩放 / 分屏 ---------- */
  function wireDrag(w) {
    var bar = w.el.querySelector('.win-bar');
    bar.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 || ev.target.closest('.light, .tb-btn, .tb-search')) return;
      var sx = ev.clientX, sy = ev.clientY, ox = w.rect.x, oy = w.rect.y, moved = false;
      var S = stageRect();
      bar.setPointerCapture(ev.pointerId);
      w.el.classList.add('dragging');
      function move(e) {
        if (!moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 4) return;
        moved = true;
        if (w.max || w.tile) {                        /* 从最大化/分屏里拖出来 → 先还原成浮动窗 */
          var ww = w.rect.w, hh = Math.max(w.rect.h - 40, 320);
          unmax(w.id);
          w.rect = { x: e.clientX - stage.getBoundingClientRect().left - ww / 2, y: clamp(oy, 0, S.h - 60), w: ww, h: hh };
          ox = w.rect.x; oy = w.rect.y; sx = e.clientX; sy = e.clientY;
          applyRect(w);
        }
        w.rect.x = clamp(ox + e.clientX - sx, -w.rect.w + 90, S.w - 90);
        w.rect.y = clamp(oy + e.clientY - sy, 0, S.h - 34);
        applyRect(w);
      }
      function up() {
        w.el.classList.remove('dragging');
        bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up);
        if (moved) saveSession();
      }
      bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up);
    });
    bar.addEventListener('dblclick', function (ev) {
      if (!ev.target.closest('.light, .tb-btn, .tb-search')) toggleMax(w.id);
    });
  }
  function wireResize(w) {
    var MIN_W = w.app.minW || 480, MIN_H = w.app.minH || 300;
    w.el.querySelectorAll('.rz').forEach(function (h) {
      h.addEventListener('pointerdown', function (ev) {
        if (ev.button !== 0 || w.max || w.tile) return;
        ev.preventDefault(); ev.stopPropagation();
        var dir = h.dataset.dir, S = stageRect();
        var p = { x: ev.clientX, y: ev.clientY, r: { x: w.rect.x, y: w.rect.y, w: w.rect.w, h: w.rect.h } };
        h.setPointerCapture(ev.pointerId);
        w.el.classList.add('resizing'); focusWin(w.id);
        function move(e) {
          var dx = e.clientX - p.x, dy = e.clientY - p.y, r = { x: p.r.x, y: p.r.y, w: p.r.w, h: p.r.h };
          if (dir.indexOf('e') >= 0) r.w = clamp(p.r.w + dx, MIN_W, S.w - r.x);
          if (dir.indexOf('s') >= 0) r.h = clamp(p.r.h + dy, MIN_H, S.h - r.y);
          if (dir.indexOf('w') >= 0) { var nw = clamp(p.r.w - dx, MIN_W, p.r.x + p.r.w); r.x = p.r.x + p.r.w - nw; r.w = nw; }
          if (dir.indexOf('n') >= 0) { var nh = clamp(p.r.h - dy, MIN_H, p.r.y + p.r.h); r.y = p.r.y + p.r.h - nh; r.h = nh; }
          w.rect = r; applyRect(w);
        }
        function up() {
          w.el.classList.remove('resizing');
          h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up);
          saveSession();
        }
        h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
      });
    });
  }
  function dockReserve() {
    var dock = document.getElementById('dock');
    if (!dock) return DOCK_KEEP;
    var d = dock.getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect();
    if (!d.height) return DOCK_KEEP;
    return Math.max(0, Math.round(s.bottom - d.top));
  }
  function toggleMax(id, force) {
    var w = wins[id]; if (!w) return;
    var want = typeof force === 'boolean' ? force : !w.max;
    if (!want && !w.max && !w.tile) return;
    if (w.max || w.tile) { unmax(id); return; }
    maxPrev[id] = { x: w.rect.x, y: w.rect.y, w: w.rect.w, h: w.rect.h, tile: w.tile };
    var S = stageRect();
    w.rect = { x: 0, y: 0, w: S.w, h: Math.max(S.h - dockReserve(), 240) };
    w.max = true;
    w.el.classList.add('max'); w.el.classList.remove('tile');
    applyRect(w); focusWin(id); saveSession();
  }
  function unmax(id) {
    var w = wins[id]; if (!w) return;
    var prev = maxPrev[id];
    w.max = false; w.tile = null;
    w.el.classList.remove('max', 'tile');
    if (prev && prev.w > 60) w.rect = { x: prev.x, y: prev.y, w: prev.w, h: prev.h };
    applyRect(w); saveSession();
  }
  function tile(id, side, quiet) {
    var w = wins[id]; if (!w) return;
    var S = stageRect();
    if (!w.max && !w.tile) maxPrev[id] = { x: w.rect.x, y: w.rect.y, w: w.rect.w, h: w.rect.h };
    var half = Math.round(S.w / 2);
    w.max = false; w.el.classList.remove('max');
    w.rect = { x: side === 'right' ? half : 0, y: 0, w: half, h: Math.max(S.h - dockReserve(), 240) };
    w.tile = side;
    w.el.classList.add('tile');
    applyRect(w); focusWin(id);
    if (!quiet) toast(side === 'left' ? '窗口已贴到左半屏' : '窗口已贴到右半屏');
    saveSession();
  }
  function tileAll() {
    var ids = order.slice(-2);
    if (ids.length < 2) { toast('并列排布需要两个窗口', true); return; }
    ids.forEach(function (x, i) { openMin(x); tile(x, i ? 'right' : 'left', true); });
    toast('两个窗口已并列排布');
  }
  function openMin(id) { var w = wins[id]; if (w && w.min) setMin(id, false); }

  /* ---------- 6.5 层叠 / 最小化 / 关闭 ---------- */
  function applyRect(w) {
    if (!(w.rect.w > 1 && w.rect.h > 1)) return;
    var s = w.el.style;
    s.left = Math.round(w.rect.x) + 'px'; s.top = Math.round(w.rect.y) + 'px';
    s.width = Math.round(w.rect.w) + 'px'; s.height = Math.round(w.rect.h) + 'px';
  }
  function focusWin(id) {
    var w = wins[id]; if (!w) return;
    zTop += 1; w.el.style.zIndex = zTop;
    front = id;
    Object.keys(wins).forEach(function (k) { wins[k].el.classList.toggle('active', k === id); });
    mbApp.textContent = w.app.name;
    order = order.filter(function (x) { return x !== id; }); order.push(id);
    syncBar(w); showDockWindows();
    saveSession();
  }
  function cycleWin() {
    var list = order.filter(function (id) { return !wins[id].min; });
    if (list.length < 2) { toast('只有一个窗口开着'); return; }
    var i = list.indexOf(front);
    focusWin(list[(i + 1) % list.length]);
    toast('已切到「' + wins[front].app.name + '」');
  }
  function closeWin(id) {
    var w = wins[id]; if (!w) return;
    w.el.classList.add('closing');
    setTimeout(function () { w.el.remove(); }, 280);
    delete wins[id];
    order = order.filter(function (x) { return x !== id; });
    setRunning(id, false);
    if (front === id) {
      front = null;
      var next = order.slice().reverse().filter(function (x) { return !wins[x].min; })[0] || order.slice().reverse()[0];
      if (next) focusWin(next); else mbApp.textContent = '面试工作台';
    }
    showDockWindows(); saveSession();
  }
  function setMin(id, on) {
    var w = wins[id]; if (!w) return;
    w.min = on;
    w.el.classList.toggle('min', on);
    if (on) {
      if (front === id) {
        front = null; mbApp.textContent = '面试工作台';
        var rest = order.slice().reverse().filter(function (x) { return x !== id && !wins[x].min; })[0];
        if (rest) focusWin(rest);
      }
    } else {
      w.el.classList.remove('opening'); void w.el.offsetWidth; w.el.classList.add('opening');
    }
    showDockWindows(); saveSession();
  }

  /* ---------- 6.6 会话 ---------- */
  var saveTimer = 0;
  function saveSession() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var s = { v: 2, wins: {}, order: [], front: front };
      order.forEach(function (id) {
        var w = wins[id];
        if (!w || !(w.rect.w > 60 && w.rect.h > 60)) return;
        s.wins[id] = {
          x: w.rect.x, y: w.rect.y, w: w.rect.w, h: w.rect.h,
          max: w.max ? 1 : 0, min: w.min ? 1 : 0, tile: w.tile || 0,
          noSide: w.noSide ? 1 : 0, sideW: w.sideW, i: w.i,
          tabs: w.tabs.map(function (t) { return { url: t.url, title: t.title, hist: t.hist, hi: t.hi }; }),
        };
      });
      s.order = order.filter(function (id) { return !!s.wins[id]; });
      saveJSON(KEY_SESSION, s);
    }, 200);
  }

  /* ============================ 7. 顶部菜单栏 ============================ */
  var MENU_DEFS = [
    { id: 'file', label: '文件' },
    { id: 'go', label: '前往' },
    { id: 'view', label: '显示' },
    { id: 'win', label: '窗口' },
    { id: 'help', label: '帮助' },
  ];
  var barItems = [];            /* [{id, el}]，方向键在菜单之间横向跳 */
  function buildMenuBar() {
    mbMenus.innerHTML = '';
    barItems = [{ id: 'sys', el: mbLogo }, { id: 'app', el: mbApp }];
    MENU_DEFS.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'mb-item'; b.dataset.menu = m.id;
      b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false');
      b.textContent = m.label;
      mbMenus.appendChild(b);
      barItems.push({ id: m.id, el: b });
    });
    barItems.forEach(function (it) {
      it.el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (popupOwner === 'bar:' + it.id) { closePopup(); return; }
        openBarMenu(it.id, it.el);
      });
      /* 菜单开着时掠过相邻菜单即切换 —— macOS 的菜单跟踪手感 */
      it.el.addEventListener('pointerenter', function () {
        if (menuHot && popupOwner && popupOwner.indexOf('bar:') === 0) openBarMenu(it.id, it.el);
      });
    });
    mbMenus.addEventListener('pointerleave', function () { menuHot = false; });
    mbMenus.addEventListener('pointerenter', function () { if (popupEl) menuHot = true; });
  }
  var menuHot = false;
  function openBarMenu(id, anchor) {
    var items = menuFor(id);
    if (!items.length) return;
    closePopup();
    barItems.forEach(function (it) {
      var on = it.el === anchor;
      it.el.classList.toggle('open', on);
      it.el.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
    mountPopup(items, { anchor: anchor, owner: 'bar:' + id });
    menuHi(firstEnabled(popupEl));
  }
  function stepBarMenu(dir) {
    if (!popupOwner || popupOwner.indexOf('bar:') !== 0) return false;
    var cur = popupOwner.slice(4);
    var i = barItems.findIndex(function (x) { return x.id === cur; });
    if (i < 0) return false;
    var n = barItems[(i + dir + barItems.length) % barItems.length];
    openBarMenu(n.id, n.el);
    return true;
  }
  function tocChapters(appId) {
    var a = byId[appId];
    var toc = a && catalog && catalog[a.toc];
    return (toc && toc.chapters) || [];
  }
  function menuFor(id) {
    var w = frontWin(), t = frontTab(w);
    if (id === 'sys') return [
      { label: '关于本机', fn: showAbout },
      { label: '显示偏好…', kbd: MODK + ',', fn: showPrefs },
      { sep: 1 },
      { title: '打开应用' },
    ].concat(APPS.map(function (a, i) {
      return { label: a.name, checked: !!wins[a.id], kbd: MODK + (i + 1), fn: function () { dockClick(a.id); } };
    })).concat([
      { label: '全局搜索…', kbd: MODK + 'K', fn: function () { openPalette(); } },
      { sep: 1 },
      { label: '关闭全部窗口', danger: 1, disabled: !Object.keys(wins).length, fn: function () { Object.keys(wins).forEach(closeWin); } },
      { label: '重新载入桌面', fn: function () { location.reload(); } },
      { sep: 1 },
      { label: '操作指南（没有右键怎么用）', fn: showGuide },
      { label: '键盘快捷键', kbd: '?', fn: showShortcuts },
    ]);
    if (id === 'app') {
      if (!w) return [{ label: '桌面', fn: showAbout }, { sep: 1 }, { label: '打开应用：小抄', fn: function () { dockClick('javaguide'); } }, { label: '打开应用：火箭题库', fn: function () { dockClick('jbl'); } }];
      return [
        { label: '关于 ' + w.app.name, fn: showAbout },
        { label: '重新载入', kbd: MODK + 'R', fn: function () { tabReload(w.id); } },
        { sep: 1 },
        { label: '新建标签页', kbd: MODK + 'T', fn: function () { tabNew(w.id); } },
        { label: '关闭窗口', kbd: MODK + '⇧W', danger: 1, fn: function () { closeWin(w.id); } },
        { sep: 1 },
        { label: '在浏览器新标签页打开', fn: function () { if (t) window.open(t.url, '_blank', 'noopener'); } },
        { label: '隐藏全部窗口', kbd: MODK + ' ⇧ M', disabled: !Object.keys(wins).length, fn: hideAll },
      ];
    }
    if (id === 'file') return [
      { label: '新建标签页', kbd: MODK + 'T', disabled: !w, fn: function () { tabNew(w.id); } },
      { label: '关闭标签页', kbd: MODK + 'W', disabled: !w, fn: function () { tabClose(w.id); } },
      { sep: 1 },
      { label: '全局搜索…', kbd: MODK + 'K', fn: function () { openPalette(); } },
      { label: '最近打开', fn: function () { openPalette({ scope: 'recent' }); } },
      { sep: 1 },
      { label: '重新载入这一页', kbd: MODK + 'R', disabled: !w, fn: function () { tabReload(w.id); } },
      { label: '关闭窗口', kbd: MODK + '⇧W', danger: 1, disabled: !w, fn: function () { closeWin(w.id); } },
      { label: '在浏览器新标签页打开', disabled: !t, fn: function () { if (t) window.open(t.url, '_blank', 'noopener'); } },
    ];
    if (id === 'go') {
      var items = [
        { label: '后退', kbd: MODK + '[', disabled: !(t && t.hi > 0), fn: function () { tabBack(w.id); } },
        { label: '前进', kbd: MODK + ']', disabled: !(t && t.hi < t.hist.length - 1), fn: function () { tabForward(w.id); } },
        { sep: 1 },
        { label: '回到应用首页', disabled: !w, fn: function () { if (w) go(w.id, w.app.src); } },
        { sep: 1 },
        { title: '最近打开' },
      ];
      var rec = loadJSON(KEY_RECENT, []);
      if (!Array.isArray(rec) || !rec.length) items.push({ label: '（还没有记录）', disabled: true });
      else rec.slice(0, 8).forEach(function (r) {
        items.push({ label: r.title || r.url, fn: function () { openRecent(r); } });
      });
      if (w) {
        items.push({ sep: 1 }, { title: w.app.name + ' 的目录' });
        var chs = tocChapters(w.app.id);
        if (!chs.length) items.push({ label: '（目录未就绪）', disabled: true });
        chs.forEach(function (c) {
          items.push({ label: c.name, checked: chapterOf(currentHref(w)) === c.code, fn: function () { go(w.id, c.href); } });
        });
      }
      return items;
    }
    if (id === 'view') return [
      { label: '显示侧边栏', checked: !!(w && !w.noSide), disabled: !w, kbd: MODK + 'B', fn: function () { toggleSide(w.id); } },
      { sep: 1 },
      { label: '跟随系统外观', checked: prefs.theme === 'auto', fn: function () { setTheme('auto'); } },
      { label: '浅色', checked: prefs.theme === 'light', fn: function () { setTheme('light'); } },
      { label: '深色', checked: prefs.theme === 'dark', fn: function () { setTheme('dark'); } },
      { sep: 1 },
      { label: '降低透明度', checked: prefs.opaque === 1, fn: toggleOpaque },
      { sep: 1 },
      { label: '窗口居左半屏', disabled: !w, kbd: MODK + '⇧←', fn: function () { tile(w.id, 'left'); } },
      { label: '窗口居右半屏', disabled: !w, kbd: MODK + '⇧→', fn: function () { tile(w.id, 'right'); } },
      { label: '两窗并列', disabled: Object.keys(wins).length !== 2, fn: tileAll },
      { label: (w && (w.max || w.tile)) ? '恢复窗口大小' : '缩放窗口', disabled: !w, fn: function () { toggleMax(w.id); } },
    ];
    if (id === 'win') {
      var out = [
        { label: '最小化', disabled: !w, kbd: MODK + 'M', fn: function () { setMin(w.id, true); } },
        { label: '缩放窗口', disabled: !w, fn: function () { toggleMax(w.id); } },
        { label: '隐藏全部窗口', disabled: !Object.keys(wins).length, fn: hideAll },
        { label: '前置全部窗口', disabled: !Object.keys(wins).length, fn: showAll },
        { label: '切换到下一个窗口', kbd: MODK + ' `', fn: cycleWin },
        { sep: 1 },
        { title: '打开的窗口' },
      ];
      var list = order.slice().reverse();
      if (!list.length) out.push({ label: '（没有打开的窗口）', disabled: true });
      list.forEach(function (id2) {
        var w2 = wins[id2];
        out.push({
          label: (frontTab(w2) ? shortTitle(frontTab(w2)) : w2.app.name) + ' — ' + w2.app.name,
          checked: id2 === front, fn: function () { if (w2.min) setMin(id2, false); focusWin(id2); },
        });
      });
      return out;
    }
    if (id === 'help') return [
      { label: '操作指南：没有右键怎么用', fn: showGuide },
      { label: '键盘快捷键', kbd: '?', fn: showShortcuts },
      { label: '怎样调整侧边栏', fn: function () { showGuide('side'); } },
      { sep: 1 },
      { label: '关于本机', fn: showAbout },
    ];
    return [];
  }
  function hideAll() { Object.keys(wins).forEach(function (id) { setMin(id, true); }); }
  function showAll() { Object.keys(wins).forEach(function (id) { if (wins[id].min) setMin(id, false); }); }
  function toggleOpaque() {
    prefs.opaque = prefs.opaque ? 0 : 1; applyTheme();
    toast(prefs.opaque ? '已降低透明度：玻璃退成实面' : '已恢复液态玻璃材质');
  }
  function openRecent(r) {
    var app = String(r.url || '').indexOf('/jbl/') === 0 ? 'jbl' : 'javaguide';
    if (wins[app]) go(app, r.url); else openApp(app, { url: r.url });
  }

  /* 动作分发：菜单项与命令面板都能只写 {act:'back'} */
  function run(act, arg) {
    var w = frontWin();
    switch (act) {
      case 'back': return tabBack(w && w.id);
      case 'forward': return tabForward(w && w.id);
      case 'reload': return tabReload(w && w.id);
      case 'side-toggle': return toggleSide(w && w.id);
      case 'tab-new': return tabNew(w && w.id);
      case 'tab-close': return tabClose(w && w.id);
      case 'win-close': return w && closeWin(w.id);
      case 'win-min': return w && setMin(w.id, true);
      case 'win-max': return w && toggleMax(w.id);
      case 'tile:left': return w && tile(w.id, 'left');
      case 'tile:right': return w && tile(w.id, 'right');
      case 'tile:all': return tileAll();
      case 'palette': return openPalette();
      case 'opaque': return toggleOpaque();
      case 'cycle-theme': return cycleTheme();
      case 'about': return showAbout();
      case 'prefs': return showPrefs();
      case 'guide': return showGuide();
      case 'shortcuts': return showShortcuts();
      case 'closeall': return Object.keys(wins).forEach(closeWin);
      case 'cycle-win': return cycleWin();
      case 'cycle-tab': return cycleTab(!!arg);
      case 'theme:auto': return setTheme('auto');
      case 'theme:light': return setTheme('light');
      case 'theme:dark': return setTheme('dark');
      case 'reload-desk': return location.reload();
      default:
        if (act && act.indexOf('open:') === 0) return dockClick(act.slice(5));
        if (act && act.indexOf('goto:') === 0) return gotoModule(act.slice(5));
        toast('没有这个动作：' + act, true);
    }
  }
  function gotoModule(href) {
    var app = String(href).indexOf('/jbl/') === 0 ? 'jbl' : 'javaguide';
    if (wins[app]) go(app, href); else openApp(app, { url: href });
  }

  /* ============================ 8. 程序坞、桌面图标、空桌面 ============================ */
  function buildChrome() {
    dock.innerHTML = '';
    APPS.forEach(function (a) {
      var item = document.createElement('div');
      item.className = 'dock-item'; item.dataset.app = a.id;
      item.style.width = item.style.height = DOCK_BASE + 'px';
      item.innerHTML = '<span class="d-tip"></span>' +
        '<button class="dock-btn" type="button" aria-label="打开或聚焦 ' + esc(a.name) + '">' +
        (ICONS[a.icon] ? ICONS[a.icon]() : '') + '</button>' +
        '<i class="run-dot" aria-hidden="true"></i>';
      item.querySelector('.d-tip').textContent = a.name;
      item.querySelector('.dock-btn').addEventListener('click', function () { dockClick(a.id); });
      wirePointerMenu(item, function () { return dockMenuItems(a); });
      dock.appendChild(item);

      var d = document.createElement('button');
      d.type = 'button'; d.className = 'desk-icon'; d.dataset.app = a.id;
      d.setAttribute('aria-label', '双击或按回车打开 ' + a.name);
      d.innerHTML = '<span class="di-img">' + (ICONS[a.icon] ? ICONS[a.icon]() : '') + '</span><span class="di-name"></span>';
      d.querySelector('.di-name').textContent = a.name;
      d.addEventListener('click', function () {
        iconsBox.querySelectorAll('.desk-icon').forEach(function (o) { o.classList.toggle('sel', o === d); });
      });
      d.addEventListener('dblclick', function () { openApp(a.id); });
      d.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openApp(a.id); }
      });
      wirePointerMenu(d, function () { return dockMenuItems(a); });
      iconsBox.appendChild(d);
    });
    var sep = document.createElement('div'); sep.className = 'dock-sep'; sep.id = 'dock-sep'; sep.hidden = true;
    dock.appendChild(sep);
    dockWins = document.createElement('div'); dockWins.className = 'dock-wins'; dockWins.id = 'dock-wins';
    dock.appendChild(dockWins);
  }
  function dockMenuItems(a) {
    var w = wins[a.id], out = [{ title: a.name }];
    if (w) {
      out.push({ label: '聚焦窗口', fn: function () { if (w.min) setMin(a.id, false); focusWin(a.id); } });
      (w.tabs.length > 1 ? w.tabs.slice(0, 8) : []).forEach(function (t) {
        out.push({ label: shortTitle(t), fn: function () { showTab(w, t.id); focusWin(a.id); } });
      });
      out.push({ sep: 1 }, { label: '关闭标签页', disabled: w.tabs.length < 2, fn: function () { tabClose(a.id); } },
        { label: '关闭窗口', danger: 1, fn: function () { closeWin(a.id); } });
    } else {
      out.push({ label: '打开', fn: function () { openApp(a.id); } });
    }
    out.push({ sep: 1 }, { label: '新标签页打开目录', disabled: !a.modules || !a.modules.length, fn: function () { openApp(a.id); tabNew(a.id, (a.modules[0] || {}).items[0].href); } });
    out.push({ label: '在浏览器新标签页打开', fn: function () { window.open(a.src, '_blank', 'noopener'); } });
    return out;
  }
  function dockClick(id) {
    var w = wins[id];
    if (!w) { openApp(id); return; }
    if (w.min) { setMin(id, false); focusWin(id); return; }
    if (front === id) { setMin(id, true); return; }
    focusWin(id);
  }
  function setRunning(id, on) {
    var it = dock.querySelector('.dock-item[data-app="' + id + '"]');
    if (it) it.classList.toggle('running', on);
  }
  function bounceDock(id) {
    var it = dock.querySelector('.dock-item[data-app="' + id + '"]');
    if (!it) return;
    it.classList.remove('bounce'); void it.offsetWidth; it.classList.add('bounce');
  }
  /* 最小化的窗口收进程序坞右半区（红绿灯的「最小化」不能把窗口弄丢） */
  function showDockWindows() {
    if (!dockWins) return;
    var mins = Object.keys(wins).filter(function (id) { return wins[id].min; });
    dockWins.innerHTML = '';
    mins.forEach(function (id) {
      var w = wins[id];
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'dock-mini';
      b.setAttribute('aria-label', '恢复窗口：' + w.app.name);
      b.title = w.app.name + ' — 点击恢复';
      b.innerHTML = '<span class="dm-g">' + (ICONS[w.app.icon] ? ICONS[w.app.icon]() : '') + '</span><span class="dm-t"></span>';
      b.querySelector('.dm-t').textContent = shortTitle(frontTab(w)) || w.app.name;
      b.addEventListener('click', function () { setMin(id, false); focusWin(id); });
      dockWins.appendChild(b);
    });
    var sep = $('dock-sep');
    if (sep) sep.hidden = !mins.length;
  }
  /* 指针放大：以指针为高斯中心逐帧插值，离开后回到基准 */
  (function magnify() {
    if (window.matchMedia('(hover: none)').matches) return;
    var px = null, raf = 0, cur = {};
    function onMove(ev) { px = ev.clientX; if (!raf) raf = requestAnimationFrame(step); }
    dock.addEventListener('pointermove', onMove);
    dock.addEventListener('pointerleave', function () { px = null; if (!raf) raf = requestAnimationFrame(step); });
    function step() {
      raf = 0; var done = true;
      dock.querySelectorAll('.dock-item').forEach(function (it) {
        var r = it.getBoundingClientRect();
        var c = r.left + r.width / 2;
        var target = DOCK_BASE;
        if (px !== null) {
          var dx = px - c;
          target = DOCK_BASE * (1 + (DOCK_MAX - 1) * Math.exp(-(dx * dx) / (2 * DOCK_SPAN * DOCK_SPAN)));
        }
        var v = cur[it.dataset.app] == null ? DOCK_BASE : cur[it.dataset.app];
        v += (target - v) * 0.32;
        if (Math.abs(target - v) > 0.4) done = false; else v = target;
        cur[it.dataset.app] = v;
        it.style.width = v + 'px'; it.style.height = v + 'px';
      });
      if (!done) raf = requestAnimationFrame(step);
    }
  })();

  /* 桌面空白处的指针菜单（右键 / 长按） */
  function deskMenuItems() {
    var items = [
      { label: '全局搜索…', glyph: 'search', kbd: MODK + 'K', fn: function () { openPalette(); } },
      { sep: 1 },
      { title: '打开应用' },
    ];
    APPS.forEach(function (a, i) {
      items.push({ label: a.name, glyph: a.glyph, kbd: MODK + (i + 1), fn: function () { dockClick(a.id); } });
    });
    return items.concat([
      { sep: 1 },
      { label: '关闭全部窗口', glyph: 'trash', danger: 1, disabled: !Object.keys(wins).length, fn: function () { Object.keys(wins).forEach(closeWin); } },
      { label: '重新载入桌面', glyph: 'reload', fn: function () { location.reload(); } },
      { sep: 1 },
      { label: '显示偏好…', glyph: 'gear', fn: showPrefs },
      { label: '操作指南', glyph: 'question', fn: showGuide },
      { label: '关于本机', glyph: 'list', fn: showAbout },
    ]);
  }

  /* ============================ 9. ⌘K 命令面板（搜索 + 命令同屏） ============================ */
  var pal = null, palRows = [], palHi = 0, palState = { q: '', scope: 'all' }, palSeq = 0, palRemote = [];
  function openPalette(opt) {
    opt = opt || {};
    closePopup(); closeSheet();
    if (pal) { pal.scrim.remove(); pal.el.remove(); pal = null; }
    palState.scope = opt.scope || 'all';
    palState.q = '';
    var scrimEl = document.createElement('div'); scrimEl.className = 'scrim';
    scrimEl.addEventListener('pointerdown', function () { closePalette(); });
    var el = document.createElement('div');
    el.className = 'palette glass glass-thick';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '搜索内容与命令');
    el.innerHTML =
      '<div class="pal-in">' + gl('search') +
        '<input type="search" id="pal-q" placeholder="搜篇目、题目、章节，或输入命令…" autocomplete="off" spellcheck="false" aria-label="搜索" />' +
        '<div class="pal-scope" role="group" aria-label="搜索范围">' +
          '<button type="button" data-scope="all">全部</button>' +
          '<button type="button" data-scope="javaguide">小抄</button>' +
          '<button type="button" data-scope="jbl">题库</button>' +
        '</div>' +
      '</div><div class="pal-list" id="pal-list" role="listbox" aria-label="结果"></div>' +
      '<div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span>' +
        '<span><kbd>' + (isMac ? '⌘' : 'Ctrl') + ' ⇧ Enter</kbd> 新标签页</span><span><kbd>Esc</kbd> 关闭</span>' +
        '<span style="margin-left:auto" id="pal-stat"></span></div>';
    document.body.appendChild(scrimEl); document.body.appendChild(el);
    pal = { el: el, scrim: scrimEl, input: el.querySelector('#pal-q'), list: el.querySelector('#pal-list'), stat: el.querySelector('#pal-stat') };
    el.querySelectorAll('.pal-scope button').forEach(function (b) {
      b.addEventListener('click', function () { palState.scope = b.dataset.scope; renderPal(); });
    });
    pal.input.addEventListener('input', function () { palState.q = pal.input.value; scheduleRemote(); renderPal(); });
    pal.input.addEventListener('keydown', palKeys);
    renderPal();
    pal.input.focus();
  }
  function closePalette() {
    if (!pal) return;
    pal.scrim.remove(); pal.el.remove(); pal = null;
  }
  function palKeys(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closePalette(); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); palHi = (palHi + 1) % Math.max(palRows.length, 1); paintPalHi(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); palHi = (palHi - 1 + palRows.length) % Math.max(palRows.length, 1); paintPalHi(); }
    else if (ev.key === 'Enter') {
      ev.preventDefault();
      var r = palRows[palHi];
      if (r) { if (ev.shiftKey && r.tabNew) r.tabNew(); else r.run(); if (!ev.shiftKey) closePalette(); }
    } else if (ev.key === 'Tab') { ev.preventDefault(); }
  }
  function paintPalHi() {
    palRows.forEach(function (r, i) {
      if (r.el) { r.el.classList.toggle('hi', i === palHi); if (i === palHi) r.el.scrollIntoView({ block: 'nearest' }); }
    });
  }
  var scheduleRemote = debounce(function () {
    var q = palState.q.trim();
    var seq = ++palSeq;
    if (!q || q.length < 1) { palRemote = []; renderPal(); return; }
    getJSON('/api/search?q=' + encodeURIComponent(q) + '&limit=20').then(function (d) {
      if (seq !== palSeq || !pal) return;
      palRemote = (d && d.hits) || [];
      palState.total = d && d.total;
      renderPal();
    });
  }, 150);

  function hl(text, q) {
    var s = esc(text);
    var terms = String(q || '').trim().split(/\s+/).filter(Boolean).slice(0, 4);
    if (!terms.length) return s;
    var re = new RegExp('(' + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
    return s.replace(re, '<mark>$1</mark>');
  }
  function localRows() {
    var q = palState.q.trim().toLowerCase();
    var rows = [];
    /* 1) 命令 */
    var cmds = [
      { t: '外观：浅色', g: 'sun', run: function () { setTheme('light'); } },
      { t: '外观：深色', g: 'moon', run: function () { setTheme('dark'); } },
      { t: '外观：跟随系统', g: 'contrast', run: function () { setTheme('auto'); } },
      { t: prefs.opaque ? '恢复液态玻璃透明度' : '降低透明度（玻璃退成实面）', g: 'contrast', run: toggleOpaque },
      { t: '切换侧边栏', g: 'sidebar', run: function () { toggleSide(frontWin() && frontWin().id); } },
      { t: '新建标签页', g: 'plus', run: function () { tabNew(frontWin() && frontWin().id); } },
      { t: '关闭标签页', g: 'xmark', run: function () { tabClose(frontWin() && frontWin().id); } },
      { t: '窗口居左半屏', g: 'tile-left', run: function () { tile(frontWin() && frontWin().id, 'left'); } },
      { t: '窗口居右半屏', g: 'tile-right', run: function () { tile(frontWin() && frontWin().id, 'right'); } },
      { t: '两窗并列排布', g: 'tile-all', run: tileAll },
      { t: '显示偏好设置', g: 'gear', run: showPrefs },
      { t: '操作指南（没有右键怎么用）', g: 'question', run: showGuide },
      { t: '键盘快捷键一览', g: 'command', run: showShortcuts },
      { t: '关闭全部窗口', g: 'trash', run: function () { Object.keys(wins).forEach(closeWin); } },
      { t: '重新载入桌面', g: 'reload', run: function () { location.reload(); } },
    ];
    APPS.forEach(function (a, i) {
      cmds.push({ t: '打开 ' + a.name, g: a.glyph, kbd: MODK + (i + 1), run: function () { dockClick(a.id); } });
    });
    var cm = cmds.filter(function (c) { return !q || c.t.toLowerCase().indexOf(q) >= 0; });
    if (cm.length) rows.push({ title: '命令', items: cm.map(function (c) { return { t: c.t, g: c.g, kbd: c.kbd, acc: 'var(--accent)', run: c.run }; }) });

    /* 2) 打开的窗口与标签 */
    var openRows = [];
    order.slice().reverse().forEach(function (id) {
      var w = wins[id];
      w.tabs.forEach(function (t) {
        var tt = t.title || shortTitle(t);
        if (q && String(tt + ' ' + t.url).toLowerCase().indexOf(q) < 0) return;
        openRows.push({ t: tt, sub: w.app.name, g: w.app.glyph, acc: w.app.accent, kbd: '窗口',
          run: function () { if (w.min) setMin(id, false); focusWin(id); showTab(w, t.id); },
          tabNew: function () { tabNew(id, t.url); } });
      });
    });
    if (openRows.length) rows.push({ title: '已打开的标签', items: openRows.slice(0, 8) });

    /* 3) 侧栏模块（两个应用的章 / 系统） */
    APPS.forEach(function (a) {
      if (palState.scope !== 'all' && palState.scope !== a.id && palState.scope !== 'recent') return;
      var mods = [];
      (a.modules || []).forEach(function (g) {
        (g.items || []).forEach(function (it) {
          if (q && it.label.toLowerCase().indexOf(q) < 0) return;
          mods.push({ t: it.label, sub: a.name + (it.hint ? ' · ' + it.hint : ''), g: it.glyph, acc: a.accent, href: it.href });
        });
      });
      tocChapters(a.id).forEach(function (c) {
        if (q && (c.name + c.code).toLowerCase().indexOf(q) < 0) return;
        mods.push({ t: c.name, sub: a.name + ' · ' + c.count + ' 篇', g: (a.chapterIcons && a.chapterIcons[c.code]) || 'list',
          acc: (a.chapterColors && a.chapterColors[c.code]) || a.accent, href: c.href });
      });
      if (mods.length) rows.push({
        title: a.name + ' 的模块', items: mods.slice(0, 14).map(function (m) {
          return { t: m.t, sub: m.sub, g: m.g, acc: m.acc, run: function () { gotoModule(m.href); }, tabNew: function () { tabNew(m.href.indexOf('/jbl/') === 0 ? 'jbl' : 'javaguide', m.href); } };
        }),
      });
    });

    /* 4) 最近打开 */
    if (!q) {
      var rec = loadJSON(KEY_RECENT, []);
      if (Array.isArray(rec) && rec.length) rows.push({
        title: '最近打开', items: rec.slice(0, 6).map(function (r) {
          return { t: r.title || r.url, sub: r.url, g: 'clock', acc: 'var(--txt-3)', run: function () { openRecent(r); } };
        }),
      });
    }
    return rows;
  }
  function renderPal() {
    if (!pal) return;
    var q = palState.q.trim();
    var out = localRows();
    /* 远端命中（跨两个应用的正文） */
    var hits = palRemote.filter(function (h) { return palState.scope === 'all' || palState.scope === h.app; });
    if (hits.length) {
      var groups = {};
      hits.forEach(function (h) {
        var name = h.app === 'jbl' ? 'JBL 火箭题库' : 'JavaGuide 离线小抄';
        (groups[name] = groups[name] || []).push(h);
      });
      Object.keys(groups).forEach(function (name) {
        out.push({ title: name + ' 的正文', items: groups[name].map(function (h) {
          var app = h.app === 'jbl' ? 'jbl' : 'javaguide';
          var acc = byId[app] ? byId[app].accent : 'var(--accent)';
          return {
            t: hl(h.title, q), sub: esc(h.sub || '') + (h.kind ? ' · ' + esc(h.kind) : ''),
            snip: h.snip ? hl(h.snip, q) : '', g: app === 'jbl' ? 'bolt' : 'book', acc: acc,
            run: function () { gotoModule(h.url); },
            tabNew: function () { if (!wins[app]) openApp(app, { url: h.url }); else tabNew(app, h.url); },
          };
        }) });
      });
    }
    if (!out.length) {
      pal.list.innerHTML = '<div class="pal-empty"><b>' + (q ? '没有匹配「' + esc(q) + '」的内容' : '没有可显示的条目') + '</b>' +
        (q ? '试试更短的关键词，或换个范围；命令与章节也在这一屏里。' : '') + '</div>';
      palRows = [];
      pal.stat.textContent = '';
      return;
    }
    pal.list.innerHTML = '';
    palRows = [];
    out.forEach(function (grp) {
      var h = document.createElement('div'); h.className = 'pal-grp'; h.textContent = grp.title;
      pal.list.appendChild(h);
      grp.items.forEach(function (it) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'pal-row'; b.setAttribute('role', 'option');
        if (it.acc) b.style.setProperty('--acc', it.acc);
        b.innerHTML = '<span class="pr-g">' + gl(it.g || 'list') + '</span><span class="pr-main">' +
          '<span class="pr-t">' + (it.t || '') + '</span>' +
          (it.sub ? '<span class="pr-sub">' + it.sub + '</span>' : '') +
          (it.snip ? '<span class="pr-snip">' + it.snip + '</span>' : '') + '</span>' +
          (it.kbd ? '<span class="pr-kbd">' + esc(it.kbd) + '</span>' : '');
        if (!b.querySelector('.pr-t').textContent.trim()) b.querySelector('.pr-t').textContent = '（无标题）';
        var i = palRows.length;
        palRows.push({ el: b, run: it.run, tabNew: it.tabNew });
        b.addEventListener('click', function () { it.run(); closePalette(); });
        b.addEventListener('pointerenter', function () { palHi = i; paintPalHi(); });
        pal.list.appendChild(b);
      });
    });
    palHi = clamp(palHi, 0, palRows.length - 1);
    paintPalHi();
    pal.el.querySelectorAll('.pal-scope button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.scope === palState.scope ? 'true' : 'false');
    });
    pal.stat.textContent = q && palState.total != null ? '共 ' + palState.total + ' 条正文命中' : '';
  }

  /* ============================ 10. 关于本机 / 偏好 / 指南 / 快捷键 ============================ */
  function showAbout() {
    var rows = APPS.map(function (a) {
      return '<li><span class="ai">' + (ICONS[a.icon] ? ICONS[a.icon]() : '') + '</span><span><b>' + esc(a.name) +
        '</b><br><small>' + esc(a.desc || '') + '</small></span></li>';
    }).join('');
    sheet({
      wide: false, title: '面试工作台',
      html: '<div class="about-head"><svg viewBox="0 0 64 64" class="about-mark" aria-hidden="true">' +
        '<rect width="64" height="64" rx="16" fill="#101b30"/>' +
        '<circle cx="32" cy="32" r="19" fill="none" stroke="#ff6a3d" stroke-width="2"/>' +
        '<path d="M32 13c3 2.9 4.6 6.8 4.6 11.2 0 2.9-.7 5.6-1.9 8h-5.4c-1.2-2.4-1.9-5.1-1.9-8C27.4 19.8 29 15.9 32 13z" fill="#dce6f6"/>' +
        '<circle cx="32" cy="22" r="2.1" fill="#59c2ff"/>' +
        '<path d="M29.4 33.4c.2 2.3.8 3.9 1.7 5.5.9-1.6 1.5-3.2 1.7-5.5z" fill="#ffb454"/></svg>' +
        '<div><h2 style="text-align:left">面试工作台</h2><p class="about-ver">桌面壳 2.0 · 三栏布局 · 全部本地运行</p></div></div>' +
        '<ul class="about-apps">' + rows + '</ul>' +
        '<p class="about-note">窗口位置、标签页与侧边栏状态记在浏览器 localStorage（<code>desk:session</code>），' +
        '外观偏好记在 <code>desk:prefs</code>。想再加一个应用：把它做成静态站或本机服务，' +
        '然后在 <code>desktop/apps.js</code> 的注册表里添一条，桌面图标、程序坞、侧栏与快捷键会自动就位。</p>',
      actions: [{ label: '操作指南', fn: showGuide }, { label: '好', kind: 'pri' }],
    });
  }
  function showPrefs() {
    var el = sheet({
      wide: true, title: '显示偏好',
      html: '<div class="prefs">' +
        '<div class="pref-row"><div class="pf-t"><b>外观</b><span>浅色 / 深色 / 跟随系统；子应用窗口会一起换装</span></div>' +
          '<div class="seg" id="pf-theme" role="group" aria-label="外观">' +
            '<button type="button" data-t="auto">跟随系统</button>' +
            '<button type="button" data-t="light">浅色</button>' +
            '<button type="button" data-t="dark">深色</button></div></div>' +
        '<div class="pref-row"><div class="pf-t"><b>降低透明度</b><span>材质退成实面，玻璃不再透出下层内容（等同系统的「减少透明度」）</span></div>' +
          '<button type="button" class="sw" id="pf-opaque" role="switch" aria-label="降低透明度"></button></div>' +
        '<div class="pref-row"><div class="pf-t"><b>侧边栏宽度</b><span>拖窗口左侧的分隔线也能调，双击分隔线复位</span></div>' +
          '<div class="seg" id="pf-side"><button type="button" data-w="168">窄</button><button type="button" data-w="226">标准</button><button type="button" data-w="300">宽</button></div></div>' +
        '<p class="sheet-note">系统级偏好也会被尊重：<em>prefers-color-scheme</em> 决定默认外观、' +
        '<em>prefers-reduced-motion</em> 关掉动效、<em>prefers-reduced-transparency</em> 自动降到实面。</p></div>',
      actions: [{ label: '完成', kind: 'pri' }],
    });
    function sync() {
      el.querySelectorAll('#pf-theme button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.t === prefs.theme ? 'true' : 'false'); });
      el.querySelector('#pf-opaque').setAttribute('aria-checked', prefs.opaque ? 'true' : 'false');
      var w = frontWin();
      el.querySelectorAll('#pf-side button').forEach(function (b) {
        b.setAttribute('aria-pressed', String((w ? w.sideW : prefs.sideW)) === b.dataset.w ? 'true' : 'false');
      });
    }
    el.querySelectorAll('#pf-theme button').forEach(function (b) {
      b.addEventListener('click', function () { setTheme(b.dataset.t, true); sync(); });
    });
    el.querySelector('#pf-opaque').addEventListener('click', function () { toggleOpaque(); sync(); });
    el.querySelectorAll('#pf-side button').forEach(function (b) {
      b.addEventListener('click', function () {
        prefs.sideW = Number(b.dataset.w);
        Object.keys(wins).forEach(function (id) { setSideW(id, prefs.sideW); });
        sync();
      });
    });
    sync();
  }
  var GUIDE = {
    main: {
      title: '怎样在不能右键的网页里操作一切',
      html: '<p style="text-align:left">这套外壳的所有动作都有 <b>四条入口</b>，任何一条被堵住（例如环境禁掉右键、' +
        '或你用的是触摸屏）都不影响其余三条：</p>' +
        '<div class="kb-grid">' +
        '<div><b>① 长按 0.5 秒</b><kbd>按住不放</kbd></div>' +
        '<div><b>② 顶部菜单栏</b><kbd>点菜单名</kbd></div>' +
        '<div><b>③ 工具栏 ⋯ 按钮</b><kbd>窗口右上角</kbd></div>' +
        '<div><b>④ 命令面板</b><kbd>' + (isMac ? '⌘' : 'Ctrl') + ' K</kbd></div>' +
        '</div>' +
        '<p style="text-align:left">长按的位置决定菜单内容：在<b>桌面空白处</b>得到桌面菜单，在<b>标签页</b>上得到标签菜单，' +
        '在<b>侧栏条目</b>上得到「当前页打开 / 新标签页打开」，在<b>窗口内容里</b>（包括小抄和题库正文）得到窗口菜单。' +
        '鼠标按住不动和手指按住不动是同一条路径，触摸屏上同样可用。</p>',
    },
    side: {
      title: '侧边栏与标签页',
      html: '<div style="text-align:left;line-height:1.9">' +
        '<p>· 点侧栏条目 = 在<b>当前标签页</b>打开；长按侧栏条目 = 可以选择<b>在新标签页打开</b>。</p>' +
        '<p>· 拖<b>侧栏与正文之间那条缝</b>可改宽度，双击那条缝复位；键盘也可以：<kbd>Tab</kbd> 走到分隔线后用 <kbd>←</kbd><kbd>→</kbd>。</p>' +
        '<p>· 标签页可拖动排序，双击或按 <kbd>Delete</kbd> 关闭，鼠标中键也关。</p>' +
        '<p>· 只有 1 个标签时标签条自动收起，把宽度全部让给正文。</p>' +
        '</div>',
    },
  };
  function showGuide(which) {
    var g = GUIDE[which] || GUIDE.main;
    sheet({
      wide: true, title: g.title,
      html: g.html + (which === 'side' ? '' :
        '<div class="kb-grid">' +
        '<div>新建标签页<kbd>' + (isMac ? '⌘' : 'Ctrl') + ' T</kbd></div>' +
        '<div>关闭标签页<kbd>' + (isMac ? '⌘' : 'Ctrl') + ' W</kbd></div>' +
        '<div>切换标签页<kbd>' + (isMac ? '⌘' : 'Ctrl') + ' ⇧ [ / ］</kbd></div>' +
        '<div>显示 / 隐藏侧栏<kbd>' + (isMac ? '⌘' : 'Ctrl') + ' B</kbd></div>' +
        '<div>切换外观<kbd>' + (isMac ? '⌘' : 'Ctrl') + ' ⇧ D</kbd></div>' +
        '<div>这份指南<kbd>' + (isMac ? '⌘' : 'Ctrl') + ' /</kbd></div>' +
        '</div>'),
      actions: [{ label: '看快捷键全表', fn: showShortcuts }, { label: '知道了', kind: 'pri' }],
    });
  }
  var KEYS = [
    ['打开第 1 / 2 个应用', 'Ctrl ⌘ + 1 / 2'],
    ['全局搜索与命令面板', 'Ctrl ⌘ + K'],
    ['新建标签页', 'Ctrl ⌘ + T'],
    ['关闭标签页 / 窗口', 'Ctrl ⌘ + W ／ ⇧ W'],
    ['切换标签页', 'Ctrl ⌘ + ⇧ + [ ／ ］'],
    ['后退 / 前进（当前标签页）', 'Ctrl ⌘ + [ ／ ］'],
    ['重新载入这一页', 'Ctrl ⌘ + R'],
    ['显示 / 隐藏侧边栏', 'Ctrl ⌘ + B'],
    ['外观：跟随系统 → 浅 → 深', 'Ctrl ⌘ + ⇧ + D'],
    ['窗口居左 / 居右半屏', 'Ctrl ⌘ + ⇧ + ← ／ →'],
    ['两窗并列排布', 'Ctrl ⌘ + ⇧ + F'],
    ['最小化 / 缩放窗口', 'Ctrl ⌘ + M ／ ⇧ + ＝'],
    ['切换到下一个窗口', 'Ctrl ⌘ + `'],
    ['打开这份快捷键表', '?'],
    ['操作指南（没有右键怎么用）', 'Ctrl ⌘ + /'],
    ['关闭当前浮层 / 菜单', 'Esc'],
  ];
  function showShortcuts() {
    sheet({
      wide: true, title: '键盘快捷键',
      html: '<div class="kb-grid">' + KEYS.map(function (k) {
        return '<div>' + esc(k[0]) + '<kbd>' + esc(k[1]) + '</kbd></div>';
      }).join('') + '</div>' +
      '<p class="sheet-note">Windows 上按 Ctrl，macOS 上按 ⌘，两者等价。在窗口内容里（iframe 内）按这些组合同样有效 —— ' +
      '小抄与题库里装了桥接脚本，会把按键转交给桌面外壳处理。</p>',
      actions: [{ label: '看操作指南', fn: showGuide }, { label: '好', kind: 'pri' }],
    });
  }

  /* ============================ 11. 时钟与状态项 ============================ */
  function clock() {
    var d = new Date();
    var wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    var hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    $('mb-clock').textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + wk + ' ' + hh + ':' + mm;
  }
  function wireStatusItems() {
    $('db-chip').addEventListener('click', function () {
      probeDb(true);
      toast(progress.javaguide ? '划线与掌握进度存于本机 MySQL，实时同步' : 'MySQL 未启动：进度暂时记不到库，但阅读与搜索不受影响');
    });
    wirePointerMenu($('db-chip'), function () { return [
      { title: '进度库' },
      { label: '重新检测', glyph: 'reload', fn: function () { probeDb(true); } },
      { label: progress.javaguide ? '已读 ' + progress.javaguide.done + '/' + progress.javaguide.total : '小抄进度：未连接', disabled: true },
      { label: progress.jbl ? '已掌握 ' + progress.jbl.done + '/' + progress.jbl.total : '题库进度：未连接', disabled: true },
    ]; });
    mbTheme.addEventListener('click', function (ev) {
      ev.stopPropagation();
      openPopup({ items: menuFor('view').slice(2, 6), anchor: mbTheme });
    });
    wirePointerMenu(mbTheme, function () { return menuFor('view').slice(2, 6); });
    mbLogo.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  }

  /* ============================ 12. 键盘 ============================ */
  function isTyping(el) {
    return el && (/^(INPUT|TEXTAREA|SELECT)$/).test(el.tagName || '') ;
  }
  function onKey(ev) {
    var meta = isMac ? ev.metaKey : ev.ctrlKey;
    if (meta && !ev.altKey) {
      var k = ev.key.toLowerCase();
      if (/^[1-9]$/.test(ev.key)) {
        var a = APPS[Number(ev.key) - 1];
        if (a) { ev.preventDefault(); dockClick(a.id); }
        return;
      }
      switch (k) {
        case 'k': ev.preventDefault(); return pal ? closePalette() : openPalette();
        case 't': if (frontWin()) { ev.preventDefault(); return tabNew(frontWin().id); } return;
        case 'w': if (frontWin()) { ev.preventDefault(); return ev.shiftKey ? closeWin(frontWin().id) : tabClose(frontWin().id); } return;
        case 'r': if (frontWin()) { ev.preventDefault(); return tabReload(frontWin().id); } return;
        case 'b': if (frontWin()) { ev.preventDefault(); return toggleSide(frontWin().id); } return;
        case 'd': if (ev.shiftKey) { ev.preventDefault(); return cycleTheme(); } return;
        case 'm': if (frontWin()) { ev.preventDefault(); return ev.shiftKey ? showAll() : setMin(frontWin().id, true); } return;
        case '[': if (frontWin()) { ev.preventDefault(); return ev.shiftKey ? cycleTab(true) : tabBack(frontWin().id); } return;
        case ']': if (frontWin()) { ev.preventDefault(); return ev.shiftKey ? cycleTab(false) : tabForward(frontWin().id); } return;
        case ',': ev.preventDefault(); return showPrefs();
        case '/': ev.preventDefault(); return showGuide();
        case '`': ev.preventDefault(); return cycleWin();
        case '=': if (frontWin()) { ev.preventDefault(); return toggleMax(frontWin().id); } return;
      }
      if (ev.shiftKey && (k === 'arrowleft' || k === 'arrowright')) {
        if (frontWin()) { ev.preventDefault(); return tile(frontWin().id, k === 'arrowleft' ? 'left' : 'right'); }
      }
      if (ev.shiftKey && k === 'f') { ev.preventDefault(); return tileAll(); }
    }
    if (popupEl && !isTyping(document.activeElement)) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); stepMenu(1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); stepMenu(-1); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); stepBarMenu(1); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); stepBarMenu(-1); }
      else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activateMenu(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closePopup(); }
    }
    if (ev.key === 'Escape') { if (pal) closePalette(); return; }
    if (ev.key === '?' && !isTyping(document.activeElement) && !meta) { ev.preventDefault(); showShortcuts(); }
  }
  /* 子应用桥接：窗口里按下的组合键转交给外壳；应用内自己切了夜读，外壳跟随 */
  function onMessage(ev) {
    if (ev.origin !== location.origin) return;
    var d = ev.data;
    if (!d || d.source !== 'desk-app' || !d.type) return;
    if (d.type === 'shortcut') return frameKey(d, ev);
    if (d.type === 'mode') return adoptMode(d.mode);
    if (d.type === 'ready') {
      Object.keys(wins).forEach(function (id) {
        wins[id].tabs.forEach(function (t) { if (t.frame && t.frame.contentWindow === ev.source) pushTheme(t); });
      });
    }
  }
  /* 键位转交：焦点在窗口内容（iframe）里时快捷键不该失效 —— 复用同一套动作语义 */
  var FRAME_KEYS = {
    k: 'palette', t: 'tab-new', r: 'reload', b: 'side-toggle', ',': 'prefs',
    '/': 'guide', '?': 'shortcuts', '`': 'cycle-win', '=': 'win-max',
  };
  function frameKey(d) {
    var k = String(d.key || '').toLowerCase();
    if (/^[1-9]$/.test(k)) { var a = APPS[Number(k) - 1]; if (a) { dockClick(a.id); } return; }
    if (k === 'w') return d.shift ? run('win-close') : run('tab-close');
    if (k === 'm') return d.shift ? void showAll() : run('win-min');
    if (k === '[') return d.shift ? cycleTab(true) : run('back');
    if (k === ']') return d.shift ? cycleTab(false) : run('forward');
    if (k === 'arrowleft' && d.shift) return run('tile:left');
    if (k === 'arrowright' && d.shift) return run('tile:right');
    if (k === 'd' && d.shift) return run('cycle-theme');
    if (FRAME_KEYS[k]) return run(FRAME_KEYS[k]);
  }

  /* ============================ 13. 视口与视差 ============================ */
  (function parallax() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(hover: none)').matches) return;
    var q = 0, tx = 0, ty = 0;
    window.addEventListener('pointermove', function (ev) {
      tx = (ev.clientX / innerWidth - 0.5) * 2;
      ty = (ev.clientY / innerHeight - 0.5) * 2;
      if (!q) q = requestAnimationFrame(function () {
        q = 0;
        document.body.style.setProperty('--px', tx.toFixed(3));
        document.body.style.setProperty('--py', ty.toFixed(3));
      });
    }, { passive: true });
  })();
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitWindows, 280);   /* 截图 / 拖动边缘的瞬态尺寸不该把窗口挪来挪去 */
  });
  function fitWindows() {
    var S = stageRect();
    if (S.w < 200 || S.h < 200) return;
    Object.keys(wins).forEach(function (id) {
      var w = wins[id];
      if (w.max) { w.rect.w = S.w; w.rect.h = Math.max(S.h - dockReserve(), 240); }
      else if (w.tile) { tile(id, w.tile, true); return; }
      else {
        w.rect.w = Math.min(w.rect.w, S.w);
        w.rect.h = Math.min(w.rect.h, S.h);
        w.rect.x = clamp(w.rect.x, 0, Math.max(S.w - w.rect.w, 0));
        w.rect.y = clamp(w.rect.y, 0, Math.max(S.h - w.rect.h, 0));
      }
      applyRect(w);
    });
    saveSession();
  }

  /* ============================ 14. 开机 ============================ */
  buildMenuBar();
  buildChrome();
  wireStatusItems();
  applyTheme();
  clock(); setInterval(clock, 5000);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('message', onMessage);
  $('mb-clock').addEventListener('click', showAbout);
  stage.addEventListener('contextmenu', function (ev) {
    if (ev.target.closest('.win')) return;
    ev.preventDefault();
    openPopup({ items: deskMenuItems(), x: ev.clientX, y: ev.clientY });
  });
  stage.addEventListener('pointerdown', function (ev) {
    if (ev.target.closest('.win, .desk-icon')) return;
    iconsBox.querySelectorAll('.desk-icon.sel').forEach(function (o) { o.classList.remove('sel'); });
  });
  (function () {
    var t = 0;
    stage.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('.win, .desk-icon') || ev.button !== 0) return;
      var sx = ev.clientX, sy = ev.clientY;
      t = setTimeout(function () { openPopup({ items: deskMenuItems(), x: sx, y: sy }); }, 500);
    });
    ['pointerup', 'pointercancel', 'pointermove'].forEach(function (k) {
      stage.addEventListener(k, function (ev) {
        if (k === 'pointermove' && (Math.abs(ev.clientX - sx0) > 10 || Math.abs(ev.clientY - sy0) > 10)) { clearTimeout(t); }
        if (k !== 'pointermove') clearTimeout(t);
      });
    });
    var sx0 = 0, sy0 = 0;
    stage.addEventListener('pointerdown', function (ev) { sx0 = ev.clientX; sy0 = ev.clientY; });
  })();

  (function restore() {
    var s = loadJSON(KEY_SESSION, {});
    var ids = s.order || [];
    /* 老会话（v1：只有矩形没有标签）也能起来：把 src 当首个标签页 */
    if (!ids.length) { probeDb(); loadCatalog(); return; }
    ids.forEach(function (id, i) {
      var g = s.wins && s.wins[id];
      if (!g || !byId[id]) return;
      setTimeout(function () {
        openApp(id, {
          rect: { x: g.x, y: g.y, w: g.w, h: g.h }, tabs: g.tabs, i: g.i,
          noSide: !!g.noSide, sideW: g.sideW, max: !!g.max, tile: g.tile || null, silent: true,
        });
      }, i * 90);
    });
    setTimeout(function () {
      if (s.front && wins[s.front]) { if (wins[s.front].min) setMin(s.front, false); focusWin(s.front); }
      Object.keys(wins).forEach(function (id) { if (s.wins[id] && s.wins[id].min) setMin(id, true); });
    }, ids.length * 90 + 80);
    probeDb();
    loadCatalog();
  })();
  setInterval(function () { probeDb(); }, 45000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) probeDb(); });
})();
