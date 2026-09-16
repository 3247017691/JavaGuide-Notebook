<template>
  <div ref="host" class="nb-host">
    <div ref="scope" class="nb-scope" :data-mode="prefs.nbMode" :data-size="prefs.nbSize">
      <div class="nb-page">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
/* 小抄容器基座：设计令牌作用域（.nb-scope）+ 滚动容器 + 容器查询对象。
   --nb-h/--nb-w 用 ResizeObserver 写入实测值，替代窗口化的 100vh/vw。
   夜读 / 字号贴在容器属性上；模式变化由 prefs.nbMode 驱动（外壳联动规则在 prefs store）。 */
import { ref, onMounted, onBeforeUnmount, provide } from "vue";
import { usePrefs } from "../../stores/prefs";

const props = defineProps({
  navigate: { type: Function, required: true },   // (href) => void
  setTitle: { type: Function, default: null },    // (title) => void
});

const prefs = usePrefs();
const host = ref(null);
const scope = ref(null);
let ro = null;

onMounted(() => {
  ro = new ResizeObserver(() => {
    if (!scope.value) return;
    scope.value.style.setProperty("--nb-h", scope.value.clientHeight + "px");
    scope.value.style.setProperty("--nb-w", scope.value.clientWidth + "px");
  });
  ro.observe(scope.value);
});
onBeforeUnmount(() => ro && ro.disconnect());

provide("nbScroll", scope);
provide("nbNavigate", (href) => props.navigate(href));
provide("nbSetTitle", (t) => props.setTitle && props.setTitle(t));
provide("nbMode", () => prefs.nbMode);
</script>
