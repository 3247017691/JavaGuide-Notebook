/* 桌面外壳 ↔ JBL 火箭题库 的适配桥（与小抄那份同构，差异在主题落地方式）。
   只在「被外壳装进 iframe」时生效：独立打开（file:// 双击、直接访问 index.html）
   第一行就返回，页面行为与接桥之前完全一致。 */
(function () {
  "use strict";
  if (window.top === window.self) return;

  var cfg = window.DESK_BRIDGE || {};
  var MODE_KEY = cfg.modeKey || "jbl-rocket:mode";
  var root = document.documentElement;
  var last = root.dataset.mode || "";            /* 最后一次已知/已上报的模式，用来吃掉自激 */

  function post(msg) {
    msg.source = "desk-app";
    try { window.parent.postMessage(msg, location.origin); } catch (e) { /* 外壳不在就静默 */ }
  }

  /* 主题下发：JBL.applyMode() 是「从 localStorage 读」而不是「接收值」，所以先落键再调它；
     走应用自己的函数，页内那颗 .mode-btn 的图标状态才跟着换脸。不弹 toast。
     persist=false：外壳在「跟随系统」时只要本次生效，不要把偏好写死。 */
  window.DESK_applyMode = function (mode, persist) {
    if (mode !== "day" && mode !== "night") return;
    if (root.dataset.mode === mode) { last = mode; return; }
    last = mode;
    if (persist === false) { root.dataset.mode = mode; return; }
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* 隐私模式：本次生效即可 */ }
    if (window.JBL && typeof window.JBL.applyMode === "function") {
      try { window.JBL.applyMode(); return; } catch (e) { /* 退化到下面的直写 */ }
    }
    root.dataset.mode = mode;
  };

  /* 本地切换（.mode-btn → JBL.toggleMode）→ 回报外壳；自己下发的已由 last 吃掉 */
  if (window.MutationObserver) {
    new MutationObserver(function () {
      var m = root.dataset.mode || "";
      if (m === last) return;
      last = m;
      if (m === "day" || m === "night") post({ type: "mode", mode: m });
    }).observe(root, { attributes: true, attributeFilter: ["data-mode"] });
  }

  /* 快捷键转交：只接管带 Ctrl/⌘ 的组合键，Ctrl+C/V/X/Z/A 这些编辑键一律放行（搜索框里也照转） */
  var KEYS = Object.create(null);   /* 无原型：避免 ev.key 撞上 constructor/__proto__ 这类属性名 */
  "123456789dktwrbm[],/?`=".split("").forEach(function (k) { KEYS[k] = 1; });
  KEYS.ArrowLeft = KEYS.ArrowRight = 1;
  var SHIFT_KEYS = { "{": "[", "}": "]" };   /* Shift 改写的字符映射回原键，比如 ⇧[ 打出来是 { */
  document.addEventListener("keydown", function (ev) {
    var k = SHIFT_KEYS[ev.key] || (ev.key.length === 1 ? ev.key.toLowerCase() : ev.key);
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || !KEYS[k]) return;
    ev.preventDefault();
    post({ type: "shortcut", key: k, shift: !!ev.shiftKey });
  });

  /* 题库正文里没有 href="/" 的链接（全是相对路径），链接改道这一项对本应用无用，不写。 */
  post({ type: "ready" });
})();
