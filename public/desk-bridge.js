/* 桌面外壳 ↔ JavaGuide 离线小抄 的适配桥。
   只在「被外壳装进 iframe」时生效：独立打开（file:// 双击、直接访问 /index.html）
   第一行就返回，页面行为与接桥之前完全一致。
   三条通道：外壳调 window.DESK_applyMode(mode) 下发主题；本地主题变化用
   postMessage{type:'mode'} 回报；窗口内按下的外壳快捷键用 postMessage{type:'shortcut'} 转交。 */
(function () {
  "use strict";
  if (window.top === window.self) return;

  var cfg = window.DESK_BRIDGE || {};
  var MODE_KEY = cfg.modeKey || "read-mode";
  var HOME = cfg.home || "/index.html";
  var ROOT = location.origin + "/";
  var root = document.documentElement;
  var last = root.dataset.mode || "";            /* 最后一次已知/已上报的模式，用来吃掉自激 */

  function post(msg) {
    msg.source = "desk-app";
    try { window.parent.postMessage(msg, location.origin); } catch (e) { /* 外壳不在就静默 */ }
  }

  /* 主题下发：写偏好 + 贴 data-mode（CSS 钩子），不弹 toast——外壳驱动的切换不该再报一次。
     第二个参数 persist=false 表示「只在本次会话里生效，别落盘」：外壳处于「跟随系统」时
     走这一路，避免把小抄原本可以留空的「跟随系统」态固化成显式的 day/night。 */
  window.DESK_applyMode = function (mode, persist) {
    if (mode !== "day" && mode !== "night") return;
    if (root.dataset.mode === mode) { last = mode; return; }
    if (persist !== false) {
      try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* 隐私模式：本次生效即可 */ }
    }
    last = mode;
    root.dataset.mode = mode;
    var btn = document.getElementById("rail-mode");
    if (btn) btn.setAttribute("aria-pressed", mode === "night" ? "true" : "false");
    /* 夜读重画 mermaid 的副作用留在 read.js 里，这里只广播意图 */
    try { document.dispatchEvent(new CustomEvent("desk:applymode", { bubbles: true, detail: { mode: mode } })); } catch (e) { /* 忽略 */ }
  };

  /* 本地切换（页内按钮、read.js 的 toggleMode）→ 回报外壳；自己下发的已由 last 吃掉 */
  if (window.MutationObserver) {
    new MutationObserver(function () {
      var m = root.dataset.mode || "";
      if (m === last) return;
      last = m;
      if (m === "day" || m === "night") post({ type: "mode", mode: m });
    }).observe(root, { attributes: true, attributeFilter: ["data-mode"] });
  }

  /* 快捷键转交：只接管带 Ctrl/⌘ 的组合键，Ctrl+C/V/X/Z/A 这些编辑键一律放行（输入框里也照转） */
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

  /* 「回桌面」链接改道：在窗口里 / 就是桌面本身，点它会把外壳套进 iframe 并丢掉会话 */
  function fix(a) {
    if (a.getAttribute("href") === "/" || a.href === ROOT) a.setAttribute("href", HOME);
  }
  function scan(scope) {
    var list = scope.querySelectorAll("a[href]");
    for (var i = 0; i < list.length; i++) fix(list[i]);
  }
  var queue = [], scheduled = false;
  function flush() {
    scheduled = false;
    var batch = queue; queue = [];
    for (var i = 0; i < batch.length; i++) {
      var n = batch[i];
      if (n.nodeType !== 1) continue;
      if (n.tagName === "A") fix(n); else if (n.querySelectorAll) scan(n);
    }
  }
  function watchDom() {
    scan(document);
    if (!window.MutationObserver) return;
    new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var kids = recs[i].addedNodes;
        for (var j = 0; j < kids.length; j++) queue.push(kids[j]);
      }
      if (queue.length && !scheduled) { scheduled = true; setTimeout(flush, 0); }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { watchDom(); post({ type: "ready" }); });
  } else {
    watchDom();
    post({ type: "ready" });
  }
})();
