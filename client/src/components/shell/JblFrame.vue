<template>
  <iframe
    :key="tab.rt"
    ref="frameEl"
    :src="tab.url"
    :title="app.name"
    allow="fullscreen; clipboard-write"
    @load="onLoad"
  />
</template>

<script setup>
/* JBL 题库宿主（保留 iframe）：载入后同步 URL/历史/标题，并把外壳主题下发进子文档
   （优先调子应用自己的 DESK_applyMode，退化为 localStorage + data-mode，与原壳一致）。 */
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { appById } from "../../lib/apps";
import { useWins } from "../../stores/windows";
import { usePrefs } from "../../stores/prefs";

const props = defineProps({
  win: { type: Object, required: true },
  tab: { type: Object, required: true },
});
const wins = useWins();
const prefs = usePrefs();
const app = computed(() => appById[props.win.appId]);
const frameEl = ref(null);

function onLoad() {
  const frame = frameEl.value;
  let url = props.tab.url;
  let title = "";
  if (frame) {
    props.tab.frameWindow = frame.contentWindow;
    try {
      const w = frame.contentWindow;
      url = w.location.pathname + w.location.search;
      title = (w.document.title || "").trim();
    } catch { /* 跨域保持原样 */ }
  }
  wins.frameSync(props.win.id, props.tab.id, url, title || props.tab.url);
  wins.tabLoaded(props.win.id, props.tab.id);
  pushTheme(true);
}
function pushTheme(force) {
  const w = props.tab.frameWindow;
  if (!w) return;
  try {
    const persist = prefs.theme !== "auto";
    if (typeof w.DESK_applyMode === "function") { w.DESK_applyMode(prefs.nbMode, persist); return; }
    if (persist || force) {
      try { w.localStorage.setItem("jbl-rocket:mode", prefs.nbMode); } catch { /* 忽略 */ }
      w.document.documentElement.dataset.mode = prefs.nbMode;
    }
  } catch { /* 忽略 */ }
}
watch(() => prefs.nbMode, (m) => {
  if (props.win.tabs[props.win.i] === props.tab) pushTheme(true);
});
onBeforeUnmount(() => { delete props.tab.frameWindow; });
</script>
