<template>
  <footer class="dock-wrap">
    <nav class="dock glass-thin" ref="dockEl" aria-label="程序坞" @pointermove="onMove" @pointerleave="onLeave">
      <div v-for="a in items" :key="a.id" class="dock-item" :data-app="a.id"
           :class="{ running: a.id !== 'launchpad' && running.has(a.id), bounce: bounceId === a.id }"
           :style="{ width: sizes[a.id] + 'px', height: sizes[a.id] + 'px' }">
        <span class="d-tip">{{ a.name }}</span>
        <button class="dock-btn" type="button" :aria-label="'打开或聚焦 ' + a.name"
                @click="click(a)" @contextmenu.prevent="menu(a, $event)" v-html="icons[a.icon]()" />
        <i class="run-dot" aria-hidden="true" />
      </div>
      <div class="dock-sep" :style="{ visibility: minimized.length ? 'visible' : 'hidden' }" />
      <button v-for="id in minimized" :key="id" type="button" class="dock-mini glass-thin"
              :aria-label="'恢复窗口：' + appById[id].name" @click="restore(id)">
        <span class="dm-g" v-html="icons[appById[id].icon]()" />
        <span class="dm-t">{{ miniTitle(id) }}</span>
      </button>
    </nav>
  </footer>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from "vue";
import { APP_ICONS } from "../../lib/icons";
import { APPS, appById } from "../../lib/apps";
import { useWins } from "../../stores/windows";
import { useUi } from "../../stores/ui";
import { openCtx } from "./ctx";

const BASE = 48, MAX = 1.5, SPAN = 46;

const wins = useWins();
const icons = APP_ICONS;
const dockEl = ref(null);
const bounceId = ref("");

const items = computed(() => [{ id: "launchpad", name: "启动台", icon: "launchpad", glyph: "launchpad" }, ...APPS]);
const running = computed(() => {
  const s = new Set(wins.running);
  return s;
});
const minimized = computed(() => wins.minimized);

const sizes = reactive({});
APPS.forEach((a) => { sizes[a.id] = BASE; });

/* 指针放大：以指针为高斯中心逐帧插值（移植原实现） */
let px = null, raf = 0;
const cur = {};
function onMove(ev) {
  px = ev.clientX;
  if (!raf) raf = requestAnimationFrame(step);
}
function onLeave() {
  px = null;
  if (!raf) raf = requestAnimationFrame(step);
}
function step() {
  raf = 0;
  let done = true;
  APPS.forEach((a) => {
    const el = dockEl.value?.querySelector(`.dock-item[data-app="${a.id}"]`);
    const r = el ? el.getBoundingClientRect() : { left: 0, width: BASE };
    const c = r.left + r.width / 2;
    let target = BASE;
    if (px !== null) {
      const dx = px - c;
      target = BASE * (1 + (MAX - 1) * Math.exp(-(dx * dx) / (2 * SPAN * SPAN)));
    }
    let v = cur[a.id] == null ? BASE : cur[a.id];
    v += (target - v) * 0.32;
    if (Math.abs(target - v) > 0.4) done = false; else v = target;
    cur[a.id] = v;
    sizes[a.id] = v;
  });
  if (!done) raf = requestAnimationFrame(step);
}

function click(a) {
  if (a.id === "launchpad") useUi().openLaunchpad();
  else wins.dockClick(a.id);
}

function restore(id) {
  wins.setMin(id, false);
  wins.focusWin(id);
}
function miniTitle(id) {
  const w = wins.wins[id];
  const t = w && w.tabs[w.i];
  const s = (t && (t.title || t.url)) || appById[id].name;
  return s.length > 22 ? s.slice(0, 21) + "…" : s;
}

function menu(a, ev) {
  const w = wins.wins[a.id];
  const out = [{ title: a.name }];
  if (a.id === "launchpad") {
    out.push({ label: "打开启动台", fn: () => useUiOpen() });
  } else if (w) {
    out.push({ label: "聚焦窗口", fn: () => { if (w.min) wins.setMin(a.id, false); wins.focusWin(a.id); } });
    (w.tabs.length > 1 ? w.tabs.slice(0, 8) : []).forEach((t) => {
      out.push({ label: t.title || t.url, fn: () => { wins.showTab(a.id, t.id); wins.focusWin(a.id); } });
    });
    out.push({ sep: 1 },
      { label: "关闭标签页", disabled: w.tabs.length < 2, fn: () => wins.tabClose(a.id) },
      { label: "关闭窗口", danger: 1, fn: () => wins.closeWin(a.id) });
  } else {
    out.push({ label: "打开", fn: () => wins.openApp(a.id) });
  }
  if (a.id !== "launchpad") {
    out.push({ sep: 1 },
      { label: "在浏览器新标签页打开", fn: () => window.open(a.src, "_blank", "noopener") });
  }
  openCtx({ items: out, x: ev.clientX, y: ev.clientY });
}
function useUiOpen() {
  useUi().openLaunchpad();
}

function onBounce(ev) {
  if (ev.detail === "launchpad") return;
  bounceId.value = "";
  requestAnimationFrame(() => { bounceId.value = ev.detail; });
  setTimeout(() => { bounceId.value = ""; }, 750);
}

onMounted(() => {
  document.addEventListener("dock-bounce", onBounce);
});
onBeforeUnmount(() => {
  document.removeEventListener("dock-bounce", onBounce);
  if (raf) cancelAnimationFrame(raf);
});
</script>
