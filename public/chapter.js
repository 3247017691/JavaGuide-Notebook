const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const CODE = (params.get("c") || "01").padStart(2, "0");
let DATA = null;

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function titleHtml(t) { return esc(t).replace(/⭐/g, '<span class="star">★</span>'); }
function fmt(s) {
  const d = new Date(s); if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2400);
}

/* 小节进度 → 朱线画多长：整篇读完画满，读了一半就只画一半。
   悬浮目录里划掉的小节，在这页直接看得见长度。 */
function secInfo(it) {
  const st = it.sectionsTotal || 0;
  if (!st) return null;                       // 付费/无正文篇：没有小节可划
  const sr = Math.min(it.sectionsRead || 0, st);
  const full = !!it.read;
  // 「有进度但没盖章」的判定必须与另外三处**完全同源**：
  //   · 服务端 /api/overview 的 partial、/api/chapters/:code 的 partial
  //   · 首页 .card-secs 的「半读 N 篇」
  //   · 本页分组统计 gStat()
  // 一律是 !read && sr > 0。谁也别自己发明第二个条件 —— 之前首页刻度就是多加了
  // 一条 sr >= st 才算已读，结果同一张卡上三种说法。
  return { st, sr: full ? st : sr, p: full ? 1 : sr / st, part: !full && sr > 0 };
}

function entryHtml(it) {
  const href = it.local ? it.local : it.url;
  // 整行 = 跳转；右侧按钮 = 标记已读（两件事分开，别让人想翻页却划了线）
  const target = it.local ? "" : ' target="_blank" rel="noopener"';
  const openTip = it.local ? "翻开这篇小抄" : "打开原文 ↗";
  const s = secInfo(it);
  const cls = ["entry"];
  if (it.read) cls.push("read");
  else if (s && s.part) cls.push("part");
  // 只在真有进展时报数：一节都没划的进度是纯噪音，会占满每一行。
  // 元素总是在 DOM 里（空壳 + .is-off），这样标记已读时能就地填上，不用重绘整行。
  const on = !!(s && s.sr > 0);
  const chip = s
    ? `<span class="entry-secs${on ? "" : " is-off"}" title="悬浮目录里已划掉 ${s.sr} / ${s.st} 节">${on ? `${s.sr}/${s.st} 节` : ""}</span>`
    : "";
  return `<li class="${cls.join(" ")}" data-id="${it.id}" style="--secp:${s ? s.p.toFixed(3) : 0}">
    <a class="entry-link" href="${esc(href)}"${target} title="${openTip}">
      <span class="hole" aria-hidden="true">阅</span>
      <span class="entry-title">${titleHtml(it.title)}</span>
      <span class="entry-meta">${chip}<span class="entry-when">${it.read && it.readAt ? fmt(it.readAt) : ""}</span></span>
    </a>
    <button class="entry-toggle" type="button" aria-pressed="${it.read ? "true" : "false"}"
      title="${it.read ? BTN.drop.title : BTN.add.title}">${it.read ? BTN.drop.text : BTN.add.text}</button>
  </li>`;
}

function done(g) { return g.items.filter((i) => i.read).length; }

/* 分组统计：已读篇数 / 总篇数，另附「读了一部分」的篇数 */
function gStat(g) {
  const part = g.items.filter((i) => !i.read && i.sectionsRead > 0).length;
  return `${done(g)}/${g.items.length}` + (part ? ` <em>· 半读 ${part}</em>` : "");
}

/* 右侧按钮只报"做了会怎样"，不报当前状态 —— 状态由穿孔/朱线/涂格三处形状承担 */
const BTN = {
  add: { text: "标记已读", title: "标记为已读" },
  drop: { text: "取消已读", title: "取消已读" },
};

function render() {
  document.title = `${DATA.name} · JavaGuide 离线小抄`;
  $("ch-title").textContent = DATA.name;
  $("ch-code").textContent = DATA.code;
  $("band").style.setProperty("--ch", chColor(DATA.code));
  document.documentElement.style.setProperty("--ch", chColor(DATA.code));
  $("groups").innerHTML = DATA.groups.map((g, gi) => `
    <h2 class="grp">${esc(g.group || "综合")}<span class="g-count" data-idx="${gi}">${gStat(g)}</span></h2>
    <ul class="entries">${g.items.map(entryHtml).join("")}</ul>`).join("");
  $("groups").querySelectorAll(".entry-toggle").forEach((btn) => {
    btn.addEventListener("click", () => toggle(btn.closest(".entry")));
  });
  renderScore();
}

function renderScore() {
  const all = DATA.groups.flatMap((g) => g.items);
  DATA.read = all.filter((i) => i.read).length;
  const pct = DATA.total ? Math.round((DATA.read / DATA.total) * 1000) / 10 : 0;
  // 小节级：整篇已读的篇，其小节必然全划（服务端联动保证），按 st 计更稳
  const secTotal = all.reduce((s, i) => s + (i.sectionsTotal || 0), 0);
  const secRead = all.reduce((s, i) => s + (i.read ? i.sectionsTotal || 0 : i.sectionsRead || 0), 0);
  const secPct = secTotal ? Math.round((secRead / secTotal) * 1000) / 10 : 0;
  $("ch-score").innerHTML = `已读 <b>${DATA.read}</b> / ${DATA.total} 篇 · 完成率 <span class="pct">${pct}%</span>` +
    (secTotal ? `<span class="score-secs">小节 <b>${secRead}</b> / ${secTotal} · ${secPct}%</span>` : "");
  $("ch-meta").style.setProperty("--p", DATA.total ? DATA.read / DATA.total : 0);
  $("groups").querySelectorAll(".g-count").forEach((el) => {
    const g = DATA.groups[Number(el.dataset.idx)];
    if (g) el.innerHTML = gStat(g);
  });
}

async function toggle(entry) {
  const id = entry.dataset.id;
  const item = DATA.groups.flatMap((g) => g.items).find((i) => i.id === id);
  const nowRead = !entry.classList.contains("read");
  // 存档以便失败时原样回退（item 会被乐观更新就地改掉）
  const before = { read: item.read, readAt: item.readAt, sectionsRead: item.sectionsRead, sectionsTotal: item.sectionsTotal };
  const st = item.sectionsTotal || 0;
  // 乐观更新：盖章会连带把这篇所有小节划掉，退章会清空
  applyRead(entry, item, nowRead, new Date().toISOString(), st ? { sectionsRead: nowRead ? st : 0, sectionsTotal: st } : null);
  try {
    const res = await fetch("/api/read", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: nowRead }),
    }).then((r) => r.json());
    if (res.error) throw new Error(res.error);
    applyRead(entry, item, res.read, res.readAt, { sectionsRead: res.sectionsRead, sectionsTotal: res.sectionsTotal });
    renderScore();
  } catch (e) {
    applyRead(entry, item, before.read, before.readAt, { sectionsRead: before.sectionsRead, sectionsTotal: before.sectionsTotal });
    renderScore();
    toast("划线未保存：" + e.message);
  }
}

function applyRead(entry, item, read, readAt, sec) {
  entry.classList.toggle("read", read);
  const btn = entry.querySelector(".entry-toggle");
  btn.setAttribute("aria-pressed", read ? "true" : "false");
  btn.title = read ? BTN.drop.title : BTN.add.title;
  btn.textContent = read ? BTN.drop.text : BTN.add.text;
  entry.querySelector(".entry-when").textContent = read && readAt ? fmt(readAt) : "";
  if (sec) { item.sectionsRead = sec.sectionsRead; item.sectionsTotal = sec.sectionsTotal; }
  item.read = read; item.readAt = read ? readAt : null;
  // 朱线长度 = 小节完成率；整篇读完才画满
  const s = secInfo(item);
  entry.style.setProperty("--secp", s ? s.p.toFixed(3) : 0);
  entry.classList.toggle("part", !read && !!(s && s.part));
  const chip = entry.querySelector(".entry-secs");
  if (chip && s) {
    chip.textContent = s.sr > 0 ? `${s.sr}/${s.st} 节` : "";
    chip.classList.toggle("is-off", s.sr === 0);
    chip.title = `悬浮目录里已划掉 ${s.sr} / ${s.st} 节`;
  }
}

async function bulk(read) {
  const msg = read
    ? `把「${DATA.name}」全部 ${DATA.total} 篇都标记为已读？`
    : `擦掉「${DATA.name}」的全部划线？`;
  if (!confirm(msg)) return;
  try {
    const res = await fetch("/api/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: DATA.code, read }),
    }).then((r) => r.json());
    if (res.error) throw new Error(res.error);
    await load();
    toast(read ? "整章已读" : "划线已擦除");
  } catch (e) { toast("操作失败：" + e.message); }
}

async function load() {
  let res;
  try {
    res = await fetch("/api/chapters/" + CODE).then((r) => r.json());
  } catch (e) {
    $("groups").innerHTML = `<p class="sheet-note">连不上本机数据库，这张卡上的格暂时读不出来。<br><a href="/">回桌面</a></p>`;
    return;
  }
  if (res.error) {
    $("groups").innerHTML = `<p class="sheet-note">${esc(res.error)}<br><a href="/">回桌面</a></p>`;
    return;
  }
  DATA = res;
  render();
}

/* 章切换器：选项按 /api/overview 填一次；选中项由 URL 决定。
   change 处理器会先改 select.value 再跳转，而这个被改过的表单状态会被浏览器
   一起快照进 bfcache —— 后退时页面从缓存恢复、本函数不再重跑，下拉框就停在
   用户选过的那一项（页面内容是 01、框里写着 05）。
   所以从 bfcache 恢复时必须把控件值拉回 URL 的真实状态。 */
function syncSwitcher() {
  const s = $("ch-switch");
  if (s && s.querySelector(`option[value="${CODE}"]`)) s.value = CODE;
}
async function initSwitcher() {
  try {
    const ov = await fetch("/api/overview").then((r) => r.json());
    if (!ov.chapters) return;
    $("ch-switch").innerHTML = ov.chapters.map((c) =>
      `<option value="${c.code}">${c.code} ${esc(c.name)}（${c.read}/${c.total}）</option>`).join("");
    syncSwitcher();
    $("ch-switch").addEventListener("change", (e) => (location.href = "/chapter.html?c=" + e.target.value));
  } catch { /* 增强项 */ }
}
window.addEventListener("pageshow", (e) => { if (e.persisted) syncSwitcher(); });

$("btn-all-read").addEventListener("click", () => bulk(true));
$("btn-clear").addEventListener("click", () => bulk(false));
load();
initSwitcher();
