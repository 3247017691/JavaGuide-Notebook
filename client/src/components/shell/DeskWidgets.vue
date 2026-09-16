<template>
  <!-- 桌面左列小组件（参考图 macOS27.jpg 的时钟/日历	widget 列）：纯展示，不挡窗口 -->
  <div class="widgets" aria-hidden="true">
    <div class="widget glass-med w-clock">
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-opacity=".16" stroke-width="1.6" />
        <line v-for="i in 12" :key="i" x1="50" y1="7" x2="50" :y2="i % 3 === 0 ? 13 : 11"
              :transform="'rotate(' + i * 30 + ' 50 50)'"
              stroke="currentColor" stroke-opacity=".4" :stroke-width="i % 3 === 0 ? 2 : 1" stroke-linecap="round" />
        <line x1="50" y1="50" x2="50" y2="29" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"
              :transform="'rotate(' + hDeg + ' 50 50)'" />
        <line x1="50" y1="50" x2="50" y2="19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"
              :transform="'rotate(' + mDeg + ' 50 50)'" />
        <line x1="50" y1="56" x2="50" y2="16" stroke="#ff9f0a" stroke-width="1.4" stroke-linecap="round"
              :transform="'rotate(' + sDeg + ' 50 50)'" />
        <circle cx="50" cy="50" r="2.6" fill="currentColor" />
      </svg>
      <div class="wc-date">{{ dateText }}</div>
    </div>

    <div class="widget glass-med w-cal">
      <div class="wc-wk">{{ wkText }}</div>
      <div class="wc-d">{{ now.getDate() }}</div>
      <div class="wc-m">{{ now.getMonth() + 1 }} 月 · {{ now.getFullYear() }}</div>
    </div>

    <div class="widget glass-med w-prog">
      <div class="wp-row"><span>已读</span><b>{{ fmt(jg) }}</b></div>
      <div class="wp-bar"><i :style="{ transform: 'scaleX(' + ratio(jg) + ')' }" /></div>
      <div class="wp-row"><span>掌握</span><b>{{ fmt(jbl) }}</b></div>
      <div class="wp-bar ok"><i :style="{ transform: 'scaleX(' + ratio(jbl) + ')' }" /></div>
    </div>
  </div>
</template>

<script setup>
/* 左列 widgets：时钟走秒、日历取当天、进度读 desk store（与菜单栏芯片同源）。 */
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useDesk } from "../../stores/desk";

const desk = useDesk();
const now = ref(new Date());
let timer = 0;
onMounted(() => { timer = setInterval(() => { now.value = new Date(); }, 1000); });
onBeforeUnmount(() => clearInterval(timer));

const WK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const wkText = computed(() => WK[now.value.getDay()]);
const dateText = computed(() => `${now.value.getMonth() + 1}月${now.value.getDate()}日 ${wkText.value}`);
const sDeg = computed(() => now.value.getSeconds() * 6);
const mDeg = computed(() => now.value.getMinutes() * 6 + now.value.getSeconds() * 0.1);
const hDeg = computed(() => (now.value.getHours() % 12) * 30 + now.value.getMinutes() * 0.5);

const jg = computed(() => desk.progress.javaguide);
const jbl = computed(() => desk.progress.jbl);
const fmt = (p) => (p ? p.done + " / " + p.total : "—");
const ratio = (p) => (p && p.total ? Math.min(p.done / p.total, 1).toFixed(4) : 0);
</script>
