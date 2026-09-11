// 构建管线：JavaGuide 仓库 docs/*.md → public/content/*.html
//
// 关键点：**站内链接一律本地化**。
//   · 先把 docs 下所有 md 建成索引（路径索引 + 文件名索引）
//   · 链接解析用 posix.normalize 真规范化（旧版用字符串 replace，`./`、`../` 处理不全）
//   · 规范化后查不到时按文件名兜底（原站改版把文章挪过目录）
//   · URL 解码（%E5%9F%BA…）、无扩展名（…/https-rsa-vs-ecdhe）、目录链（…/xxx/ → xxx/README.html）
//   · 330 篇之外的页面一并渲染成"延伸页"，否则链接无落点
//   · 锚点先校验再落地：目标页没有该 id 就去掉 hash，避免点了不动
//
// 用法：node build-content.js
const fs = require("fs");
const path = require("path");
const posix = path.posix;
const md = require("markdown-it")({ html: true, linkify: true, typographer: false });
const anchor = require("markdown-it-anchor");
const container = require("markdown-it-container");
const hljs = require("highlight.js");

const REPO = process.env.JAVAGUIDE_REPO || "C:/tmp/JavaGuide/docs";
const OUT = path.join(__dirname, "public", "content");
const IMG_MAP_FILE = path.join(__dirname, "data", "image-map.json");
const META_FILE = path.join(__dirname, "data", "articles-meta.json");

// .vuepress 是站点配置；snippets 是被 include 的片段，不是独立页面
const SKIP_DIRS = new Set([".vuepress", ".git", "node_modules", "snippets"]);

const slug = (s) => String(s).trim().toLowerCase()
  .replace(/[\s]+/g, "-")
  .replace(/[^\w\u4e00-\u9fff-]/g, "")
  .replace(/-+/g, "-") || "sec";

md.use(anchor, { slugify: slug, uniqueSlugStartIndex: 2, permalink: false });
for (const t of ["tip", "warning", "danger", "info", "center", "right", "details"]) {
  md.use(container, t, {
    render(tokens, idx) {
      if (tokens[idx].nesting === 1) {
        const title = tokens[idx].info.trim().slice(t.length).trim();
        return `<div class="md-c md-c-${t}">${title && t !== "center" && t !== "right" ? `<p class="md-c-title">${md.utils.escapeHtml(title)}</p>` : ""}`;
      }
      return "</div>";
    },
  });
}

md.renderer.rules.fence = (tokens, idx) => {
  const t = tokens[idx];
  const code = t.content;
  if (t.info.trim().split(/\s+/)[0] === "mermaid") {
    return `<div class="md-mermaid"><pre class="mermaid-src">${md.utils.escapeHtml(code)}</pre></div>\n`;
  }
  const lang = t.info.trim().split(/\s+/)[0];
  let html;
  if (lang && hljs.getLanguage(lang)) html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  else { const a = hljs.highlightAuto(code); html = a.value; }
  return `<pre class="md-pre"><code class="hljs">${html}</code></pre>\n`;
};
md.renderer.rules.code_block = md.renderer.rules.fence;

// ---------------------------------------------------------------- 图片本地化
// 文件名由 URL 决定（可读前缀 + URL 短哈希），不再用递增序号：
// 序号命名会导致「换了遍历顺序 → 整个 img 目录错位」，且重建后要全量重下。
const crypto = require("crypto");
const imgMap = {}; // url -> local path
function imgName(url) {
  const clean = String(url).replace(/[?#].*$/, "");
  const ext = (clean.match(/\.(png|jpe?g|webp|gif|svg)$/i) || [, "png"])[1].toLowerCase();
  let base = posix.basename(clean).replace(/\.[^.]*$/, "");
  try { base = decodeURIComponent(base); } catch (e) { /* 保持原样 */ }
  base = base.replace(/[^\w\u4e00-\u9fff-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "img";
  const h = crypto.createHash("sha1").update(String(url)).digest("hex").slice(0, 8);
  return base + "-" + h + "." + ext;
}
function localImg(url) {
  if (imgMap[url]) return imgMap[url];
  return (imgMap[url] = "/img/" + imgName(url));
}

// ---------------------------------------------------------------- 全仓页面索引
function walkMd(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(p, acc);
    else if (/\.md$/i.test(e.name) && !/\.snippet\.md$/i.test(e.name)) {
      acc.push(path.relative(REPO, p).replace(/\\/g, "/"));
    }
  }
  return acc;
}
const ALL_MD = walkMd(REPO);
const PAGE_SET = new Set(ALL_MD.map((m) => m.replace(/\.md$/i, ".html")));
const BASE_INDEX = new Map(); // 文件名(无扩展名) -> [htmlRel...]
for (const m of ALL_MD) {
  const b = posix.basename(m).replace(/\.[^.]+$/, "");
  if (!BASE_INDEX.has(b)) BASE_INDEX.set(b, []);
  BASE_INDEX.get(b).push(m.replace(/\.md$/i, ".html"));
}

// 同名文件时挑路径前缀最接近的那个
function pickByBase(base, wantRel) {
  const list = BASE_INDEX.get(base);
  if (!list || !list.length) return null;
  if (list.length === 1) return list[0];
  const want = wantRel.split("/");
  let best = null, bestScore = -1;
  for (const c of list) {
    const seg = c.split("/");
    let s = 0;
    while (s < seg.length - 1 && s < want.length - 1 && seg[s] === want[s]) s++;
    if (s > bestScore || (s === bestScore && best && c.length < best.length)) { best = c; bestScore = s; }
  }
  return best;
}

// ---------------------------------------------------------------- 站内链接解析
const JG_HOST = /^https?:\/\/(?:[a-z0-9-]+\.)*javaguide\.cn(?=[/?#]|$)/i;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
// 原站已改版、旧地址在新仓库里找不到的少量链接，手工指到现在的落点
// （面试题库 interview.javaguide.cn 是另一套站点，这里指到主站里最接近的页面）
const ALIASES = new Map([
  ["distributed-system/rpc/http&rpc.html", "cs-basics/network/http-vs-rpc.html"],
  ["java/java-jvm.html", "java/jvm/README.html"],
  ["java/java-new-features.html", "java/new-features/README.html"],
  ["system-design/spring.html", "system-design/framework/spring/README.html"],
  ["system-design/security-interview-questions.html", "system-design/security/README.html"],
  ["system-design/authentication-and-authorization-interview-questions.html", "system-design/security/README.html"],
]);

// 把「站点路径 / 相对路径」解析成本地 htmlRel；解析不到返回 null
function resolveToPage(raw, ctxDir) {
  let p = String(raw || "");
  if (!p) return null;
  let hash = "";
  const hi = p.search(/[#?]/);
  if (hi >= 0) {
    const rest = p.slice(hi);
    p = p.slice(0, hi);
    if (rest.startsWith("#")) hash = rest.slice(1);
    else { const h2 = rest.indexOf("#"); if (h2 >= 0) hash = rest.slice(h2 + 1); }
  }
  if (!p) return null; // 站点根
  try { p = decodeURIComponent(p); } catch (e) { /* 保持原样 */ }
  p = p.replace(/&amp;/g, "&").replace(/\\/g, "/");
  const isAbs = p.startsWith("/");
  const trailing = /\/$/.test(p);
  let rel = posix.normalize(isAbs ? p.slice(1) : posix.join(ctxDir || "", p));
  if (rel === "." || rel === "") return trailing || isAbs ? "ROOT" : null;
  if (trailing) rel = posix.join(rel, "README.html");

  const cands = [];
  if (/\.md$/i.test(rel)) cands.push(rel.replace(/\.md$/i, ".html"));
  else if (/\.html?$/i.test(rel)) cands.push(rel, rel.replace(/\.html?$/i, "/README.html"));
  else cands.push(rel + ".html", posix.join(rel, "README.html"), rel);
  for (const c of cands) if (PAGE_SET.has(c)) return c;

  if (ALIASES.has(rel)) return ALIASES.get(rel);

  const base = posix.basename(rel).replace(/\.[a-z0-9]{1,6}$/i, "");
  if (base && base.toLowerCase() !== "readme") {
    const hit = pickByBase(base, rel);
    if (hit) return hit;
  }
  return null;
}

// 站点 URL / 站点路径 → 本地页面；真外链返回 null
function siteResolve(urlOrPath, ctxDir) {
  const s = String(urlOrPath || "");
  if (JG_HOST.test(s)) return resolveToPage(s.replace(JG_HOST, ""), ctxDir || "");
  if (EXTERNAL.test(s)) return null;
  return resolveToPage(s, ctxDir || "");
}

// 整条链接的重写：返回 { href, ext, page, droppedHash }
function rewriteLink(href, ctxDir) {
  if (!href) return { href, ext: false };
  if (/^(mailto:|javascript:|tel:|data:|#)/i.test(href)) return { href, ext: false };
  let target = null;
  if (JG_HOST.test(href)) {
    const rest = href.replace(JG_HOST, "");
    if (!rest || /^[?#]/.test(rest)) return { href: "/" + rest, ext: false, page: true }; // 站点根 → 桌面
    target = resolveToPage(rest, ""); // 站内绝对：忽略相对上下文
  } else if (EXTERNAL.test(href)) {
    return { href, ext: true }; // 真外链
  } else {
    target = resolveToPage(href, ctxDir); // 站内相对
  }
  if (target === "ROOT") return { href: "/", ext: false, page: true };
  if (!target) {
    stat.unresolved++;
    // 本来就是绝对地址（含 javaguide.cn 上没有的页）：原样外链
    if (EXTERNAL.test(href)) return { href, ext: true };
    // 站内相对但解析不到：拼回原站地址，别指向不存在的本地文件
    const [p0, h0] = href.split("#");
    const site = posix.normalize(posix.join(ctxDir || "", p0.replace(/[?#].*$/, "")));
    return { href: "https://javaguide.cn/" + site + (h0 ? "#" + h0 : ""), ext: true };
  }
  let hash = "";
  const hi = href.indexOf("#");
  if (hi >= 0) hash = href.slice(hi + 1);
  const fixed = fixHash(target, hash, ctxDir);
  return { href: "/read/" + target + (fixed ? "#" + fixed : ""), ext: false, page: true, droppedHash: !!hash && !fixed };
}

// 锚点校验：目标页没这个 id 就退掉（能对上就用目标页真实 id）
let hashFixed = 0, hashDropped = 0;
function fixHash(pageRel, hash, ctxDir) {
  if (!hash) return "";
  let h = hash;
  try { h = decodeURIComponent(h); } catch (e) { /* 保持原样 */ }
  const ids = ANCHORS.get(pageRel);
  if (!ids || !ids.size) return h;
  if (ids.has(h)) return h;
  const low = h.toLowerCase();
  for (const id of ids) if (id.toLowerCase() === low) { hashFixed++; return id; }
  const s = slug(h);
  if (ids.has(s)) { hashFixed++; return s; }
  hashDropped++;
  return "";
}
const ANCHORS = new Map(); // pageRel -> Set(id)

// ---------------------------------------------------------------- 链接渲染规则
const origLink = md.renderer.rules.link_open || ((t, i, o, _s, r) => r.renderToken(t, i, o));
let stat = { internal: 0, external: 0, unresolved: 0 };
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href") || "";
  const r = rewriteLink(href, env.ctxDir || "");
  tokens[idx].attrSet("href", r.href);
  if (r.ext || /^https?:/i.test(r.href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener");
    stat.external++;
  } else {
    stat.internal++;
  }
  return self.renderToken(tokens, idx, options);
};
const origImage = md.renderer.rules.image || ((t, i, o, _s, r) => r.renderToken(t, i, o));
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const src = tokens[idx].attrGet("src") || "";
  if (/^https?:\/\/oss\.javaguide\.cn/.test(src)) tokens[idx].attrSet("src", localImg(src));
  else if (/^https?:\/\//.test(src)) tokens[idx].attrSet("src", src);
  tokens[idx].attrSet("loading", "lazy");
  return self.renderToken(tokens, idx, options);
};

// ---------------------------------------------------------------- 正文预处理
function stripFrontmatter(s) {
  const m = s.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { body: s, title: null };
  const title = (m[1].match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || null;
  return { body: s.slice(m[0].length), title };
}
function stripHtmlLinks(body) {
  return body.replace(/<img\s+([^>]*?)src="([^"]+)"([^>]*?)\/?>/gi, (all, a, src, b) => {
    if (/^https?:\/\/oss\.javaguide\.cn/.test(src)) return `<img src="${localImg(src)}" loading="lazy" ${a}${b}>`;
    return all;
  });
}
function renderBody(body, ctxDir) {
  return md.render(stripHtmlLinks(body), { ctxDir });
}
function collectHeadings(rendered) {
  const out = [];
  const re = /<h([23])(?:\s+id="([^"]*)")?[^>]*>([\s\S]*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(rendered))) {
    const text = m[3].replace(/<[^>]+>/g, "").trim();
    out.push({ level: Number(m[1]), text, id: m[2] || slug(text) });
  }
  return out;
}
function collectIds(rendered) {
  const set = new Set();
  const re = /\sid="([^"]+)"/g;
  let m;
  while ((m = re.exec(rendered))) set.add(m[1]);
  return set;
}
const minsOf = (body) => {
  const words = (body.match(/[\u4e00-\u9fff]/g) || []).length + (body.match(/[A-Za-z0-9_]+/g) || []).length;
  return Math.max(1, Math.round(words / 420));
};

// ---------------------------------------------------------------- 主流程
function main() {
  const chapters = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "chapters.json"), "utf8"));
  const t0 = Date.now();

  // 先读入全部源文件，避免重复 IO
  const SRC = new Map(); // mdRel -> { body, title }
  for (const rel of ALL_MD) {
    const abs = path.join(REPO, rel);
    const raw = fs.readFileSync(abs, "utf8");
    const { body, title } = stripFrontmatter(raw);
    SRC.set(rel, { body, title });
  }

  // ---- 第 1 遍：只为收集锚点 id（同时把图片全登记进 image-map）
  for (const [rel] of SRC) {
    const htmlRel = rel.replace(/\.md$/i, ".html");
    const rendered = renderBody(SRC.get(rel).body, posix.dirname(rel) === "." ? "" : posix.dirname(rel));
    ANCHORS.set(htmlRel, collectIds(rendered));
  }

  // ---- 第 2 遍：正式渲染
  stat = { internal: 0, external: 0, unresolved: 0 };
  hashFixed = 0; hashDropped = 0;
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const meta = [];
  const usedPages = new Set();

  const emit = (rel, extra) => {
    const htmlRel = rel.replace(/\.md$/i, ".html");
    const { body, title } = SRC.get(rel);
    const ctxDir = posix.dirname(rel) === "." ? "" : posix.dirname(rel);
    const rendered = renderBody(body, ctxDir);
    const file = path.join(OUT, htmlRel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, rendered);
    usedPages.add(htmlRel);
    return { title, headings: collectHeadings(rendered), mins: minsOf(body), out: "/read/" + htmlRel };
  };

  // 2a. 目录里的 332 篇
  for (const c of chapters) {
    for (const a of c.articles) {
      const rel = siteResolve(a.url, "");
      if (!rel || rel === "ROOT" || !SRC.has(rel.replace(/\.html$/, ".md"))) {
        meta.push({ ...a, chapter: c.name, code: c.code, local: false });
        continue;
      }
      const r = emit(rel.replace(/\.html$/, ".md"), null);
      meta.push({
        id: a.id, title: r.title || a.title, chapter: c.name, code: c.code, group: a.group,
        out: r.out, mins: r.mins, headings: r.headings, local: true,
      });
    }
  }

  // 2b. 其余全部页面 → 延伸页（站内链有落点，才谈得上"内部跳转"）
  for (const rel of ALL_MD) {
    const htmlRel = rel.replace(/\.md$/i, ".html");
    if (usedPages.has(htmlRel)) continue;
    const r = emit(rel, null);
    meta.push({
      id: "x-" + htmlRel, title: r.title || posix.basename(rel).replace(/\.md$/i, ""),
      chapter: "延伸页", code: "", group: "", out: r.out, mins: r.mins,
      headings: r.headings, local: true, supplementary: true,
    });
  }

  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 1));
  fs.writeFileSync(IMG_MAP_FILE, JSON.stringify(imgMap, null, 1));

  // ---- 自检
  const badRoute = meta.filter((m) => m.local && !/^\/read\/[\w\-./\u4e00-\u9fff]+\.html$/.test(m.out));
  const articles = meta.filter((m) => !m.supplementary);
  console.log(`渲染完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  章节目录 ${articles.length} 篇（本地化 ${articles.filter((m) => m.local).length} / 外链 ${articles.filter((m) => !m.local).length}）`);
  console.log(`  延伸页 ${meta.filter((m) => m.supplementary).length} 篇`);
  console.log(`  链接：本地化 ${stat.internal} 次 / 外链 ${stat.external} 次（其中站内解析不到 ${stat.unresolved} 次）`);
  console.log(`  锚点：修正 ${hashFixed} 个 / 丢弃 ${hashDropped} 个`);
  console.log(`  图片 ${Object.keys(imgMap).length} 张`);
  if (badRoute.length) console.log(`  ⚠ ${badRoute.length} 个路径可能不被 /read/ 路由匹配：`, badRoute.slice(0, 5).map((m) => m.out));
}
main();
