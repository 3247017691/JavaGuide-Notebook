<template>
  <section
    ref="el"
    class="win"
    :class="{ active: wins.front === win.id, min: win.min, max: win.max, tile: win.tile, 'no-side': win.noSide, 'one-tab': win.tabs.length < 2, opening: opening, closing: win.closing }"
    :style="{ left: win.rect.x + 'px', top: win.rect.y + 'px', width: win.rect.w + 'px', height: win.rect.h + 'px', zIndex: win.z, '--acc': app.accent }"
    :aria-label="app.name + ' 窗口'"
    @pointerdown="wins.focusWin(win.id)"
  >
    <!-- 标题栏 -->
    <header class="win-bar" @dblclick="onBarDblClick" @contextmenu.prevent="barMenu($event)">
      <div class="lights">
        <button class="light cl" type="button" aria-label="关闭窗口" title="关闭" @click="wins.closeWin(win.id)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6.6 6.6 10.8 10.8M17.4 6.6 6.6 17.4"/></svg>
        </button>
        <button class="light mi" type="button" aria-label="最小化窗口" title="最小化" @click="wins.setMin(win.id, true)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg>
        </button>
        <button class="light ma" type="button" aria-label="缩放窗口" title="缩放" @click="wins.toggleMax(win.id)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8.4 15.6 4 20M4 20v-4.4M4 20h4.4M15.6 8.4 20 4M20 4v4.4M20 4h-4.4"/></svg>
        </button>
      </div>
      <div class="tb-group">
        <button class="tb-btn" type="button" :aria-pressed="String(!win.noSide)" aria-label="显示或隐藏侧边栏"
                :title="'侧边栏（' + MOD + ' B）'" @click="wins.toggleSide(win.id)" v-html="gl('sidebar')" />
        <span class="tb-sep" />
        <button class="tb-btn" type="button" aria-label="后退" :title="'后退（' + MOD + ' [）'"
                :disabled="!canBack" @click="wins.tabBack(win.id)" v-html="gl('arrow-left')" />
        <button class="tb-btn" type="button" aria-label="前进" :title="'前进（' + MOD + ' ]）'"
                :disabled="!canForward" @click="wins.tabForward(win.id)" v-html="gl('arrow-right')" />
      </div>
      <div class="tb-title" :title="tab ? (tab.title || '') : ''">
        <span class="tb-ico" v-html="icons[app.icon]()" />
        <span class="t">{{ tab ? (tab.title || app.name) : app.name }}</span>
        <span class="s">{{ app.name }}</span>
      </div>
      <div class="tb-group">
        <button class="tb-search" type="button" :aria-label="'在' + app.name + '中搜索'" @click="ui.openPalette(app.id)">
          <span v-html="gl('search')" /><span>搜索</span><kbd>{{ MODK }}K</kbd>
        </button>
        <button class="tb-btn" type="button" aria-label="更多操作" title="更多操作" data-ctx-anchor
                @click.stop="barMenu($event)" v-html="gl('ellipsis')" />
      </div>
    </header>

    <!-- 主体：侧栏 + 内容 -->
    <div class="win-main">
      <aside class="win-side" :style="{ width: win.sideW + 'px' }">
        <div class="side-scroll desk-scroll" role="navigation" aria-label="内容模块">
          <template v-for="(it, i) in sideItems" :key="i">
            <div v-if="it.title" class="side-group-t">{{ it.title }}</div>
            <button v-else class="side-row" type="button" :disabled="it.disabled" :class="{ on: it.on }"
                    :style="it.color ? { '--acc': it.color } : null" :title="it.hint || it.label"
                    @click="!it.disabled && wins.go(win.id, it.href)"
                    @contextmenu.prevent="sideRowMenu(it, $event)">
              <span class="sr-g" v-html="gl(it.glyph || 'list')" />
              <span class="sr-t">{{ it.label }}</span>
              <span v-if="it.count" class="sr-n">{{ it.count }}</span>
            </button>
          </template>
          <template v-if="!desk.catalog">
            <div class="side-group-t">载入中</div>
            <div v-for="n in 7" :key="n" class="side-row" disabled style="opacity:.4">{{ "" }}</div>
          </template>
        </div>
        <div class="side-foot">
          <template v-if="progress">
            <div class="sf-line">
              <span>{{ app.id === "jbl" ? "已掌握" : "已划线" }} <b class="num">{{ progress.done }}</b> /
                <span class="num">{{ total }}</span></span>
              <span class="num" style="margin-left: auto">{{ Math.round(pct * 100) }}%</span>
            </div>
            <div class="side-bar"><i :style="{ transform: 'scaleX(' + pct.toFixed(4) + ')' }" /></div>
          </template>
          <div v-else class="sf-line">{{ total ? total + " 项 · 进度库未连接" : "进度库未连接" }}</div>
        </div>
        <div class="side-resize" role="separator" aria-orientation="vertical" aria-label="拖拽调整侧边栏宽度"
             tabindex="0" @pointerdown="sideResizeDown" @dblclick="resetSideW"
             @keydown="onSideKey" />
      </aside>

      <div class="win-content">
        <div class="tabbar" role="tablist" aria-label="标签页">
          <div v-for="t in win.tabs" :key="t.id" class="tab" :class="{ on: win.tabs[win.i] === t, dragging: dragTab === t }"
               role="tab" :aria-selected="String(win.tabs[win.i] === t)" draggable="true"
               @click="onTabClick(t, $event)" @auxclick.middle.prevent="wins.tabClose(win.id, t.id)"
               @keydown.delete.prevent="wins.tabClose(win.id, t.id)"
               @keydown="onTabKey(t, $event)"
               @dragstart="dragStart(t, $event)" @dragover="dragOver(t, $event)"
               @dragleave="dragLeave(t, $event)" @drop="drop(t, $event)" @dragend="dragEnd"
               @contextmenu.prevent="tabMenu(t, $event)">
            <span class="tab-t">{{ shortTitle(t) }}</span>
            <span class="tab-x" role="button" aria-label="关闭标签页" @click.stop="wins.tabClose(win.id, t.id)" v-html="gl('xmark', 2)" />
          </div>
          <button class="tab-new" type="button" aria-label="新建标签页" :title="'新建标签页（' + MOD + ' T）'"
                  @click="wins.tabNew(win.id)" v-html="gl('plus', 2)" />
          <span class="tabbar-end" />
        </div>
        <div class="frames" @contextmenu.prevent="frameMenu($event)">
          <div v-for="t in win.tabs" :key="t.id" class="frame" :class="{ on: win.tabs[win.i] === t }" role="tabpanel">
            <NotebookWindow v-if="app.native" :win="win" :tab="t" />
            <JblFrame v-else :win="win" :tab="t" />
            <div v-if="t.loading && !app.native" class="frame-load">
              <i class="spin" /><span>正在打开 {{ app.name }}…</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 缩放把手 -->
    <i v-for="d in DIRS" :key="d" class="rz" :class="'rz-' + d" @pointerdown="resizeDown(d, $event)" />
  </section>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from "vue";
import { gl, APP_ICONS } from "../../lib/icons";
import { appById, MOD, MODK } from "../../lib/apps";
import { chapterOf, shortTitle as st } from "../../lib/nburl";
import { useWins, SIDE_DEF } from "../../stores/windows";
import { useDesk } from "../../stores/desk";
import { useUi } from "../../stores/ui";
import { openCtx } from "./ctx";
import NotebookWindow from "../notebook/NotebookWindow.vue";
import JblFrame from "./JblFrame.vue";

const DIRS = ["n", "s", "w", "e", "nw", "ne", "sw", "se"];

const props = defineProps({ win: { type: Object, required: true } });
const wins = useWins();
const desk = useDesk();
const ui = useUi();
const app = computed(() => appById[props.win.appId]);
const icons = APP_ICONS;
const opening = ref(true);
setTimeout(() => { opening.value = false; }, 400);

const tab = computed(() => props.win.tabs[props.win.i]);
const canBack = computed(() => !!(tab.value && tab.value.hi > 0));
const canForward = computed(() => !!(tab.value && tab.value.hi < tab.value.hist.length - 1));
const progress = computed(() => desk.progress[props.win.appId]);
const total = computed(() => {
  const toc = desk.toc(props.win.appId);
  return (toc && toc.total) || (progress.value && progress.value.total) || 0;
});
const pct = computed(() => (total.value ? Math.min(progress.value.done / total.value, 1) : 0));
const shortTitle = st;

/* ---------------- 侧栏数据 ---------------- */
const sideItems = computed(() => {
  const out = [];
  const curHref = tab.value ? tab.value.url : "";
  const code = curHref ? chapterOf(curHref, desk.catalog && !desk.catalog.__fail && desk.catalog.javaguide && desk.catalog.javaguide.routes) : null;
  (app.value.modules || []).forEach((g) => {
    out.push({ title: g.title });
    (g.items || []).forEach((it) => {
      const on = curHref === it.href || (it.href === "/index.html" && (curHref === "/" || curHref === "/index.html"));
      out.push({ label: it.label, glyph: it.glyph, href: it.href, hint: it.hint, on });
    });
  });
  if (desk.catalog && desk.catalog.__fail) {
    out.push({ title: "目录" }, { label: "目录加载失败：服务未启动？", disabled: true });
    return out;
  }
  const toc = desk.toc(props.win.appId);
  if (toc && toc.chapters && toc.chapters.length) {
    out.push({ title: props.win.appId === "jbl" ? "检查系统" : "章节" });
    toc.chapters.forEach((c) => {
      out.push({
        label: c.name,
        glyph: (app.value.chapterIcons && app.value.chapterIcons[c.code]) || "list",
        color: app.value.chapterColors && app.value.chapterColors[c.code],
        href: c.href, count: c.count,
        on: !!code && c.code === code,
      });
    });
  } else if (!desk.catalog) {
    out.push({ title: props.win.appId === "jbl" ? "检查系统" : "章节" }, { label: "载入中…", disabled: true });
  }
  return out;
});

/* ---------------- 菜单 ---------------- */
function winMenuItems() {
  const w = props.win;
  const t = w.tabs[w.i];
  return [
    { title: app.value.name },
    { label: "新建标签页", glyph: "plus", kbd: MODK + "T", fn: () => wins.tabNew(w.id) },
    { label: "重新载入这一页", glyph: "reload", kbd: MODK + "R", fn: () => wins.tabReload(w.id) },
    { label: "后退", glyph: "arrow-left", disabled: !(t && t.hi > 0), fn: () => wins.tabBack(w.id) },
    { label: "前进", glyph: "arrow-right", disabled: !(t && t.hi < t.hist.length - 1), fn: () => wins.tabForward(w.id) },
    { sep: 1 },
    { label: (w.noSide ? "显示" : "隐藏") + "侧边栏", glyph: "sidebar", kbd: MODK + "B", fn: () => wins.toggleSide(w.id) },
    { label: "在浏览器新标签页打开", glyph: "external", disabled: !t, fn: () => t && window.open(t.url, "_blank", "noopener") },
    { label: "复制当前地址", glyph: "list", disabled: !t, fn: () => copyText(t ? new URL(t.url, location.origin).href : "") },
    { sep: 1 },
    { label: "窗口居左半屏", glyph: "tile-left", kbd: MODK + "⇧←", fn: () => wins.tile(w.id, "left") },
    { label: "窗口居右半屏", glyph: "tile-right", kbd: MODK + "⇧→", fn: () => wins.tile(w.id, "right") },
    { label: "两窗并列", glyph: "tile-all", disabled: Object.keys(wins.wins).length !== 2, fn: () => wins.tileAll() },
    { label: (w.max || w.tile) ? "恢复窗口大小" : "缩放窗口", glyph: "expand", fn: () => (w.max || w.tile) ? wins.unmax(w.id) : wins.toggleMax(w.id) },
    { sep: 1 },
    { label: "最小化", glyph: "minus", kbd: MODK + "M", fn: () => wins.setMin(w.id, true) },
    { label: "关闭窗口", glyph: "trash", danger: 1, kbd: MODK + "⇧W", fn: () => wins.closeWin(w.id) },
  ];
}
function frameMenuItems() {
  const w = props.win;
  const t = w.tabs[w.i];
  const items = [];
  if (t) {
    items.push({ title: st(t) });
    if (app.value.bulk) items.push({ label: "把这一章整章标记已读", glyph: "checkmark", fn: () => wins.bulkChapter() });
    items.push({ label: "关闭标签页", glyph: "xmark", danger: 1, disabled: w.tabs.length < 2, fn: () => wins.tabClose(w.id, t.id) });
    items.push({ sep: 1 });
  }
  return items.concat(winMenuItems());
}
function tabMenuItems(t) {
  const w = props.win;
  return [
    { title: st(t) },
    { label: "切换到该标签页", glyph: "checkmark", disabled: w.tabs[w.i] === t, fn: () => wins.showTab(w.id, t.id) },
    { label: "复制为新标签页", glyph: "plus", fn: () => wins.tabNew(w.id, t.url) },
    { label: "重新载入", glyph: "reload", fn: () => { wins.showTab(w.id, t.id); wins.tabReload(w.id); } },
    { sep: 1 },
    { label: "关闭标签页", glyph: "xmark", danger: 1, disabled: w.tabs.length < 2, fn: () => wins.tabClose(w.id, t.id) },
    { label: "关闭其他标签页", glyph: "trash", danger: 1, disabled: w.tabs.length < 2, fn: () => wins.closeOthers(w.id, t.id) },
    { sep: 1 },
    { label: "复制地址", glyph: "list", fn: () => copyText(new URL(t.url, location.origin).href) },
    { label: "在浏览器新标签页打开", glyph: "external", fn: () => window.open(t.url, "_blank", "noopener") },
  ];
}
function barMenu(ev) {
  openCtx({ items: winMenuItems(), x: ev.clientX, y: ev.clientY, anchor: ev.currentTarget.closest("button") || null });
}
function frameMenu(ev) { openCtx({ items: frameMenuItems(), x: ev.clientX, y: ev.clientY }); }
function tabMenu(t, ev) { openCtx({ items: tabMenuItems(t), x: ev.clientX, y: ev.clientY }); }
function sideRowMenu(it, ev) {
  openCtx({
    items: [
      { title: it.label },
      { label: "在当前标签页打开", glyph: "checkmark", fn: () => wins.go(props.win.id, it.href) },
      { label: "在新标签页打开", glyph: "plus", fn: () => wins.tabNew(props.win.id, it.href) },
      { label: "在浏览器新标签页打开", glyph: "external", fn: () => window.open(it.href, "_blank", "noopener") },
    ],
    x: ev.clientX, y: ev.clientY,
  });
}
function copyText(s) {
  if (!s) return;
  const ok = () => ui.showToast("已复制：" + (s.length > 32 ? s.slice(0, 31) + "…" : s));
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(ok, () => {});
  else ok();
}

/* ---------------- 拖拽 / 缩放 ---------------- */
function onBarDblClick(ev) {
  if (ev.target.closest(".light, .tb-btn, .tb-search")) return;
  wins.toggleMax(props.win.id);
}
function dragDown(ev) {
  if (ev.button !== 0 || ev.target.closest(".light, .tb-btn, .tb-search")) return;
  const w = props.win;
  const S = wins.stage();
  const sx = ev.clientX, sy = ev.clientY;
  let ox = w.rect.x, oy = w.rect.y, moved = false;
  el.value.setPointerCapture(ev.pointerId);
  el.value.classList.add("dragging");
  const move = (e) => {
    if (!moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 4) return;
    moved = true;
    if (w.max || w.tile) {
      const ww = w.rect.w, hh = Math.max(w.rect.h - 40, 320);
      wins.unmax(w.id);
      const stageEl = el.value.parentElement.getBoundingClientRect();
      w.rect = { x: e.clientX - stageEl.left - ww / 2, y: Math.max(oy, 0), w: ww, h: hh };
      ox = w.rect.x; oy = w.rect.y;
    }
    w.rect.x = Math.max(ox + e.clientX - sx, -w.rect.w + 90);
    w.rect.x = Math.min(w.rect.x, S.w - 90);
    w.rect.y = Math.max(Math.min(oy + e.clientY - sy, S.h - 34), 0);
  };
  const up = () => {
    el.value.classList.remove("dragging");
    el.value.removeEventListener("pointermove", move);
    el.value.removeEventListener("pointerup", up);
    if (moved) wins.saveSession();
  };
  el.value.addEventListener("pointermove", move);
  el.value.addEventListener("pointerup", up);
}
function resizeDown(dir, ev) {
  if (ev.button !== 0 || props.win.max || props.win.tile) return;
  ev.preventDefault();
  ev.stopPropagation();
  const w = props.win;
  const S = wins.stage();
  const MIN_W = app.value.minW || 480, MIN_H = app.value.minH || 300;
  const p = { x: ev.clientX, y: ev.clientY, r: { ...w.rect } };
  const target = ev.currentTarget;
  target.setPointerCapture(ev.pointerId);
  el.value.classList.add("resizing");
  wins.focusWin(w.id);
  const clampn = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const move = (e) => {
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    const r = { ...p.r };
    if (dir.includes("e")) r.w = clampn(p.r.w + dx, MIN_W, S.w - r.x);
    if (dir.includes("s")) r.h = clampn(p.r.h + dy, MIN_H, S.h - r.y);
    if (dir.includes("w")) { const nw = clampn(p.r.w - dx, MIN_W, p.r.x + p.r.w); r.x = p.r.x + p.r.w - nw; r.w = nw; }
    if (dir.includes("n")) { const nh = clampn(p.r.h - dy, MIN_H, p.r.y + p.r.h); r.y = p.r.y + p.r.h - nh; r.h = nh; }
    w.rect = r;
  };
  const up = () => {
    el.value.classList.remove("resizing");
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", up);
    wins.saveSession();
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up);
}

/* ---------------- 侧栏拖宽 ---------------- */
function sideResizeDown(ev) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  ev.stopPropagation();
  const w = props.win;
  const x0 = ev.clientX;
  const base = w.sideW;
  const target = ev.currentTarget;
  target.setPointerCapture(ev.pointerId);
  target.classList.add("on");
  el.value.classList.add("drag-side");
  wins.focusWin(w.id);
  const move = (e) => wins.setSideW(w.id, base + e.clientX - x0);
  const up = () => {
    target.classList.remove("on");
    el.value.classList.remove("drag-side");
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", up);
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up);
}
function resetSideW() {
  wins.setSideW(props.win.id, SIDE_DEF);
  ui.showToast("侧边栏宽度已复位到 " + SIDE_DEF + " px");
}
function onSideKey(ev) {
  const d = ev.key === "ArrowLeft" ? -12 : (ev.key === "ArrowRight" ? 12 : 0);
  if (!d) return;
  ev.preventDefault();
  wins.setSideW(props.win.id, props.win.sideW + d);
}

/* ---------------- 标签：点击 / 键盘 / 拖拽排序 ---------------- */
function onTabClick(t, ev) {
  if (ev.target.closest(".tab-x")) return;
  wins.showTab(props.win.id, t.id);
}
function onTabKey(t, ev) {
  if (ev.key === "ArrowLeft" && ev.ctrlKey) {
    ev.preventDefault();
    cycle(t, -1);
  } else if (ev.key === "ArrowRight" && ev.ctrlKey) {
    ev.preventDefault();
    cycle(t, 1);
  }
}
function cycle(t, dir) {
  const w = props.win;
  const k = w.tabs.findIndex((x) => x.id === t.id);
  const next = w.tabs[(k + dir + w.tabs.length) % w.tabs.length];
  wins.showTab(w.id, next.id);
}

let dragTabRef = null;
function dragStart(t, ev) {
  dragTabRef = t;
  ev.dataTransfer.setData("text/plain", props.win.id + ":" + t.id);
  ev.dataTransfer.effectAllowed = "move";
}
function dragOver(t, ev) {
  if (!dragTabRef || dragTabRef === t) return;
  ev.preventDefault();
  ev.dataTransfer.dropEffect = "move";
  const r = ev.currentTarget.getBoundingClientRect();
  const before = ev.clientX - r.left < r.width / 2;
  ev.currentTarget.classList.toggle("drop-before", before);
  ev.currentTarget.classList.toggle("drop-after", !before);
}
function dragLeave(t, ev) {
  ev.currentTarget.classList.remove("drop-before", "drop-after");
}
function drop(t, ev) {
  ev.preventDefault();
  ev.stopPropagation();
  ev.currentTarget.classList.remove("drop-before", "drop-after");
  const w = props.win;
  if (!dragTabRef || dragTabRef === t) return;
  const r = ev.currentTarget.getBoundingClientRect();
  const after = ev.clientX ? ev.clientX - r.left >= r.width / 2 : false;
  const src = w.tabs.indexOf(dragTabRef);
  let dst = w.tabs.indexOf(t) + (after ? 1 : 0);
  if (src < 0) return;
  const moved = w.tabs.splice(src, 1)[0];
  if (dst > src) dst--;
  w.tabs.splice(Math.max(0, Math.min(dst, w.tabs.length)), 0, moved);
  w.i = w.tabs.indexOf(moved);
  dragTabRef = null;
  wins.saveSession();
}
function dragEnd() { dragTabRef = null; }

onMounted(() => {
  // 标题栏拖拽挂在 bar 上（放这里以拿到 lights/按钮排除逻辑）
  const bar = el.value.querySelector(".win-bar");
  bar.addEventListener("pointerdown", dragDown);
});
const el = ref(null);
</script>
