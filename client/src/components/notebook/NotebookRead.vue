<template>
  <div class="read-sheet">
    <main class="read-clip">
      <i class="fold" aria-hidden="true" />
      <header class="read-band" :style="{ '--ch': bandColor }">
        <a class="crumb" href="javascript:void(0)" @click="goHome">桌面</a>
        <span class="crumb">
          <span class="sep">/</span>
          <template v-if="CUR && supp"><span class="crumb crumb--dim">延伸页</span></template>
          <template v-else-if="CUR">
            <a class="crumb" href="javascript:void(0)" @click="goChapter">{{ CUR.chapter }}</a>
            <template v-if="CUR.group"><span class="sep">›</span><span class="crumb crumb--dim">{{ CUR.group }}</span></template>
          </template>
          <template v-else>—</template>
        </span>
        <span class="spacer" />
        <button v-if="!supp" class="stamp-btn" type="button" :class="{ on: isRead }" :aria-pressed="String(isRead)"
                :title="isRead ? '取消已读' : '标记为已读'" @click="stamp">
          {{ isRead ? "取消已读" : "标记已读" }}
        </button>
      </header>
      <div class="read-wrap">
        <div>
          <div class="read-head">
            <h1 class="read-title">
              <span v-if="!CUR" class="loading-line">铺开小抄</span>
              <template v-else v-html="titleHtml" />
            </h1>
            <div v-if="CUR" class="read-sub">
              <span class="ch-tag">{{ CUR.chapter }}</span><span>约 {{ CUR.mins }} 分钟</span>
              <span v-if="CUR.headings && CUR.headings.length">{{ CUR.headings.length }} 节</span>
              <span v-if="supp" class="crumb--dim">正文内链页面 · 不计入进度</span>
            </div>
          </div>
          <article ref="body" class="article" v-html="html" @click="onBodyClick" />
        </div>
        <footer class="read-foot" v-html="footHtml" @click="onFootClick" />
      </div>
    </main>

    <nav v-if="tocRows.length" class="toc" :class="{ 'toc-done': tocDone }" :style="{ '--p': tocP }" aria-label="本节目录">
      <h2><span>本节目录<b class="toc-prog">{{ tocTotal ? `${tocRead.size}/${tocTotal} 节` : "" }}</b></span>
        <button v-if="parents.length" class="toc-toggle-all" type="button" @click="toggleAll">
          {{ allCollapsed ? "全部展开" : "全部收起" }}
        </button>
      </h2>
      <div v-for="h in tocRows" :key="h.id" class="toc-row" :class="['lv' + h.level, { read: tocRead.has(h.id), child: !!h.parentOf, hidden: h.parentOf && collapsed.has(h.parentOf), collapsed: h.kids && collapsed.has(h.id) }]"
           :data-h="h.id">
        <span class="toc-slot">
          <button v-if="h.kids" class="toc-caret" type="button" aria-label="展开或收起子条目"
                  :aria-expanded="String(!collapsed.has(h.id))" @click.stop="toggleCollapse(h.id)" />
        </span>
        <a :href="'#' + h.id" @click.stop.prevent="jumpTo(h.id)">{{ h.text }}</a>
        <button v-if="!supp" class="toc-mark" type="button" :aria-pressed="String(tocRead.has(h.id))"
                title="划掉/恢复本节" @click.stop.prevent="markSection(h)">✓</button>
      </div>
    </nav>

    <nav class="rail" :class="{ 'at-top': atTop }" aria-label="页面导航">
      <button class="rail-btn" type="button" title="返回桌面" aria-label="返回桌面" @click="goHome"
              v-html="icoHome" />
      <button class="rail-btn" type="button" title="返回上一级" aria-label="返回上一级" @click="goUp" v-html="icoUp" />
      <button class="rail-btn rail-top" type="button" title="返回最顶端" aria-label="返回最顶端"
              :aria-hidden="String(atTop)" :tabindex="atTop ? -1 : 0" @click="scrollTop" v-html="icoTop" />
      <button class="rail-btn rail-mode" type="button" :title="mode === 'night' ? '回到白昼' : '夜读'" aria-label="切换夜读"
              :aria-pressed="String(mode === 'night')" @click="toggleMode" v-html="mode === 'night' ? icoMoon : icoSun" />
      <button class="rail-btn rail-size" type="button" title="正文字号：小 / 标准 / 大" aria-label="切换正文字号"
              @click="cycleSize">A</button>
    </nav>

    <div class="toast" :class="{ show: toastShow }" role="status">{{ toastText }}</div>
  </div>
</template>

<script setup>
/* 阅读页（移植 read.js）：内容注入 + 便签目录（逐节划掉、双向联动）+ 盖章 + 导航轨 + mermaid */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, inject } from "vue";
import { useNotebook } from "../../stores/notebook";
import { usePrefs } from "../../stores/prefs";
import { chColor } from "../../lib/icons";
import { getText } from "../../api";
import { ElMessage } from "element-plus";

const props = defineProps({ out: { type: String, required: true } });
const nb = useNotebook();
const prefs = usePrefs();
const navigate = inject("nbNavigate");
const setTitle = inject("nbSetTitle");
const nbScroll = inject("nbScroll");

const CUR = ref(null);
const html = ref("");
const tocRead = ref(new Set());
const collapsed = ref(new Set());
const atTop = ref(true);
const toastShow = ref(false);
const toastText = ref("");
const body = ref(null);
let toastTimer = 0;

function toast(msg) {
  toastText.value = msg;
  toastShow.value = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastShow.value = false; }, 2200);
}

const supp = computed(() => !!(CUR.value && CUR.value.supplementary));
const bandColor = computed(() => (CUR.value ? chColor(CUR.value.code) : "#55606a"));
const titleHtml = computed(() =>
  CUR.value ? esc(CUR.value.title).replace(/⭐/g, '<span class="star">★</span>') : "");
const mode = computed(() => prefs.nbMode);

/* ---------------- 目录行 ---------------- */
const tocTotal = computed(() => (CUR.value && CUR.value.headings ? CUR.value.headings.length : 0));
const tocRows = computed(() => {
  const hs = (CUR.value && CUR.value.headings) || [];
  let parent = null;
  return hs.map((h, i) => {
    if (h.level === 2) parent = h.id;
    const kids = h.level === 2 && hs[i + 1] && hs[i + 1].level === 3;
    return { ...h, parentOf: h.level === 3 ? parent : null, kids };
  });
});
const parents = computed(() => tocRows.value.filter((h) => h.kids).map((h) => h.id));
const allCollapsed = computed(() => parents.value.length > 0 && parents.value.every((p) => collapsed.value.has(p)));
const tocP = computed(() => (tocTotal.value ? tocRead.value.size / tocTotal.value : 0));
const tocDone = computed(() => tocTotal.value > 0 && tocRead.value.size >= tocTotal.value);

function toggleCollapse(id) {
  const s = new Set(collapsed.value);
  s.has(id) ? s.delete(id) : s.add(id);
  collapsed.value = s;
  try { localStorage.setItem("toc-collapsed:" + CUR.value.id, JSON.stringify([...s])); } catch { /* 忽略 */ }
}
function toggleAll() {
  const s = new Set(allCollapsed.value ? [] : parents.value);
  collapsed.value = s;
  try { localStorage.setItem("toc-collapsed:" + CUR.value.id, JSON.stringify([...s])); } catch { /* 忽略 */ }
}

/* ---------------- 小节划掉 ---------------- */
async function markSection(h) {
  const next = !tocRead.value.has(h.id);
  const s = new Set(tocRead.value);
  next ? s.add(h.id) : s.delete(h.id);
  tocRead.value = s; // 乐观
  const r = await nb.toggleSection(CUR.value.id, h.id, null, next);
  if (r && r.error) {
    const back = new Set(tocRead.value);
    next ? back.delete(h.id) : back.add(h.id);
    tocRead.value = back;
    toast("未保存：" + r.error);
    return;
  }
  if (r && r.ok && typeof r.data.articleRead === "boolean") {
    toast(r.data.articleRead
      ? "全节划完，整篇已自动盖「已读」章"
      : "退掉一节，整篇「已读」章已自动撤销");
  }
}

/* ---------------- 整篇盖章 ---------------- */
const isRead = computed(() => !!(CUR.value && nb.reads[CUR.value.id]));
async function stamp() {
  const cur = CUR.value;
  if (!cur) return;
  const next = !isRead.value;
  const r = await nb.toggleArticle(cur.id, next);
  if (r && r.error) { toast("保存失败：" + r.error); return; }
  await nb.loadSecReads(cur.id); // 集合以服务端为准回填
  tocRead.value = new Set((nb.secReads[cur.id] || []).filter((id) => (cur.headings || []).some((h) => h.id === id)));
  toast(next
    ? (r.data.sectionsTotal ? "盖章：已读，目录里的小节一并划掉了" : "盖章：已读")
    : "章已擦掉");
}

/* ---------------- 跳转 / spy ---------------- */
function jumpTo(id) {
  const el = document.getElementById(id);
  const sc = nbScroll && nbScroll.value;
  if (!el || !sc) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  sc.scrollTo({ top: el.offsetTop - sc.offsetTop - 12, behavior: reduce ? "auto" : "smooth" });
  setCur(id);
}
let curId = null;
function setCur(id) {
  if (id === curId) return;
  curId = id;
  document.querySelectorAll(".toc a").forEach((a) => {
    a.classList.toggle("cur", id != null && a.getAttribute("href") === "#" + id);
  });
}
let raf = 0;
function onScroll() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const sc = nbScroll && nbScroll.value;
    if (!sc || !CUR.value) return;
    const heads = (CUR.value.headings || [])
      .map((h) => document.getElementById(h.id)).filter(Boolean);
    if (!heads.length) return;
    const line = sc.scrollTop + Math.max(64, sc.clientHeight * 0.08);
    let active = null, activeTop = -Infinity;
    const scTop = sc.getBoundingClientRect().top;
    heads.forEach((el) => {
      const top = el.getBoundingClientRect().top - scTop + sc.scrollTop;
      if (top <= line && top >= activeTop) { active = el; activeTop = top; }
    });
    if (!active && sc.scrollTop < 8) active = heads[0];
    if (sc.scrollHeight > sc.clientHeight + 8 && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) {
      active = heads[heads.length - 1];
    }
    setCur(active ? active.id : null);
    atTop.value = sc.scrollTop < 240;
  });
}

/* ---------------- 正文注入与后处理 ---------------- */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function degrade(img) {
  const p = document.createElement("p");
  p.style.cssText = "border:1px dashed var(--ink-faint);padding:10px;font-size:12.5px;color:var(--ink-faint);text-align:center";
  p.textContent = "（此图原站已撤下：" + (img.alt || img.src.split("/").pop()) + "）";
  img.replaceWith(p);
}
function postProcess() {
  const root = body.value;
  if (!root) return;
  root.querySelectorAll("img").forEach((img) => {
    if (img.complete && img.naturalWidth === 0) degrade(img);
    else img.addEventListener("error", () => degrade(img));
  });
  root.querySelectorAll("table").forEach((t) => {
    if (t.parentElement && t.parentElement.classList.contains("md-table-wrap")) return;
    const w = document.createElement("div");
    w.className = "md-table-wrap";
    t.replaceWith(w);
    w.appendChild(t);
  });
}
/* 站内链接全部内跳：/content、/read、/chapter、/index 归 navigate；外链新开 */
function onBodyClick(ev) {
  const a = ev.target.closest("a");
  if (!a) return;
  const href = a.getAttribute("href") || "";
  if (href.startsWith("#")) return;
  ev.preventDefault();
  if (/^https?:/i.test(href)) { window.open(href, "_blank", "noopener"); return; }
  if (href.startsWith("/")) {
    if (href.startsWith("/img/") || href.startsWith("/vendor/")) return;
    navigate(href.startsWith("/read/") || href.startsWith("/chapter.html") || href.startsWith("/index.html")
      ? href : "/read/" + href.replace(/^\/?content\//, ""));
  }
}
function onFootClick(ev) {
  const a = ev.target.closest("a");
  if (!a) return;
  ev.preventDefault();
  const href = a.getAttribute("href") || "";
  if (href === "javascript:void(0)") return;
  navigate(href);
}

/* ---------------- 上一篇 / 下一篇 ---------------- */
const footHtml = computed(() => {
  if (!CUR.value) return "";
  const meta = nb.meta || [];
  const escT = (s) => esc(String(s).replace(/⭐/g, ""));
  if (supp.value) {
    return `<a href="javascript:void(0)" data-act="back">← 返回上一页</a>` +
      `<span><a href="/index.html">桌面</a> · <a href="/chapter.html">章节卡</a></span><span></span>`;
  }
  const cur = CUR.value;
  const siblings = meta.filter((m) => m.code === cur.code && m.local && !m.supplementary);
  const i = siblings.findIndex((m) => m.out === cur.out);
  const prev = siblings[i - 1], next = siblings[i + 1];
  return (prev ? `<a href="${prev.out}">← ${escT(prev.title)}</a>` : "<span></span>") +
    `<span><a href="/chapter.html?c=${cur.code}">回本章目录</a> · <a href="/index.html">桌面</a></span>` +
    (next ? `<a href="${next.out}">${escT(next.title)} →</a>` : "<span></span>");
});
function onFootClickBind() { /* 占位：v-on 已绑 onFootClick */ }

/* ---------------- 导航轨动作 ---------------- */
function goHome() { navigate && navigate("/index.html"); }
function goUp() {
  if (CUR.value && CUR.value.code && !supp.value) goChapter();
  else if (window.history.length > 1) window.history.back();
  else goHome();
}
function goChapter() {
  navigate && navigate("/chapter.html?c=" + CUR.value.code);
}
function scrollTop() {
  const sc = nbScroll && nbScroll.value;
  if (!sc) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  sc.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
}
function toggleMode() {
  const next = mode.value === "night" ? "day" : "night";
  prefs.setNbMode(next);
  renderMermaidDebounced(next);
  toast(next === "night" ? "夜读已开启" : "已回到白昼");
}
function cycleSize() {
  prefs.cycleNbSize();
  toast("正文字号：" + { s: "小", m: "标准", l: "大" }[prefs.nbSize]);
}

/* ---------------- mermaid ---------------- */
let MMD = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}
async function runMermaid(nodes, m) {
  if (!MMD || !nodes || !nodes.length) return;
  try {
    MMD.initialize({
      startOnLoad: false,
      theme: m === "night" ? "dark" : "neutral",
      securityLevel: "loose",
      fontFamily: getComputedStyle(document.body).fontFamily,
    });
    await MMD.run({ nodes });
  } catch { /* 图重画失败不该拖住换模式 */ }
}
async function loadMermaid() {
  try {
    if (!window.mermaid) await loadScript("/vendor/mermaid/mermaid.min.js");
    MMD = window.mermaid;
    const nodes = [...document.querySelectorAll(".mermaid-src")];
    nodes.forEach((n, i) => {
      n.classList.add("mermaid");
      n.id = "mmd-" + i;
      n.dataset.src = n.innerHTML;
    });
    await runMermaid(nodes, mode.value);
  } catch {
    document.querySelectorAll(".mermaid-src").forEach((n) => {
      n.insertAdjacentHTML("beforebegin", `<p style="font-size:12px;color:var(--ink-faint)">（示意图源码，mermaid 组件未加载）</p>`);
    });
  }
}
let mmdTimer = 0;
function renderMermaidDebounced(m) {
  clearTimeout(mmdTimer);
  mmdTimer = setTimeout(() => {
    const nodes = [...document.querySelectorAll(".mermaid-src[data-src]")];
    if (!nodes.length) return;
    nodes.forEach((el) => {
      el.innerHTML = el.dataset.src;
      el.removeAttribute("data-processed");
    });
    runMermaid(nodes, m);
  }, 120);
}

/* ---------------- 图标 ---------------- */
const svg = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
const icoHome = svg('<path d="M3.6 10.9 12 3.9l8.4 7"/><path d="M5.8 9.4V20h12.4V9.4"/><path d="M9.9 20v-5.3h4.2V20"/>');
const icoUp = svg('<path d="M9.3 6.7 4.5 11.5l4.8 4.8"/><path d="M4.5 11.5h9.3a5.7 5.7 0 0 1 5.7 5.7v2.5"/>');
const icoTop = svg('<path d="M5.6 3.7h12.8"/><path d="M12 20.3V7.6"/><path d="M6.7 12.9 12 7.6l5.3 5.3"/>');
const icoSun = svg('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5"/>');
const icoMoon = svg('<path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z"/>');

/* ---------------- 装载 ---------------- */
async function render() {
  CUR.value = null;
  html.value = "";
  const meta = await nb.loadMeta();
  const cur = meta.find((m) => m.out === props.out);
  if (!cur) {
    CUR.value = null;
    html.value = "";
    setTitle && setTitle(null);
    await nextTick();
    if (body.value) {
      body.value.innerHTML = `<p>目录里没有 <code>${esc(props.out)}</code>。回 <a href="/index.html">桌面</a> 或 <a href="/chapter.html">章节卡</a> 看看。</p>`;
    }
    return;
  }
  CUR.value = cur;
  setTitle && setTitle(cur.title.replace("⭐", ""));
  const content = await getText(cur.out.replace("/read/", "/content/"));
  html.value = content || "<p>正文文件缺失。</p>";
  await nextTick();
  postProcess();

  if (!supp.value && cur.headings && cur.headings.length) {
    const ids = await nb.loadSecReads(cur.id);
    tocRead.value = new Set(ids.filter((id) => cur.headings.some((h) => h.id === id)));
    // 自愈兜底：小节全划掉却还没盖章（联动规则上线前的历史数据）
    if (!isRead.value && tocRead.value.size >= cur.headings.length) {
      nb.toggleArticle(cur.id, true);
    }
  } else {
    tocRead.value = new Set();
  }
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem("toc-collapsed:" + cur.id) || "[]"); } catch { /* 忽略 */ }
  collapsed.value = new Set(Array.isArray(saved) ? saved : []);

  if (document.querySelector(".mermaid-src")) loadMermaid();
  nextTick(onScroll);
}

watch(() => props.out, render);
watch(() => prefs.nbMode, (m) => renderMermaidDebounced(m));
onMounted(() => {
  render();
  const sc = nbScroll && nbScroll.value;
  if (sc) sc.addEventListener("scroll", onScroll, { passive: true });
  else document.addEventListener("scroll", onScroll, { passive: true, capture: true });
});
onBeforeUnmount(() => {
  const sc = nbScroll && nbScroll.value;
  if (sc) sc.removeEventListener("scroll", onScroll);
  else document.removeEventListener("scroll", onScroll, { capture: true });
});
</script>
