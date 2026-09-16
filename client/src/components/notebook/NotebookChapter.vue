<template>
  <main class="sheet" :style="{ '--ch': bandColor }">
    <i class="fold" aria-hidden="true" />
    <header class="sheet-band">
      <span class="code">{{ data ? data.code : code }}</span>
      <h1>
        <span v-if="!data" class="loading-line">取卡中</span>
        <template v-else>{{ data.name }}</template>
      </h1>
      <a class="back" href="javascript:void(0)" @click="goHome">← 回桌面</a>
    </header>

    <div v-if="data && !data.error" class="sheet-meta" :style="{ '--p': data.total ? data.read / data.total : 0 }">
      <span class="sheet-score">
        已读 <b>{{ data.read }}</b> / {{ data.total }} 篇 · 完成率 <span class="pct">{{ data.pct }}%</span>
        <span v-if="data.secTotal" class="score-secs">小节 <b>{{ data.secRead }}</b> / {{ data.secTotal }} · {{ secPct }}%</span>
      </span>
      <span class="sheet-tools">
        <select v-model="switchCode" class="ch-switch" aria-label="换一张卡" @change="onSwitch">
          <option v-for="c in switcher" :key="c.code" :value="c.code">{{ c.code }} {{ c.name }}（{{ c.read }}/{{ c.total }}）</option>
        </select>
        <button class="btn" type="button" @click="bulk(true)">整章已读</button>
        <button class="btn" type="button" @click="bulk(false)">清除划线</button>
      </span>
    </div>

    <div v-if="data && !data.error">
      <template v-for="(g, gi) in data.groups" :key="gi">
        <h2 class="grp">{{ g.group || "综合" }}<span class="g-count" v-html="gStat(g)" /></h2>
        <ul class="entries">
          <li v-for="it in g.items" :key="it.id" class="entry"
              :class="{ read: it.read, part: !it.read && secInfo(it) && secInfo(it).part }"
              :style="{ '--secp': secInfo(it) ? secInfo(it).p.toFixed(3) : 0 }">
            <a class="entry-link" :href="it.local ? 'javascript:void(0)' : it.url"
               :target="it.local ? undefined : '_blank'" :rel="it.local ? undefined : 'noopener'"
               :title="it.local ? '翻开这篇小抄' : '打开原文 ↗'"
               @click="it.local && openEntry(it)">
              <span class="hole" aria-hidden="true">阅</span>
              <span class="entry-title" v-html="titleHtml(it.title)" />
              <span class="entry-meta">
                <span v-if="secInfo(it)" class="entry-secs" :class="{ 'is-off': !secInfo(it).sr }"
                      :title="`悬浮目录里已划掉 ${secInfo(it).sr} / ${secInfo(it).st} 节`">
                  {{ secInfo(it).sr > 0 ? `${secInfo(it).sr}/${secInfo(it).st} 节` : "" }}
                </span>
                <span class="entry-when">{{ it.read && it.readAt ? fmtWhen(it.readAt) : "" }}</span>
              </span>
            </a>
            <button class="entry-toggle" type="button" :aria-pressed="String(!!it.read)"
                    :title="it.read ? '取消已读' : '标记为已读'" @click="toggle(it)">
              {{ it.read ? "取消已读" : "标记已读" }}
            </button>
          </li>
        </ul>
      </template>
    </div>
    <div v-else-if="data && data.error">
      <p class="sheet-note">{{ data.error }}<br>
        <a href="javascript:void(0)" @click="load">重试</a> ·
        <a href="javascript:void(0)" @click="goHome">回桌面</a></p>
    </div>
    <div v-else><p class="loading-line">摊开小抄</p></div>

    <footer class="sheet-foot">
      <span>点一行 = 翻开原文 · 右侧按钮 = 标记已读（穿孔 + 朱线 + 涂格，三处同步）</span>
      <span>内容 © JavaGuide · CC BY-SA 4.0</span>
    </footer>
  </main>

  <div class="toast" :class="{ show: toastShow }" role="status">{{ toastText }}</div>
</template>

<script setup>
/* 章节卡（移植 chapter.js）：整行=跳转、右侧按钮=划线，两件事分开；
   「半读」判定与服务端三处同源：!read && sr > 0 */
import { ref, computed, watch, onMounted } from "vue";
import { useNotebook } from "../../stores/notebook";
import { chColor } from "../../lib/icons";
import { fmtWhen } from "../../lib/nburl";
import { inject } from "vue";
import { ElMessageBox } from "element-plus";

const props = defineProps({ code: { type: String, required: true } });
const nb = useNotebook();
const navigate = inject("nbNavigate");
const setTitle = inject("nbSetTitle");

const data = computed(() => nb.chapters[props.code] || null);
const bandColor = computed(() => chColor(props.code));
const toastShow = ref(false);
const toastText = ref("");
let toastTimer = 0;
function toast(msg) {
  toastText.value = msg;
  toastShow.value = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastShow.value = false; }, 2400);
}

const switchCode = ref(props.code);
const switcher = computed(() => {
  const ov = nb.overview;
  return (ov && ov.chapters || []).map((c) => ({ code: c.code, name: c.name, read: c.read, total: c.total }));
});
function onSwitch() {
  if (switchCode.value !== props.code) navigate("/chapter.html?c=" + switchCode.value);
}

const secPct = computed(() => {
  const d = data.value;
  return d && d.secTotal ? Math.round((d.secRead / d.secTotal) * 1000) / 10 : 0;
});

function secInfo(it) {
  const st = it.sectionsTotal || 0;
  if (!st) return null;
  const sr = Math.min(it.sectionsRead || 0, st);
  const full = !!it.read;
  return { st, sr: full ? st : sr, p: full ? 1 : sr / st, part: !full && sr > 0 };
}
function gStat(g) {
  const done = g.items.filter((i) => i.read).length;
  const part = g.items.filter((i) => !i.read && (i.sectionsRead || 0) > 0).length;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return esc(`${done}/${g.items.length}`) + (part ? ` <em>· 半读 ${part}</em>` : "");
}
function titleHtml(t) {
  const esc = String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return esc.replace(/⭐/g, '<span class="star">★</span>');
}

function openEntry(it) {
  navigate(it.local);
}
async function toggle(it) {
  const r = await nb.toggleArticle(it.id, !it.read);
  if (r && r.error) toast("划线未保存：" + r.error);
}
async function bulk(read) {
  const d = data.value;
  if (!d) return;
  const msg = read
    ? `把「${d.name}」全部 ${d.total} 篇都标记为已读？`
    : `擦掉「${d.name}」的全部划线？`;
  try {
    await ElMessageBox.confirm(msg, read ? "整章划线" : "擦除划线", {
      confirmButtonText: read ? "确认划线" : "确认擦除",
      cancelButtonText: "取消",
      type: read ? "warning" : "info",
    });
  } catch { return; }
  const r = await nb.bulk(d.code, read);
  if (r.error) toast("操作失败：" + r.error);
  else toast(read ? "整章已读" : "划线已擦除");
}
function goHome() {
  navigate("/index.html");
}
async function load() {
  await Promise.all([nb.loadChapter(props.code), nb.overview || nb.loadOverview()]);
}

watch(() => props.code, () => { switchCode.value = props.code; load(); });
onMounted(() => {
  load();
  setTitle(data.value ? data.value.name : "");
  watch(data, (d) => { if (d && d.name) setTitle(d.name); });
});
</script>
