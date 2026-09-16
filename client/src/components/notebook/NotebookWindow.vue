<template>
  <NotebookRoot :key="tab.id" :navigate="navigate" :set-title="setTitle">
    <NotebookHome v-if="view === 'home'" :key="'home-' + tab.rt" />
    <NotebookChapter v-else-if="view === 'chapter'" :key="'chapter-' + code + '-' + tab.rt" :code="code" />
    <NotebookRead v-else-if="view === 'read'" :key="'read-' + path + '-' + tab.rt" :out="path" />
    <NotebookHome v-else />
  </NotebookRoot>
</template>

<script setup>
/* 窗口内的原生小抄宿主：标签页 URL → 视图映射，导航走外壳的 go()（进标签历史）。 */
import { computed } from "vue";
import { parseNotebookUrl } from "../../lib/nburl";
import { useWins } from "../../stores/windows";
import NotebookRoot from "./NotebookRoot.vue";
import NotebookHome from "./NotebookHome.vue";
import NotebookChapter from "./NotebookChapter.vue";
import NotebookRead from "./NotebookRead.vue";

const props = defineProps({
  win: { type: Object, required: true },
  tab: { type: Object, required: true },
});
const wins = useWins();

const parsed = computed(() => parseNotebookUrl(props.tab.url) || { view: "home" });
const view = computed(() => parsed.value.view);
const code = computed(() => parsed.value.code || "01");
const path = computed(() => parsed.value.path || "");

function navigate(href) {
  wins.go(props.win.id, href);
}
function setTitle(t) {
  wins.setTabTitle(props.win.id, props.tab.id, t);
}
</script>
