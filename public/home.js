/* 首页 · 桌面上的卡阵
   版面由「篇幅」决定：70 篇的 Java 拿 6×2 格，8 篇的高可用拿 2×1 格。
   --col / --row 用固定表给出，保证 5 行每行都刚好填满 12 列，且章节顺序不乱。 */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* 12 章时的版面表（下标 = 章序 01..12）。总和每行正好 12 列。 */
const PLACEMENT = [
  { col: 2, row: 1 }, { col: 6, row: 2 }, { col: 4, row: 2 }, { col: 2, row: 1 },
  { col: 4, row: 1 }, { col: 2, row: 1 }, { col: 2, row: 1 }, { col: 4, row: 1 },
  { col: 2, row: 1 }, { col: 6, row: 2 }, { col: 4, row: 2 }, { col: 2, row: 1 },
];
const SIZE = { 6: "xl", 4: "md", 2: "sm" };
/* 折角随完成率长大：[初值, 满进度再加多少]。上限同时受卡片宽度约束 */
const FOLD = { xl: [30, 30], md: [26, 24], sm: [18, 12] };

function placementFor(i, n) {
  if (n === 12) return PLACEMENT[i];
  return { col: 3, row: 1 };   // 章节数变了就退回等宽四列，不留空洞
}

function fmtWhen(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* 总评刻度尺：12 段，段宽 = 该章篇数，填充 = 该章完成率 */
function renderTape(chapters) {
  $("tape").innerHTML = chapters.map((c) =>
    `<i style="--n:${Math.max(1, c.total)};--f:${(c.read / Math.max(1, c.total)).toFixed(4)}"
        title="${esc(c.name)} ${c.read}/${c.total}"></i>`).join("");
}

function renderScore(ov) {
  $("ov-read").textContent = ov.read;
  $("ov-total").textContent = ov.total;
  $("ov-pct").textContent = ov.pct.toFixed(1) + "%";
  $("ov-pct").title = `整篇 ${ov.read}/${ov.total} · 小节 ${ov.sectionsRead}/${ov.sectionsTotal}`;
  const when = ov.lastReadAt ? "最近批阅 " + fmtWhen(ov.lastReadAt) : "还没有批阅记录";
  // 小节进度并进同一行，不额外占版面
  $("ov-when").textContent = ov.sectionsTotal ? `${when} · 小节 ${ov.sectionsRead}/${ov.sectionsTotal}` : when;
}

/* 刻度三态：一篇一道。
   on  = 整篇读完（落深墨）
   mid = 读了一部分（按小节完成率从下往上涂，像个微进度条）
   off = 没碰过（章色淡底）
   这样悬浮目录里划掉的小节，会立刻在这儿显出"半墨"。
   判定只认 x.r（服务端给的整篇已读）。**别再拿 sr >= st 当第二条件** ——
   那会让刻度落墨、而 card-count 和 .card-secs 不认这一篇，同一张卡上三种说法。 */
function tickHtml(x) {
  if (x.r) return '<i class="on"></i>';
  if (x.st && x.sr > 0) return `<i class="mid" style="--f:${(x.sr / x.st).toFixed(3)}"></i>`;
  return "<i></i>";
}

function cardHtml(c, i, n) {
  const { col, row } = placementFor(i, n);
  const size = SIZE[col] || "md";
  const [base, extra] = FOLD[size];
  const pct = c.total ? c.read / c.total : 0;
  const fold = Math.round(base + pct * extra);
  const done = c.total > 0 && c.read === c.total;

  const ticks = Array.isArray(c.items)
    ? c.items.map(tickHtml).join("")
    : Array.from({ length: c.total }, (_, k) => `<i class="${k < c.read ? "on" : ""}"></i>`).join("");

  // 「读了一部分」的篇 + 全章已划小节 —— 只在真有半读篇时才补这一行
  // （否则与上面的篇数说的是同一件事，纯属重复）
  const secs = c.partial > 0 && c.secTotal
    ? `<span class="card-secs" title="有 ${c.partial} 篇的小节读了一部分（还没盖整篇章）；全章共划掉 ${c.secRead} / ${c.secTotal} 节">半读 <b>${c.partial}</b> 篇 · 已划 <b>${c.secRead}</b>/${c.secTotal} 节</span>`
    : "";

  return `<a class="card${done ? " done" : ""}" data-size="${size}" data-rows="${row}"
      style="--col:${col};--row:${row};--ch:${chColor(c.code)};--foldpx:${fold}px;--i:${i}"
      href="/chapter.html?c=${c.code}"
      aria-label="${esc(c.name)}，已读 ${c.read} / ${c.total} 篇，完成 ${c.pct.toFixed(1)}%${c.partial ? `，另有 ${c.partial} 篇读了一部分` : ""}">
    <span class="card-paper">
      <span class="fold" aria-hidden="true"></span>
      <span class="card-head">
        <span class="card-code">${c.code}</span>
        <span class="card-name">${esc(c.name)}</span>
      </span>
      <span class="card-blurb">${esc(c.blurb || "")}</span>
      <span class="card-tail">
        <span class="card-ticks" aria-hidden="true">${ticks}</span>
        ${secs}
        <span class="card-foot">
          <span class="card-count"><b>${c.read}</b><i>/</i>${c.total}</span>
          <span class="card-pct">${c.pct.toFixed(1)}%</span>
        </span>
      </span>
      <span class="card-stamp" aria-hidden="true">背完</span>
    </span>
  </a>`;
}

async function load() {
  let ov, rd;
  try {
    [ov, rd] = await Promise.all([
      fetch("/api/overview").then((r) => r.json()),
      fetch("/api/reads").then((r) => r.json()),
    ]);
  } catch (e) {
    fail("连不上本机数据库，进度暂时读不出来。", e);
    return;
  }
  if (ov.error) { fail(ov.error); return; }

  const deck = $("deck");
  deck.removeAttribute("aria-busy");
  renderScore(ov);
  renderTape(ov.chapters);
  deck.innerHTML = ov.chapters.map((c, i) => cardHtml(c, i, ov.chapters.length)).join("");
  document.documentElement.dataset.ready = "1";
}

function fail(msg, err) {
  if (err) console.error(err);
  const deck = $("deck");
  deck.removeAttribute("aria-busy");
  deck.innerHTML = `<p class="deck-note">${esc(msg)}<br><a href="/">重新翻一次</a> · 若服务器没在跑，先执行 <b>npm start</b></p>`;
  $("ov-pct").textContent = "—";
  $("ov-when").textContent = "记录本没打开";
}

load();
