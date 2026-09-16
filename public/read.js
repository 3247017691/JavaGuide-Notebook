const $ = (id) => document.getElementById(id);
/* 「回桌面」的真实目标：独立打开时就是站点根 /；被桌面外壳装进 iframe 时，根 / 是外壳自己，
   所以由 desk-bridge 的配置给出小抄首页。read.html 里 DESK_BRIDGE 先于本脚本执行才拿得到。 */
const DESK_HOME = window.DESK_BRIDGE ? (window.DESK_BRIDGE.home || "/") : "/";
let META = null; // /api/meta 缓存
let CUR = null;  // 当前文章 meta

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

function currentOut() {
  let p = location.pathname;
  if (!p.startsWith("/read/")) return null;
  // 浏览器给的 pathname 是**百分号编码**的，而 META 里的 out 是原始中文
  // （/read/system-design/J2EE%E5%9F%BA… vs /read/system-design/J2EE基础知识.html），
  // 不解码就永远比不中，含中文的篇目会误报「找不到这篇小抄」。
  try { return decodeURIComponent(p); } catch (e) { return p; }
}

async function loadMeta() {
  if (META) return META;
  META = await fetch("/api/meta").then((r) => r.json());
  return META;
}

async function render() {
  const out = currentOut();
  const meta = await loadMeta();
  CUR = meta.find((m) => m.out === out);
  if (!CUR) {
    $("r-title").textContent = "找不到这篇小抄";
    $("r-body").innerHTML = `<p>目录里没有 <code>${esc(out || location.pathname)}</code>。回 <a href="${DESK_HOME}">桌面</a> 或 <a href="/chapter.html">章节卡</a> 看看。</p>`;
    return;
  }
  // 延伸页：正文内链落到 330 篇之外的页面，只读，不进进度统计
  const supp = !!CUR.supplementary;
  document.title = `${CUR.title.replace("⭐", "")} · JavaGuide 离线小抄`;
  const color = chColor(CUR.code);
  $("band").style.setProperty("--ch", color);
  document.documentElement.style.setProperty("--ch", color);
  $("crumb").innerHTML = supp
    ? `<span class="sep">/</span><span class="crumb crumb--dim">延伸页</span>`
    : `<span class="sep">/</span><a class="crumb" href="/chapter.html?c=${CUR.code}">${esc(CUR.chapter)}</a>` +
      (CUR.group ? `<span class="sep">›</span><span class="crumb crumb--dim">${esc(CUR.group)}</span>` : "");
  $("r-title").innerHTML = esc(CUR.title).replace(/⭐/g, '<span class="star">★</span>');
  // 付费/无正文的篇目小节数为 0 —— 别让「0 节」这种噪音占位
  $("r-sub").innerHTML = `<span class="ch-tag">${esc(CUR.chapter)}</span><span>约 ${CUR.mins} 分钟</span>` +
    (CUR.headings.length ? `<span>${CUR.headings.length} 节</span>` : "") +
    (supp ? `<span class="crumb--dim">正文内链页面 · 不计入进度</span>` : "");

  // 正文
  const html = await fetch(CUR.out.replace("/read/", "/content/")).then((r) => r.ok ? r.text() : "<p>正文文件缺失。</p>");
  $("r-body").innerHTML = html;
  // 原站已撤图的优雅降级（error 可能在监听前已触发，故用 complete 检测兜底）
  const degrade = (img) => {
    const p = document.createElement("p");
    p.style.cssText = "border:1px dashed var(--ink-faint);padding:10px;font-size:12.5px;color:var(--ink-faint);text-align:center";
    p.textContent = "（此图原站已撤下：" + (img.alt || img.src.split("/").pop()) + "）";
    img.replaceWith(p);
  };
  $("r-body").querySelectorAll("img").forEach((img) => {
    if (img.complete && img.naturalWidth === 0) degrade(img);
    else img.addEventListener("error", () => degrade(img));
  });
  // 宽表格在窄屏会顶破纸面（markdown 渲染出的是裸 <table>，没有可横滑的壳）。
  // 只加壳、不碰表格本身，所以桌面端的表格外观一字未变。
  $("r-body").querySelectorAll("table").forEach((t) => {
    if (t.parentElement && t.parentElement.classList.contains("md-table-wrap")) return;
    const w = document.createElement("div");
    w.className = "md-table-wrap";
    t.replaceWith(w);
    w.appendChild(t);
  });

  // 便签目录：h2 是父条目（可折叠），h3 是子条目；延伸页只列目录
  let secReads = new Set();
  if (!supp && CUR.headings.length) {
    const sr = await fetch("/api/section-reads?article=" + CUR.id).then((r) => r.json());
    secReads = new Set(sr.ids || []);
  }
  renderToc(supp, secReads);
  spyToc();

  // 右上盖章按钮：延伸页不进统计，直接收起来
  if (supp) {
    $("stamp").style.display = "none";
  } else {
    let isRead = false;
    try {
      const rd = await fetch("/api/reads").then((r) => r.json());
      isRead = (rd.ids || []).includes(CUR.id);
    } catch (e) { /* 读不到就按未读显示 */ }
    setStamp(isRead);
    // 自愈兜底：小节已全划掉却还没盖整篇章（联动规则上线前的历史数据）。
    // 补写一次，让「悬浮目录 ↔ 章节页 ↔ 首页」三处说的是同一件事。
    if (!isRead && CUR.headings.length && TOC_READ.size >= CUR.headings.length) {
      try {
        const res = await fetch("/api/read", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: CUR.id, read: true }),
        }).then((r) => r.json());
        if (!res.error) setStamp(true);
      } catch (e) { /* 忽略：下次任一写操作还会把它接上 */ }
    }
  }

  // 上一篇 / 下一篇（同章内按顺序；延伸页给"返回"）
  if (supp) {
    $("r-foot").innerHTML = `<a href="#" id="r-back">← 返回上一页</a>` +
      `<span><a href="${DESK_HOME}">桌面</a> · <a href="/chapter.html">章节卡</a></span><span></span>`;
    $("r-back").addEventListener("click", (e) => { e.preventDefault(); history.length > 1 ? history.back() : (location.href = DESK_HOME); });
  } else {
    const siblings = meta.filter((m) => m.code === CUR.code && m.local && !m.supplementary);
    const i = siblings.findIndex((m) => m.out === CUR.out);
    const prev = siblings[i - 1], next = siblings[i + 1];
    $("r-foot").innerHTML =
      (prev ? `<a href="${prev.out}">← ${esc(prev.title.replace("⭐", ""))}</a>` : "<span></span>") +
      `<span><a href="/chapter.html?c=${CUR.code}">回本章目录</a> · <a href="${DESK_HOME}">桌面</a></span>` +
      (next ? `<a href="${next.out}">${esc(next.title.replace("⭐", ""))} →</a>` : "<span></span>");
  }

  // mermaid 懒加载
  if (document.querySelector(".mermaid-src")) loadMermaid();
}

const STAMP = {
  add: { text: "标记已读", title: "标记为已读" },
  drop: { text: "取消已读", title: "取消已读" },
};
function setStamp(read) {
  const b = $("stamp");
  if (!b) return;
  b.classList.toggle("on", read);
  b.textContent = read ? STAMP.drop.text : STAMP.add.text;
  b.title = read ? STAMP.drop.title : STAMP.add.title;
  b.setAttribute("aria-pressed", read ? "true" : "false");
}

async function toggleSection(row) {
  const heading = row.dataset.h;
  const nowRead = !row.classList.contains("read");
  row.classList.toggle("read", nowRead);
  row.querySelector(".toc-mark").setAttribute("aria-pressed", nowRead);
  nowRead ? TOC_READ.add(heading) : TOC_READ.delete(heading);
  updateTocProg();
  try {
    const res = await fetch("/api/section-read", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article: CUR.id, heading, read: nowRead }),
    }).then((r) => r.json());
    if (res.error) throw new Error(res.error);
    // 联动结果：小节全划掉 → 服务端已自动盖上整篇「已读」；退掉一节 → 已自动撤章
    if (typeof res.articleRead === "boolean") {
      const was = $("stamp").classList.contains("on");
      setStamp(res.articleRead);
      if (res.articleRead !== was) {
        toast(res.articleRead ? "全节划完，整篇已自动盖「已读」章" : "退掉一节，整篇「已读」章已自动撤销");
      }
    }
  } catch (e) {
    row.classList.toggle("read", !nowRead);
    row.querySelector(".toc-mark").setAttribute("aria-pressed", !nowRead);
    nowRead ? TOC_READ.delete(heading) : TOC_READ.add(heading);
    updateTocProg();
    toast("未保存：" + e.message);
  }
}

const stampBtn = $("stamp");
if (stampBtn) stampBtn.addEventListener("click", async () => {
  if (!CUR) return;
  const nowRead = !stampBtn.classList.contains("on");
  const prevSec = new Set(TOC_READ);
  setStamp(nowRead);
  applyAllSections(nowRead);           // 乐观：盖章连带把所有小节划掉
  try {
    const res = await fetch("/api/read", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: CUR.id, read: nowRead }),
    }).then((r) => r.json());
    if (res.error) throw new Error(res.error);
    setStamp(res.read);
    applyAllSections(res.read);
    toast(nowRead
      ? (res.sectionsTotal ? "盖章：已读，目录里的小节一并划掉了" : "盖章：已读")
      : "章已擦掉");
  } catch (e) {
    setStamp(!nowRead);
    applyAllSections(!nowRead);
    TOC_READ = prevSec;                // 再按存档精确恢复进度环
    updateTocProg();
    toast("保存失败：" + e.message);
  }
});

// 生成目录：h2 为父条目（带折叠三角），h3 为子条目；折起状态按文章记在 localStorage
const TOC_KEY = "toc-collapsed:";
// 目录里的小节进度（本页的"进度条"）——与首页/章节页是同一套进度
let TOC_TOTAL = 0;
let TOC_READ = new Set();

function updateTocProg() {
  const box = $("r-toc");
  if (!box) return;
  const n = TOC_READ.size, t = TOC_TOTAL;
  const chip = box.querySelector(".toc-prog");
  if (chip) chip.textContent = t ? `${n}/${t} 节` : "";
  box.style.setProperty("--p", t ? (n / t).toFixed(4) : 0);
  box.classList.toggle("toc-done", t > 0 && n >= t);
}

/* 整篇盖章/撤章会连带把这篇所有小节一起划掉/清空（服务端联动），目录跟着一起变 */
function applyAllSections(read) {
  TOC_READ = read ? new Set((CUR.headings || []).map((h) => h.id)) : new Set();
  $("r-toc").querySelectorAll(".toc-row").forEach((row) => {
    row.classList.toggle("read", read);
    const m = row.querySelector(".toc-mark");
    if (m) m.setAttribute("aria-pressed", read);
  });
  updateTocProg();
}

function renderToc(supp, secReads) {
  const box = $("r-toc");
  const hs = CUR.headings || [];
  if (!hs.length) { box.innerHTML = ""; return; }

  let parent = null;
  const rows = hs.map((h, i) => {
    if (h.level === 2) parent = h.id;
    // 父条目：紧随其后有 h3 才算有子条目
    const kids = h.level === 2 && hs[i + 1] && hs[i + 1].level === 3;
    return { ...h, parentOf: h.level === 3 ? parent : null, kids };
  });

  TOC_TOTAL = hs.length;
  // 只认当前目录里真实存在的 id（库里可能留有重新构建正文后的旧 id）
  TOC_READ = new Set(hs.map((h) => h.id).filter((id) => secReads.has(id)));

  box.innerHTML = `<h2><span>本节目录<b class="toc-prog"></b></span><button class="toc-toggle-all" id="toc-toggle-all" type="button"></button></h2>` +
    rows.map((h) => {
      const cls = ["toc-row", "lv" + h.level];
      if (secReads.has(h.id)) cls.push("read");
      if (h.parentOf) cls.push("child");
      return `<div class="${cls.join(" ")}" data-h="${esc(h.id)}"${h.parentOf ? ` data-parent="${esc(h.parentOf)}"` : ""}>
        <span class="toc-slot">${h.kids ? `<button class="toc-caret" type="button" aria-label="展开或收起子条目"></button>` : ""}</span>
        <a href="#${esc(h.id)}">${esc(h.text)}</a>
        ${supp ? "" : `<button class="toc-mark" aria-pressed="${secReads.has(h.id)}" title="划掉/恢复本节">✓</button>`}
      </div>`;
    }).join("");

  let collapsed = new Set();
  try { collapsed = new Set(JSON.parse(localStorage.getItem(TOC_KEY + CUR.id) || "[]")); } catch (e) { /* 忽略 */ }
  const parents = rows.filter((h) => h.kids).map((h) => h.id);
  const allBtn = $("toc-toggle-all");

  const apply = () => {
    box.querySelectorAll(".toc-row").forEach((row) => {
      const col = collapsed.has(row.dataset.h);
      row.classList.toggle("collapsed", col);
      const caret = row.querySelector(".toc-caret");
      if (caret) caret.setAttribute("aria-expanded", col ? "false" : "true");
    });
    box.querySelectorAll(".toc-row.child").forEach((row) => {
      row.classList.toggle("hidden", collapsed.has(row.dataset.parent));
    });
    if (allBtn) allBtn.textContent = parents.length && parents.every((p) => collapsed.has(p)) ? "全部展开" : "全部收起";
  };
  const save = () => {
    try { localStorage.setItem(TOC_KEY + CUR.id, JSON.stringify([...collapsed])); } catch (e) { /* 忽略 */ }
  };

  box.querySelectorAll(".toc-caret").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = btn.closest(".toc-row").dataset.h;
      collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
      apply(); save();
    });
  });
  if (allBtn) {
    if (!parents.length) allBtn.style.display = "none";
    else allBtn.addEventListener("click", () => {
      collapsed = new Set(parents.every((p) => collapsed.has(p)) ? [] : parents);
      apply(); save();
    });
  }
  box.querySelectorAll(".toc-mark").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleSection(btn.closest(".toc-row"));
    });
  });
  apply();
  updateTocProg();
}

// 目录高亮：按滚动位置取「最后一个越过参考线的标题」。
// 不用 IntersectionObserver——锚点跳转会把标题顶到视口 0% 处，
// 固定观测带（10%~25%）永远框不住它，点击后高亮就不会跟着走。
function spyToc() {
  const links = [...document.querySelectorAll(".toc a")];
  if (!links.length) return;
  const byId = new Map(links.map((a) => [(a.getAttribute("href") || "").slice(1), a]));
  const heads = (CUR.headings || []).map((h) => document.getElementById(h.id)).filter(Boolean);
  if (!heads.length) return;

  let curId = null;
  const setCur = (id) => {
    if (id === curId) return;
    curId = id;
    links.forEach((a) => a.classList.toggle("cur", id != null && a === byId.get(id)));
  };

  const update = () => {
    const doc = document.documentElement;
    // 参考线贴着视口顶端（而非视口 1/4 处）：锚点跳转的落点就在这条线附近，
    // 被点的条目必然命中，不会被紧随其后的下一节抢走。
    const line = window.scrollY + Math.max(64, window.innerHeight * 0.08);
    let active = null, activeTop = -Infinity;
    heads.forEach((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      if (top <= line && top >= activeTop) { active = el; activeTop = top; }
    });
    // 页首（还没跨过第一节）：先点亮第一节，别让目录看着像没生效
    if (!active && window.scrollY < 8) active = heads[0];
    // 已滚到底：把高亮交给最后一节（否则文末那节永远等不到）——仅当页面真的可滚动
    if (doc.scrollHeight > window.innerHeight + 8 &&
        window.scrollY + window.innerHeight >= doc.scrollHeight - 2) {
      active = heads[heads.length - 1];
    }
    setCur(active ? active.id : null);
  };

  // 点击目录：先立刻点亮被点的条目，随后的 scroll 事件再校准一次
  links.forEach((a) => {
    a.addEventListener("click", () => setCur((a.getAttribute("href") || "").slice(1) || null));
  });

  let raf = 0;
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
}

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
/* ------------------------------------------------------------ 夜读 / 字号偏好
   MODE_KEY / SIZE_KEY 与三页 <head> 里那段 bootstrap 是同一对键：head 负责在样式
   生效前把 data-mode / data-size 贴到 <html> 上（否则跳页会先闪一下另一套底色），
   这里负责改它、存它。值 null = 从没手动选过，交给 CSS 的 prefers-color-scheme 兜底。 */
const MODE_KEY = "read-mode";
const SIZE_KEY = "read-size";

function currentMode() {
  const m = document.documentElement.dataset.mode;
  if (m === "day" || m === "night") return m;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
}

const SIZES = ["s", "m", "l"];
const SIZE_NAME = { s: "小", m: "标准", l: "大" };
function currentSize() {
  const s = document.documentElement.dataset.size;
  return SIZES.indexOf(s) >= 0 ? s : "m";
}
function applySize(v) {
  document.documentElement.dataset.size = v;
  try { localStorage.setItem(SIZE_KEY, v); } catch (e) { /* 隐私模式下偏好不持久，但当下仍生效 */ }
}
function cycleSize() {
  const next = SIZES[(SIZES.indexOf(currentSize()) + 1) % SIZES.length];
  applySize(next);
  toast("正文字号：" + SIZE_NAME[next]);
}

function toggleMode() {
  const next = currentMode() === "night" ? "day" : "night";
  document.documentElement.dataset.mode = next;
  try { localStorage.setItem(MODE_KEY, next); } catch (e) { /* 同上 */ }
  const btn = $("rail-mode");
  if (btn) btn.setAttribute("aria-pressed", next === "night" ? "true" : "false");
  renderMermaid(next);
  toast(next === "night" ? "夜读已开启" : "已回到白昼");
}
/* 连点两次会白重画一遍示意图，120ms 防抖把「快速切回来」这种手滑合成一次 */
function debounce(fn, ms) {
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
const switchMode = debounce(toggleMode, 120);

let MMD = null;
async function runMermaid(nodes, mode) {
  if (!MMD || !nodes || !nodes.length) return;
  try {
    MMD.initialize({
      startOnLoad: false,
      theme: mode === "night" ? "dark" : "neutral",
      securityLevel: "loose",
      fontFamily: getComputedStyle(document.body).fontFamily
    });
    await MMD.run({ nodes });
  } catch (e) { /* 图重画失败不该拖住换模式 */ }
}
async function loadMermaid() {
  try {
    await loadScript("/vendor/mermaid/mermaid.min.js");
    MMD = window.mermaid;
    const nodes = [...document.querySelectorAll(".mermaid-src")];
    nodes.forEach((n, i) => {
      n.classList.add("mermaid");
      n.id = "mmd-" + i;
      // mermaid.run 会把源码换成 SVG，换主题时要靠这一份重画
      n.dataset.src = n.innerHTML;
    });
    await runMermaid(nodes, currentMode());
  } catch (e) {
    document.querySelectorAll(".mermaid-src").forEach((n) => {
      n.insertAdjacentHTML("beforebegin", `<p style="font-size:12px;color:var(--ink-faint)">（示意图源码，mermaid 组件未加载）</p>`);
    });
  }
}
function renderMermaid(mode) {
  const nodes = [...document.querySelectorAll(".mermaid-src[data-src]")];
  if (!nodes.length) return;
  nodes.forEach((el) => {
    el.innerHTML = el.dataset.src;
    el.removeAttribute("data-processed");
  });
  runMermaid(nodes, mode);
}
/* 桌面外壳下发主题（走 desk-bridge.js，不经过本页的 toggleMode）：补齐示意图重画这一副作用。
   没有 .mermaid-src 的页面 renderMermaid 自己判空返回；页内那颗按钮仍是原路（带 toast）。 */
document.addEventListener("desk:applymode", (e) => {
  try { renderMermaid(e.detail && e.detail.mode); } catch (err) { /* 图重画失败不该拖住换色 */ }
});

/* ------------------------------------------------------------ 右侧竖向导航
   回桌面 / 回上一级 / 回顶端。这三件半途想做的事，页面上原本要滚到顶部（面包屑）
   或滚到底（页脚）才够得着，所以钉在右边常驻。
   「上一级」= 文章 → 章节页；延伸页不在 332 篇里、没有章节目录，退回来源页。 */
function initRail() {
  const rail = $("rail");
  if (!rail) return;
  const top = $("rail-top");

  $("rail-home").addEventListener("click", () => { location.href = DESK_HOME; });

  $("rail-up").addEventListener("click", () => {
    if (CUR && CUR.code && !CUR.supplementary) location.href = "/chapter.html?c=" + CUR.code;
    else if (history.length > 1) history.back();
    else location.href = DESK_HOME;
  });

  top.addEventListener("click", () => {
    // 系统开了「减弱动态效果」就别平滑滚动 —— 那种设置下平滑滚动本身就让人不适
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });

  // 下面两颗是阅读偏好，不是导航：状态一开始就和 bootstrap 对齐
  const modeBtn = $("rail-mode");
  if (modeBtn) {
    modeBtn.setAttribute("aria-pressed", currentMode() === "night" ? "true" : "false");
    modeBtn.addEventListener("click", switchMode);
  }
  const sizeBtn = $("rail-size");
  if (sizeBtn) sizeBtn.addEventListener("click", cycleSize);

  // 已经在顶端时收起「回顶端」，别让它永远占着一个位置
  const sync = () => {
    const atTop = window.scrollY < 240;
    rail.classList.toggle("at-top", atTop);
    top.setAttribute("aria-hidden", atTop ? "true" : "false");
    top.tabIndex = atTop ? -1 : 0;
  };
  let raf = 0;
  window.addEventListener("scroll", () => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); });
  }, { passive: true });
  sync();
}

initRail();
render();
