<template>
  <NotebookRoot :navigate="navigate" :set-title="setTitle">
    <NotebookHome v-if="view === 'home'" :key="'home'" />
    <NotebookChapter v-else-if="view === 'chapter'" :key="'chapter-' + code" :code="code" />
    <NotebookRead v-else-if="view === 'read'" :key="'read-' + path" :out="path" />
    <NotebookHome v-else />
  </NotebookRoot>
</template>

<script setup>
/* 全页小抄宿主：直开 /index.html、/chapter.html?c=、/read/**.html 深链时使用。
   导航走 vue-router，URL 语义与旧站完全一致。 */
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { parseNotebookUrl } from "../../lib/nburl";
import NotebookRoot from "./NotebookRoot.vue";
import NotebookHome from "./NotebookHome.vue";
import NotebookChapter from "./NotebookChapter.vue";
import NotebookRead from "./NotebookRead.vue";

const route = useRoute();
const router = useRouter();

const parsed = computed(() => parseNotebookUrl(route.fullPath) || { view: "home" });
const view = computed(() => parsed.value.view);
const code = computed(() => parsed.value.code || "01");
const path = computed(() => parsed.value.path || "");

function navigate(href) {
  router.push(href);
}
function setTitle(t) {
  document.title = t ? `${t} · JavaGuide 离线小抄` : "JavaGuide 离线小抄";
}
watch(view, (v) => { if (v === "home") setTitle(""); }, { immediate: true });
</script>
