/* 小抄 URL 语义：/index.html、/chapter.html?c=xx、/read/<path>.html 三种入口
   在「窗口内标签」与「全页路由」两个宿主里共用同一套解析。 */

export function safeHref(h) {
  if (typeof h !== "string" || h.charAt(0) !== "/" || h.slice(0, 2) === "//") return null;
  return h;
}

export function toURL(href) {
  try { return new URL(href, location.origin); } catch { return null; }
}

export function isNotebookHref(href) {
  const u = toURL(href);
  if (!u) return false;
  return u.pathname === "/index.html" || u.pathname === "/chapter.html"
    || (u.pathname.startsWith("/read/") && u.pathname.endsWith(".html"))
    || u.pathname === "/";
}

export function appOfHref(href) {
  return String(href || "").indexOf("/jbl/") === 0 ? "jbl" : "javaguide";
}

/* 标签页 URL → 小抄视图。返回 null 表示不是小抄页面。 */
export function parseNotebookUrl(href) {
  const u = toURL(href);
  if (!u) return null;
  if (u.pathname === "/" || u.pathname === "/index.html") return { view: "home" };
  if (u.pathname === "/chapter.html") return { view: "chapter", code: (u.searchParams.get("c") || "01").padStart(2, "0") };
  if (u.pathname.startsWith("/read/")) {
    let p = u.pathname;
    try { p = decodeURIComponent(p); } catch { /* 保持原样 */ }
    return { view: "read", path: p };
  }
  return null;
}

/* 当前标签页属于哪一章：chapter.html 直接拿 c；/read/ 路径靠 /api/desk 的 routes 反查 */
export function chapterOf(href, routes) {
  const u = toURL(href);
  if (!u) return null;
  const c = u.searchParams.get("c");
  if (c) return c;
  if (routes) {
    const code = routes[u.pathname];
    if (code) return code;
  }
  return null;
}

export function shortTitle(t) {
  let s = (t && (t.title || t.url)) || "";
  s = String(s).replace(/^https?:\/\/[^/]+/, "") || "（无标题）";
  return s.length > 26 ? s.slice(0, 25) + "…" : s;
}

export function fmtWhen(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d)) return "";
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
