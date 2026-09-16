<template>
  <div>
    <a class="skip" href="#stage">跳到主区域</a>
    <!-- 壁纸：折叠绸（两条缎带在 desk.css 的 .wallpaper::before/::after 上）
         + 四个缓慢形变的色球。球是液玻璃的「底衬」—— 玻璃面做 backdrop-filter 时
         背后得有东西在动，模糊 + 加饱和才看得出是玻璃；静态渐变太均匀，
         看过去就是一块磨砂塑料。球是纯装饰，随 data-desk-liquid 一起开关。 -->
    <div class="wallpaper" aria-hidden="true">
      <i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="blob b4"></i>
    </div>

    <MenuBar />
    <DeskWidgets />

    <main id="stage" class="stage" @contextmenu="onDeskContext">
      <DeskIcons />
      <div class="win-layer">
        <WinFrame v-for="id in wins.order" :key="id" :win="wins.wins[id]" />
      </div>
    </main>

    <Dock />
    <Launchpad />
    <Palette />
    <Sheets />
    <CtxMenu />

    <div class="desk-toast glass-thick" :class="{ show: !!ui.toast, bad: ui.toast && ui.toast.bad }" role="status" aria-live="polite">
      <template v-if="ui.toast">
        <span class="t-ic" v-html="gl(ui.toast.bad ? 'xmark' : 'checkmark')" />
        <span>{{ ui.toast.msg }}</span>
      </template>
    </div>
  </div>
</template>

<script setup>
/* 桌面外壳装配：壁纸 / 菜单栏 / 窗口层 / 程序坞 / 启动台 / 面板。
   键盘快捷键、JBL iframe 桥接、视差与视口适配都在这里接线。 */
import { onMounted, onBeforeUnmount } from "vue";
import { gl } from "../../lib/icons";
import { appById } from "../../lib/apps";
import { usePrefs } from "../../stores/prefs";
import { useDesk } from "../../stores/desk";
import { useWins } from "../../stores/windows";
import { useUi } from "../../stores/ui";
import { openCtx, closeCtx } from "./ctx";
import { initLiquid } from "../../lib/liquid";
import MenuBar from "./MenuBar.vue";
import DeskWidgets from "./DeskWidgets.vue";
import Dock from "./Dock.vue";
import DeskIcons from "./DeskIcons.vue";
import WinFrame from "./WinFrame.vue";
import Launchpad from "./Launchpad.vue";
import Palette from "./Palette.vue";
import Sheets from "./Sheets.vue";
import CtxMenu from "./CtxMenu.vue";

const prefs = usePrefs();
const desk = useDesk();
const wins = useWins();
const ui = useUi();

/* ---------------- 桌面右键 ---------------- */
function deskMenuItems() {
  return [
    { label: "全局搜索…", glyph: "search", kbd: "Ctrl ⌘ K", fn: () => wins.run("palette") },
    { label: "启动台", glyph: "launchpad", kbd: "Ctrl ⌘ ⇧ A", fn: () => wins.run("launchpad") },
    { sep: 1 },
    { title: "打开应用" },
    ...Object.values(appById).map((a, i) => ({
      label: a.name, glyph: a.glyph, kbd: "Ctrl ⌘ " + (i + 1), fn: () => wins.dockClick(a.id),
    })),
    { sep: 1 },
    { label: "关闭全部窗口", glyph: "trash", danger: 1, disabled: !Object.keys(wins.wins).length, fn: () => wins.run("closeall") },
    { label: "重新载入桌面", glyph: "reload", fn: () => location.reload() },
    { sep: 1 },
    { label: "显示偏好…", glyph: "gear", fn: () => ui.openSheet("prefs") },
    { label: "操作指南", glyph: "question", fn: () => ui.openSheet("guide") },
    { label: "关于本机", glyph: "list", fn: () => ui.openSheet("about") },
  ];
}
function onDeskContext(ev) {
  if (ev.target.closest(".win")) return;
  ev.preventDefault();
  openCtx({ items: deskMenuItems(), x: ev.clientX, y: ev.clientY });
}

/* ---------------- 键盘 ---------------- */
function isTyping(el) {
  return el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || "");
}
function onKey(ev) {
  const meta = ev.ctrlKey || ev.metaKey;
  if (meta && !ev.altKey) {
    const k = ev.key.toLowerCase();
    if (/^[1-9]$/.test(ev.key)) {
      const list = Object.values(appById);
      const a = list[Number(ev.key) - 1];
      if (a) { ev.preventDefault(); wins.dockClick(a.id); }
      return;
    }
    switch (k) {
      case "k": ev.preventDefault(); return ui.paletteOpen ? ui.closePalette() : ui.openPalette();
      case "a": if (ev.shiftKey) { ev.preventDefault(); return ui.launchpad ? ui.closeLaunchpad() : ui.openLaunchpad(); } return;
      case "t": if (wins.frontWin) { ev.preventDefault(); return wins.tabNew(wins.frontWin.id); } return;
      case "w": if (wins.frontWin) { ev.preventDefault(); return ev.shiftKey ? wins.closeWin(wins.frontWin.id) : wins.tabClose(wins.frontWin.id); } return;
      case "r": if (wins.frontWin) { ev.preventDefault(); return wins.tabReload(wins.frontWin.id); } return;
      case "b": if (wins.frontWin) { ev.preventDefault(); return wins.toggleSide(wins.frontWin.id); } return;
      case "d": if (ev.shiftKey) { ev.preventDefault(); return prefs.cycleTheme(); } return;
      case "m": if (wins.frontWin) { ev.preventDefault(); return ev.shiftKey ? wins.showAll() : wins.setMin(wins.frontWin.id, true); } return;
      case "[": if (wins.frontWin) { ev.preventDefault(); return ev.shiftKey ? wins.cycleTab(true) : wins.tabBack(wins.frontWin.id); } return;
      case "]": if (wins.frontWin) { ev.preventDefault(); return ev.shiftKey ? wins.cycleTab(false) : wins.tabForward(wins.frontWin.id); } return;
      case ",": ev.preventDefault(); return ui.openSheet("prefs");
      case "/": ev.preventDefault(); return ui.openSheet("guide");
      case "`": ev.preventDefault(); return wins.cycleWin();
      case "=": if (wins.frontWin) { ev.preventDefault(); return wins.toggleMax(wins.frontWin.id); } return;
    }
    if (ev.shiftKey && (k === "arrowleft" || k === "arrowright")) {
      if (wins.frontWin) { ev.preventDefault(); return wins.tile(wins.frontWin.id, k === "arrowleft" ? "left" : "right"); }
    }
    if (ev.shiftKey && k === "f") { ev.preventDefault(); return wins.tileAll(); }
  }
  if (ev.key === "Escape") {
    if (ui.paletteOpen) { ui.closePalette(); return; }
    if (ui.launchpad) { ui.closeLaunchpad(); return; }
    if (ui.sheet) { ui.closeSheet(); return; }
    closeCtx();
    return;
  }
  if (ev.key === "?" && !isTyping(document.activeElement) && !meta) {
    ev.preventDefault();
    ui.openSheet("shortcuts");
  }
}

/* ---------------- JBL iframe 桥接 ---------------- */
async function onMessage(ev) {
  if (ev.origin !== location.origin) return;
  const d = ev.data;
  if (!d || d.source !== "desk-app" || !d.type) return;
  if (d.type === "shortcut") return frameKey(d);
  if (d.type === "mode") return adoptMode(d.mode);
  if (d.type === "ready") {
    // 子应用就绪：把当前主题推下去（JBL 走 localStorage + data-mode）
    Object.values(wins.wins).forEach((w) => {
      if (w.appId !== "jbl") return;
      w.tabs.forEach((t) => pushJblTheme(t));
    });
  }
}
function pushJblTheme(t) {
  try {
    const w = t.frameWindow;
    if (!w) return;
    w.localStorage.setItem("jbl-rocket:mode", prefs.nbMode);
    w.document.documentElement.dataset.mode = prefs.nbMode;
  } catch { /* 忽略 */ }
}
function adoptMode(mode) {
  if (prefs.theme !== "auto") return;
  const want = mode === "night" ? "dark" : "light";
  if (prefs.resolved === want) return;
  prefs.setTheme(want);
  ui.showToast("外观已跟随应用：" + (want === "dark" ? "深色" : "浅色"));
}
const FRAME_KEYS = {
  k: "palette", t: "tab-new", r: "reload", b: "side-toggle", ",": "prefs",
  "/": "guide", "?": "shortcuts", "`": "cycle-win", "=": "win-max",
};
function frameKey(d) {
  const k = String(d.key || "").toLowerCase();
  if (/^[1-9]$/.test(k)) {
    const list = Object.values(appById);
    const a = list[Number(k) - 1];
    if (a) wins.dockClick(a.id);
    return;
  }
  if (k === "w") return d.shift ? wins.run("win-close") : wins.run("tab-close");
  if (k === "m") return d.shift ? wins.run("show-all") : wins.run("win-min");
  if (k === "[") return d.shift ? wins.cycleTab(true) : wins.run("back");
  if (k === "]") return d.shift ? wins.cycleTab(false) : wins.run("forward");
  if (k === "arrowleft" && d.shift) return wins.run("tile:left");
  if (k === "arrowright" && d.shift) return wins.run("tile:right");
  if (k === "a" && d.shift) return ui.launchpad ? ui.closeLaunchpad() : ui.openLaunchpad();
  if (k === "d" && d.shift) return prefs.cycleTheme();
  if (FRAME_KEYS[k]) return wins.run(FRAME_KEYS[k]);
}

/* ---------------- 视差与视口 ---------------- */
let parallaxRaf = 0;
function onPointerMove(ev) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.matchMedia("(hover: none)").matches) return;
  const tx = (ev.clientX / window.innerWidth - 0.5) * 2;
  const ty = (ev.clientY / window.innerHeight - 0.5) * 2;
  if (parallaxRaf) return;
  parallaxRaf = requestAnimationFrame(() => {
    parallaxRaf = 0;
    document.body.style.setProperty("--px", tx.toFixed(3));
    document.body.style.setProperty("--py", ty.toFixed(3));
  });
}
let resizeTimer = 0;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => wins.fitWindows(), 280);
}

onMounted(() => {
  prefs.init();
  initLiquid();          /* 液玻璃：底衬开关 + 追踪高光 + 点击涟漪 */
  desk.startPolling();
  wins.restoreSession();
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("message", onMessage);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("resize", onResize);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKey, true);
  window.removeEventListener("message", onMessage);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("resize", onResize);
});
</script>
