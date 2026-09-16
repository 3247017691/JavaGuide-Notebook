/* 桌面外壳的数据层：目录（/api/desk）与全局搜索语料（/api/search）。
   都从磁盘上的构建产物来，与数据库无关 —— MySQL 没起来外壳照样能导航、能搜索。 */
const fs = require("fs");
const path = require("path");

function loadJblData() {
  try {
    const src = fs.readFileSync(path.join(__dirname, "..", "JBL火箭题库", "data.js"), "utf8");
    const a = src.indexOf("{");
    const b = src.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    const d = JSON.parse(src.slice(a, b + 1));
    return d && Array.isArray(d.chapters) ? d : null;
  } catch (e) {
    console.error("[desk] 题库目录解析失败，全局搜索将只覆盖小抄：", e.code || "", e.message);
    return null;
  }
}

/* 搜索语料一次构建、进程存活期内复用；body 只取前 2000 字。 */
function buildSearchDocs(meta, jbl) {
  const docs = [];
  for (const m of meta) {
    if (!m.local) continue;
    docs.push({
      app: "javaguide", id: m.id, title: m.title,
      sub: [m.chapter, m.group].filter(Boolean).join(" · "),
      url: m.out, kind: m.supplementary ? "延伸页" : m.mins ? m.mins + " 分钟" : "",
      head: (m.headings || []).map((h) => h.text).join(" "), body: "",
    });
  }
  if (jbl) {
    for (const c of jbl.chapters) {
      (c.questions || []).forEach((q, qi) => {
        docs.push({
          app: "jbl", id: q.id, title: q.title,
          sub: "SYS-" + String(c.i).padStart(2, "0") + " · " + c.title,
          url: "/jbl/chapter.html?c=" + c.i + "&q=" + (qi + 1), kind: "检查项",
          head: c.code || "", body: String(q.plain || "").replace(/\s+/g, " ").slice(0, 2000),
        });
      });
    }
  }
  for (const d of docs) {
    d.titleLower = d.title.toLowerCase();
    d.subLower = d.sub.toLowerCase();
    d.headLower = d.head.toLowerCase();
    d.bodyLower = d.body.toLowerCase();
  }
  return docs;
}

// 摘要：围绕首个命中位置取一段，前端按关键词高亮（服务端不拼 HTML，避免注入面）
function makeSnip(body, pos, radius = 44) {
  const s = Math.max(0, pos - radius);
  const e = Math.min(body.length, pos + radius * 2);
  return (s > 0 ? "…" : "") + body.slice(s, e) + (e < body.length ? "…" : "");
}

function buildContext() {
  const META = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "articles-meta.json"), "utf8"));
  const OUT_BY_ID = new Map(META.filter((m) => m.local).map((m) => [m.id, m.out]));
  const JBL_DATA = loadJblData();
  const SEARCH_DOCS = buildSearchDocs(META, JBL_DATA);

  const jg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "chapters.json"), "utf8"));
  const DESK_TOC = {
    javaguide: {
      name: "JavaGuide 离线小抄",
      total: jg.reduce((s, c) => s + c.articles.length, 0),
      chapters: jg.map((c) => ({
        code: c.code, name: c.name, blurb: c.blurb || "",
        count: c.articles.length, href: "/chapter.html?c=" + c.code,
      })),
      // 正文页 → 章号：侧栏要在 /read/xxx.html 上把当前章高亮，URL 里没有章号，压成一张表
      routes: META.reduce((acc, m) => {
        if (m.local && m.out && m.code && !m.supplementary) acc[m.out.split("#")[0]] = m.code;
        return acc;
      }, {}),
    },
    jbl: JBL_DATA ? {
      name: "JBL 火箭题库",
      total: JBL_DATA.meta.total,
      chapters: JBL_DATA.chapters.map((c) => ({
        code: c.code, name: c.title, blurb: c.intro || "",
        count: (c.questions || []).length, href: "/jbl/chapter.html?c=" + c.i,
      })),
    } : { name: "JBL 火箭题库", total: 0, chapters: [] },
  };

  // 只处理「本地正式篇」：延伸页不计进度；无小节篇不参与联动
  const SECTIONS = new Map();
  for (const m of META) {
    if (!m.local || m.supplementary) continue;
    SECTIONS.set(m.id, (m.headings || []).map((h) => h.id));
  }
  const sectionsOf = (id) => SECTIONS.get(id) || [];

  return { META, OUT_BY_ID, DESK_TOC, SEARCH_DOCS, sectionsOf, makeSnip };
}

module.exports = { buildContext };
