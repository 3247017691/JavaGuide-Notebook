<template>
  <div class="desk-icons" aria-label="桌面图标">
    <button v-for="a in APPS" :key="a.id" type="button" class="desk-icon"
            :class="{ sel: sel === a.id }" :aria-label="'双击或按回车打开 ' + a.name"
            @click="sel = a.id" @dblclick="wins.openApp(a.id)"
            @keydown.enter.prevent="wins.openApp(a.id)"
            @keydown.space.prevent="wins.openApp(a.id)"
            @contextmenu.prevent="menu(a, $event)">
      <span class="di-img" v-html="icons[a.icon]()" />
      <span class="di-name">{{ a.name }}</span>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { APP_ICONS } from "../../lib/icons";
import { APPS, appById } from "../../lib/apps";
import { useWins } from "../../stores/windows";
import { openCtx } from "./ctx";

const icons = APP_ICONS;
const wins = useWins();
const sel = ref("");

function menu(a, ev) {
  const w = wins.wins[a.id];
  const out = [{ title: a.name }];
  if (w) {
    out.push({ label: "聚焦窗口", fn: () => { if (w.min) wins.setMin(a.id, false); wins.focusWin(a.id); } });
  } else {
    out.push({ label: "打开", fn: () => wins.openApp(a.id) });
  }
  out.push({ sep: 1 },
    { label: "在浏览器新标签页打开", fn: () => window.open(a.src, "_blank", "noopener") });
  openCtx({ items: out, x: ev.clientX, y: ev.clientY });
}
function clearSel(ev) {
  if (ev.target.closest(".win, .desk-icon")) return;
  sel.value = "";
}
onMounted(() => document.addEventListener("pointerdown", clearSel, true));
onBeforeUnmount(() => document.removeEventListener("pointerdown", clearSel, true));
</script>
