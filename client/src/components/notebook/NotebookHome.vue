<template>
  <div>
    <header class="masthead">
      <div>
        <h1 class="masthead-title">JavaGuide<span class="sep">·</span>离线小抄</h1>
        <p class="masthead-sub"><b>12</b> 章 <b>332</b> 篇 · 正文离线自 javaguide.cn · 阅读页目录里划掉小节，这里跟着涂半格；整篇读完才落整格</p>
      </div>
      <div class="score" role="group" aria-label="总进度">
        <div class="score-line">
          <span class="score-num"><b>{{ ov ? ov.read : 0 }}</b><i>/</i><em>{{ ov ? ov.total : 332 }}</em></span>
          <span class="score-pct" :title="ov ? `整篇 ${ov.read}/${ov.total} · 小节 ${ov.sectionsRead}/${ov.sectionsTotal}` : ''">
            {{ ov ? ov.pct.toFixed(1) + "%" : "—" }}
          </span>
        </div>
        <div class="tape" aria-hidden="true">
          <i v-for="c in chapters" :key="c.code"
             :style="{ '--n': Math.max(1, c.total), '--f': (c.read / Math.max(1, c.total)).toFixed(4) }"
             :title="c.name + ' ' + c.read + '/' + c.total" />
        </div>
        <p class="score-when">{{ whenText }}</p>
      </div>
    </header>

    <main class="deck" aria-label="12 章小抄卡" :aria-busy="String(!nb.overview && !nb.overviewError)">
      <!-- 骨架：与真实卡阵同格位，加载完不跳版 -->
      <template v-if="!nb.overview && !nb.overviewError">
        <a v-for="(s, i) in SKELETONS" :key="i" class="card is-skeleton" :data-size="s.size"
           :style="{ '--col': s.col, '--row': s.row }" href="javascript:void(0)">
          <span class="card-paper">
            <span class="sk sk-code" /><span class="sk sk-name" /><span class="sk sk-line" /><span class="sk sk-ticks" /><span class="sk sk-foot" />
          </span>
        </a>
      </template>

      <p v-else-if="nb.overviewError" class="deck-note">
        {{ nb.overviewError }}<br>
        <a href="javascript:void(0)" @click="nb.loadOverview()">重新翻一次</a> ·
        若服务器没在跑，先执行 <b>npm start</b>
      </p>

      <template v-else>
        <a v-for="(c, i) in chapters" :key="c.code" class="card" :class="{ done: c.total > 0 && c.read === c.total }"
           :data-size="sizeOf(i)" :data-rows="placementOf(i).row"
           :style="cardStyle(c, i)"
           :aria-label="`${c.name}，已读 ${c.read} / ${c.total} 篇，完成 ${c.pct.toFixed(1)}%${c.partial ? `，另有 ${c.partial} 篇读了一部分` : ''}`"
           href="javascript:void(0)" @click="open(c)">
          <span class="card-paper">
            <span class="fold" aria-hidden="true" />
            <span class="card-head">
              <span class="card-code">{{ c.code }}</span>
              <span class="card-name">{{ c.name }}</span>
            </span>
            <span class="card-blurb">{{ c.blurb || "" }}</span>
            <span class="card-tail">
              <span class="card-ticks" aria-hidden="true">
                <i v-for="x in c.items" :key="x.id" :class="{ on: x.r, mid: !x.r && x.st && x.sr > 0 }"
                   :style="!x.r && x.st && x.sr > 0 ? { '--f': (x.sr / x.st).toFixed(3) } : null" />
              </span>
              <span v-if="c.partial > 0 && c.secTotal" class="card-secs"
                    :title="`有 ${c.partial} 篇的小节读了一部分（还没盖整篇章）；全章共划掉 ${c.secRead} / ${c.secTotal} 节`">
                半读 <b>{{ c.partial }}</b> 篇 · 已划 <b>{{ c.secRead }}</b>/{{ c.secTotal }} 节
              </span>
              <span class="card-foot">
                <span class="card-count"><b>{{ c.read }}</b><i>/</i>{{ c.total }}</span>
                <span class="card-pct">{{ c.pct.toFixed(1) }}%</span>
              </span>
            </span>
            <span class="card-stamp" aria-hidden="true">背完</span>
          </span>
        </a>
      </template>
    </main>

    <footer class="desk-foot">
      <span>内容 © JavaGuide（snailclimb）· CC BY-SA 4.0 · 离线本地化</span>
      <span>点卡片翻目录 · <b>朱线</b>只写已读</span>
    </footer>

    <div class="toast" :class="{ show: toastShow }" role="status">{{ toastText }}</div>
  </div>
</template>

<script setup>
/* 首页 · 桌面上的卡阵（移植 home.js）：版面由「篇幅」决定，5 行每行正好 12 列 */
import { computed, ref, onMounted } from "vue";
import { useNotebook } from "../../stores/notebook";
import { chColor } from "../../lib/icons";
import { fmtWhen } from "../../lib/nburl";
import { inject } from "vue";

const nb = useNotebook();
const navigate = inject("nbNavigate");
const setTitle = inject("nbSetTitle");

/* 12 章时的版面表（下标 = 章序 01..12） */
const PLACEMENT = [
  { col: 2, row: 1 }, { col: 6, row: 2 }, { col: 4, row: 2 }, { col: 2, row: 1 },
  { col: 4, row: 1 }, { col: 2, row: 1 }, { col: 2, row: 1 }, { col: 4, row: 1 },
  { col: 2, row: 1 }, { col: 6, row: 2 }, { col: 4, row: 2 }, { col: 2, row: 1 },
];
const SIZE = { 6: "xl", 4: "md", 2: "sm" };
const FOLD = { xl: [30, 30], md: [26, 24], sm: [18, 12] };
const SKELETONS = PLACEMENT.map((p) => ({ col: p.col, row: p.row, size: SIZE[p.col] || "md" }));

const chapters = computed(() => (nb.overview && nb.overview.chapters) || []);
const whenText = computed(() => {
  const ov = nb.overview;
  if (!ov) return "正翻记录本";
  const when = ov.lastReadAt ? "最近批阅 " + fmtWhen(ov.lastReadAt) : "还没有批阅记录";
  return ov.sectionsTotal ? `${when} · 小节 ${ov.sectionsRead}/${ov.sectionsTotal}` : when;
});

const placementOf = (i) => (chapters.value.length === 12 ? PLACEMENT[i] : { col: 3, row: 1 });
const sizeOf = (i) => SIZE[placementOf(i).col] || "md";
function cardStyle(c, i) {
  const { col, row } = placementOf(i);
  const size = SIZE[col] || "md";
  const [base, extra] = FOLD[size];
  const pctv = c.total ? c.read / c.total : 0;
  const fold = Math.round(base + pctv * extra);
  return { "--col": col, "--row": row, "--ch": chColor(c.code), "--foldpx": fold + "px", "--i": i };
}

function open(c) {
  navigate && navigate("/chapter.html?c=" + c.code);
}

/* 轻量 toast（划线失败提示等由章节/阅读页各自处理；首页只留容器以防万一） */
const toastShow = ref(false);
const toastText = ref("");

onMounted(() => {
  setTitle && setTitle("");
  nb.loadOverview();
});
</script>
