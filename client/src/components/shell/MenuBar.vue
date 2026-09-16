<template>
  <header class="menubar glass-thin" role="menubar" aria-label="系统菜单栏">
    <button class="mb-item mb-logo" type="button" data-ctx-anchor aria-label="工作台菜单"
            :class="{ open: isOpen('bar:sys') }" @click.stop="toggle('sys', $event)" @pointerenter="hot('sys', $event)"
            v-html="gl('rocket')" />
    <button class="mb-item mb-app" type="button" data-ctx-anchor
            :class="{ open: isOpen('bar:app') }" @click.stop="toggle('app', $event)" @pointerenter="hot('app', $event)">
      {{ frontApp ? frontApp.name : "面试工作台" }}
    </button>
    <button v-for="m in MENU_DEFS" :key="m.id" class="mb-item" type="button" data-ctx-anchor
            :class="{ open: isOpen('bar:' + m.id) }" @click.stop="toggle(m.id, $event)" @pointerenter="hot(m.id, $event)">
      {{ m.label }}
    </button>
    <span class="mb-grow" />

    <button class="mb-item db-chip" :class="dbClass" type="button" data-ctx-anchor
            title="进度库：小抄划线与题库掌握记录存于本机 MySQL"
            @click="onDbClick" @pointerenter="hot(null)">
      <span class="led" /><span>{{ dbText }}</span>
    </button>
    <button class="mb-item mb-theme" type="button" data-ctx-anchor aria-label="外观"
            @click.stop="toggle('view', $event)" @pointerenter="hot(null)" v-html="gl(resolved === 'dark' ? 'moon' : 'sun')" />
    <button class="mb-item mb-clock" type="button" title="关于本机" @click="run('about')" @pointerenter="hot(null)">
      {{ clockText }}
    </button>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { gl } from "../../lib/icons";
import { usePrefs } from "../../stores/prefs";
import { useDesk } from "../../stores/desk";
import { useWins } from "../../stores/windows";
import { useUi } from "../../stores/ui";
import { openCtx, closeCtx, ctxState, isCtxOwner } from "./ctx";
import { appById, MODK } from "../../lib/apps";

const MENU_DEFS = [
  { id: "file", label: "文件" },
  { id: "go", label: "前往" },
  { id: "view", label: "显示" },
  { id: "win", label: "窗口" },
  { id: "help", label: "帮助" },
];

const prefs = usePrefs();
const desk = useDesk();
const wins = useWins();
const ui = useUi();

const clockText = ref("");
let timer = 0;

const resolved = computed(() => prefs.resolved);
const frontApp = computed(() => (wins.frontWin ? appById[wins.frontWin.appId] : null));
const dbClass = computed(() => ({ "s-ok": desk.dbOk === true, "s-bad": desk.dbOk === false }));
const dbText = computed(() => {
  if (desk.dbOk === false) return "进度库未启动";
  if (desk.dbOk !== true) return "进度库检测中";
  const a = desk.progress.javaguide, b = desk.progress.jbl;
  return `已读 ${a ? a.done + "/" + a.total : "?"} · 掌握 ${b ? b.done + "/" + b.total : "?"}`;
});

function tick() {
  const d = new Date();
  const wk = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  clockText.value = `${d.getMonth() + 1}月${d.getDate()}日 ${wk} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const isOpen = (owner) => isCtxOwner(owner);

function menuFor(id) {
  const w = wins.frontWin;
  const t = wins.frontTab;
  const chs = (appId) => {
    const a = appById[appId];
    const toc = a && desk.toc(a.toc);
    return (toc && toc.chapters) || [];
  };
  const chapterOfCur = () => {
    if (!t) return null;
    const routes = desk.catalog && !desk.catalog.__fail && desk.catalog.javaguide && desk.catalog.javaguide.routes;
    const u = (() => { try { return new URL(t.url, location.origin); } catch { return null; } })();
    if (!u) return null;
    return u.searchParams.get("c") || (routes && routes[u.pathname]) || null;
  };

  if (id === "sys") {
    return [
      { label: "关于本机", fn: () => run("about") },
      { label: "显示偏好…", kbd: MODK + ",", fn: () => run("prefs") },
      { sep: 1 },
      { title: "打开应用" },
      ...Object.values(appById).map((a, i) => ({
        label: a.name, checked: !!wins.wins[a.id], kbd: MODK + (i + 1), fn: () => run("open:" + a.id),
      })),
      { label: "启动台", kbd: MODK + "⇧A", fn: () => run("launchpad") },
      { label: "全局搜索…", kbd: MODK + "K", fn: () => run("palette") },
      { sep: 1 },
      { label: "关闭全部窗口", danger: 1, disabled: !Object.keys(wins.wins).length, fn: () => run("closeall") },
      { label: "重新载入桌面", fn: () => run("reload-desk") },
      { sep: 1 },
      { label: "操作指南（没有右键怎么用）", fn: () => run("guide") },
      { label: "键盘快捷键", kbd: "?", fn: () => run("shortcuts") },
    ];
  }
  if (id === "app") {
    if (!w) {
      return [
        { label: "关于本机", fn: () => run("about") },
        { sep: 1 },
        ...Object.values(appById).map((a) => ({ label: "打开应用：" + a.name, fn: () => run("open:" + a.id) })),
      ];
    }
    return [
      { label: `关于 ${appById[w.appId].name}`, fn: () => run("about") },
      { label: "重新载入", kbd: MODK + "R", fn: () => run("reload") },
      { sep: 1 },
      { label: "新建标签页", kbd: MODK + "T", fn: () => run("tab-new") },
      { label: "关闭窗口", kbd: MODK + "⇧W", danger: 1, fn: () => run("win-close") },
      { sep: 1 },
      { label: "在浏览器新标签页打开", disabled: !t, fn: () => t && window.open(t.url, "_blank", "noopener") },
      { label: "隐藏全部窗口", kbd: MODK + "⇧M", disabled: !Object.keys(wins.wins).length, fn: () => run("hide-all") },
    ];
  }
  if (id === "file") {
    return [
      { label: "新建标签页", kbd: MODK + "T", disabled: !w, fn: () => run("tab-new") },
      { label: "关闭标签页", kbd: MODK + "W", disabled: !w, fn: () => run("tab-close") },
      { sep: 1 },
      { label: "全局搜索…", kbd: MODK + "K", fn: () => run("palette") },
      { label: "最近打开", fn: () => ui.openPalette("recent") },
      { sep: 1 },
      { label: "重新载入这一页", kbd: MODK + "R", disabled: !w, fn: () => run("reload") },
      { label: "关闭窗口", kbd: MODK + "⇧W", danger: 1, disabled: !w, fn: () => run("win-close") },
      { label: "在浏览器新标签页打开", disabled: !t, fn: () => t && window.open(t.url, "_blank", "noopener") },
    ];
  }
  if (id === "go") {
    const items = [
      { label: "后退", kbd: MODK + "[", disabled: !(t && t.hi > 0), fn: () => run("back") },
      { label: "前进", kbd: MODK + "]", disabled: !(t && t.hi < t.hist.length - 1), fn: () => run("forward") },
      { sep: 1 },
      { label: "回到应用首页", disabled: !w, fn: () => w && wins.go(w.id, appById[w.appId].src) },
      { sep: 1 },
      { title: "最近打开" },
    ];
    if (!desk.recent.length) items.push({ label: "（还没有记录）", disabled: true });
    else desk.recent.slice(0, 8).forEach((r) => items.push({ label: r.title || r.url, fn: () => wins.openRecent(r) }));
    if (w) {
      items.push({ sep: 1 }, { title: appById[w.appId].name + " 的目录" });
      const list = chs(w.appId);
      if (!list.length) items.push({ label: "（目录未就绪）", disabled: true });
      list.forEach((c) => items.push({
        label: c.name, checked: chapterOfCur() === c.code, fn: () => wins.go(w.id, c.href),
      }));
    }
    return items;
  }
  if (id === "view") {
    return [
      { label: "显示侧边栏", checked: !!(w && !w.noSide), disabled: !w, kbd: MODK + "B", fn: () => run("side-toggle") },
      { sep: 1 },
      { label: "跟随系统外观", checked: prefs.theme === "auto", fn: () => prefs.setTheme("auto") },
      { label: "浅色", checked: prefs.theme === "light", fn: () => prefs.setTheme("light") },
      { label: "深色", checked: prefs.theme === "dark", fn: () => prefs.setTheme("dark") },
      { sep: 1 },
      { label: "降低透明度", checked: prefs.opaque === 1, fn: () => run("opaque") },
      { sep: 1 },
      { label: "窗口居左半屏", disabled: !w, kbd: MODK + "⇧←", fn: () => run("tile:left") },
      { label: "窗口居右半屏", disabled: !w, kbd: MODK + "⇧→", fn: () => run("tile:right") },
      { label: "两窗并列", disabled: Object.keys(wins.wins).length !== 2, fn: () => run("tile:all") },
      { label: w && (w.max || w.tile) ? "恢复窗口大小" : "缩放窗口", disabled: !w, fn: () => run("win-max") },
    ];
  }
  if (id === "win") {
    const out = [
      { label: "最小化", disabled: !w, kbd: MODK + "M", fn: () => run("win-min") },
      { label: "缩放窗口", disabled: !w, fn: () => run("win-max") },
      { label: "隐藏全部窗口", disabled: !Object.keys(wins.wins).length, fn: () => run("hide-all") },
      { label: "前置全部窗口", disabled: !Object.keys(wins.wins).length, fn: () => run("show-all") },
      { label: "切换到下一个窗口", kbd: MODK + " `", fn: () => run("cycle-win") },
      { sep: 1 },
      { title: "打开的窗口" },
    ];
    const list = wins.order.slice().reverse();
    if (!list.length) out.push({ label: "（没有打开的窗口）", disabled: true });
    list.forEach((id2) => {
      const w2 = wins.wins[id2];
      const t2 = w2.tabs[w2.i];
      out.push({
        label: (t2 ? (t2.title || t2.url) : appById[w2.appId].name) + " — " + appById[w2.appId].name,
        checked: id2 === wins.front,
        fn: () => { if (w2.min) wins.setMin(id2, false); wins.focusWin(id2); },
      });
    });
    return out;
  }
  if (id === "help") {
    return [
      { label: "操作指南：没有右键怎么用", fn: () => run("guide") },
      { label: "键盘快捷键", kbd: "?", fn: () => run("shortcuts") },
      { label: "怎样调整侧边栏", fn: () => ui.openSheet("guide", { which: "side" }) },
      { sep: 1 },
      { label: "关于本机", fn: () => run("about") },
    ];
  }
  return [];
}

function run(act) { wins.run(act); }

function toggle(id, ev) {
  if (isOpen("bar:" + id)) { closeCtx(); return; }
  openCtx({ items: menuFor(id), anchor: ev.currentTarget, owner: "bar:" + id });
}
/* 菜单开着时掠过相邻菜单即切换 —— macOS 的菜单跟踪手感 */
function hot(id, ev) {
  if (id === null) return;
  if (ctxState.open && typeof ctxState.owner === "string" && ctxState.owner.startsWith("bar:") && ctxState.owner !== "bar:" + id) {
    openCtx({ items: menuFor(id), anchor: ev.currentTarget, owner: "bar:" + id });
  }
}
function onDbClick() {
  desk.probeDb();
  ui.showToast(desk.dbOk
    ? "划线与掌握进度存于本机 MySQL，实时同步"
    : "MySQL 未启动：进度暂时记不到库，但阅读与搜索不受影响");
}

onMounted(() => {
  tick();
  timer = setInterval(tick, 5000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>
