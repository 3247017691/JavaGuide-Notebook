#!/usr/bin/env node
/* 面试工作台 · 提交前预检（本项目的「CI」）
   ---------------------------------------------------------------------------
   本项目是离线单机应用（依赖本机 MySQL、没有云、仓库 265MB），不适合云 CI。
   所以「CI」= 本地一条命令跑完所有能自动查的闸，绿灯了再提交 / 再推远端。

   用法：
     node tools/preflight.mjs                    # 全跑（含前端构建）
     node tools/preflight.mjs --skip-build       # 跳过 vite build（快速跑其余闸）
     node tools/preflight.mjs --static           # 离线静态：不构建、不连服务、不开浏览器（git 钩子用这个）
     node tools/preflight.mjs --url http://127.0.0.1:3000
     node tools/preflight.mjs --e2e              # 追加上无头浏览器验证（需要本机 Chrome）
     node tools/preflight.mjs --json             # 机器可读输出
     node tools/preflight.mjs --selftest         # 只验它自己的解析器（不碰项目）

   为什么要有 --static：
     git 的 pre-commit 钩子里**不能**要求服务在跑 —— 否则「没起服务」这件事会让每条提交都失败，
     一条永远红的闸等于没有闸，只会训练人用 --no-verify 跳过它。
     所以 --static 只跑「不依赖运行时」的闸（B 产物 / C 内容 / D 注册表 / F 报告），
     服务与浏览器那两闸显式标为跳过（而不是失败）。

   退出码：0 = 全绿；1 = 有闸未过（WARN 不阻断，只提示）
   --------------------------------------------------------------------------- */
import fs from "node:fs";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const STATIC = has("--static");
const SKIP_BUILD = has("--skip-build") || STATIC;
const E2E = has("--e2e") && !STATIC;
const AS_JSON = has("--json");
const BASE = valOf("--url", process.env.PREFLIGHT_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const CHROME = valOf("--chrome", "C:/Program Files/Google/Chrome/Application/chrome.exe");

/* ---------------------------------------------------------------- 报告器 */
const results = [];
let gate = "";
const G = (g) => { gate = g; };
function rec(level, name, detail) { results.push({ gate, level, name, detail: detail || "" }); }
const pass = (n, d) => { rec("PASS", n, d); if (!AS_JSON) console.log("  \x1b[32m✓\x1b[0m " + n + (d ? "  \x1b[2m" + d + "\x1b[0m" : "")); };
const fail = (n, d) => { rec("FAIL", n, d); if (!AS_JSON) console.log("  \x1b[31m✗\x1b[0m " + n + (d ? "  " + d : "")); };
const warn = (n, d) => { rec("WARN", n, d); if (!AS_JSON) console.log("  \x1b[33m!\x1b[0m " + n + (d ? "  \x1b[2m" + d + "\x1b[0m" : "")); };
const skip = (n, d) => { rec("SKIP", n, d); if (!AS_JSON) console.log("  \x1b[2m—\x1b[0m " + n + (d ? "  \x1b[2m" + d + "\x1b[0m" : "")); };
function section(t) { G(t); if (!AS_JSON) console.log("\n\x1b[1m" + t + "\x1b[0m"); }

/* ------------------------------------------------- 前端模块加载（真解析） */
/* Vite 允许省略 ./icons 的扩展名，Node ESM 不允许 —— 所以把 import 行摘掉、
   把依赖按参数注入，再剥掉 `export ` 用 Function 求值。比正则抓字段可靠得多。 */
function loadModule(file, deps = {}) {
  let src = fs.readFileSync(file, "utf8");
  src = src.replace(/^\s*import[\s\S]*?from\s*["'][^"']+["'];?[^\S\n]*$/gm, "");
  const names = [...src.matchAll(/^export\s+(?:const|let|var|function|class)\s+(\w+)/gm)].map((m) => m[1]);
  src = src.replace(/^export\s+/gm, "");
  const keys = Object.keys(deps);
  const fn = new Function(...keys, src + "\n;return { " + names.join(", ") + " };");
  return fn(...keys.map((k) => deps[k]));
}
/* 取「某个 const 对象字面量」的直接子键名（跳过字符串字面量与嵌套层级）。
   用来静态读 server/context.js 的 DESK_TOC —— 它是一个对象，且值里有三元与嵌套对象，
   所以不能用「按缩进抓行」这种脆办法，得真的做括号配平。 */
function endOfString(s, i) {
  const q = s[i];
  for (let k = i + 1; k < s.length; k++) {
    if (s[k] === "\\") { k++; continue; }
    if (s[k] === q) return k;
  }
  return s.length - 1;
}
function objectKeys(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  const start = src.indexOf("{", i);
  if (start < 0) return null;
  let depth = 0, end = -1;
  for (let k = start; k < src.length; k++) {
    const c = src[k];
    if (c === '"' || c === "'" || c === "`") { k = endOfString(src, k); continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (!depth) { end = k; break; } }
  }
  if (end < 0) return null;
  const body = src.slice(start + 1, end);
  const keys = new Set();
  let d = 0;
  for (let k = 0; k < body.length; k++) {
    const c = body[k];
    if (c === '"' || c === "'" || c === "`") { k = endOfString(body, k); continue; }
    if (c === "{" || c === "[" || c === "(") { d++; continue; }
    if (c === "}" || c === "]" || c === ")") { d--; continue; }
    if (d === 0 && /[A-Za-z_$]/.test(c)) {
      const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(k));
      if (m) { keys.add(m[1]); k += m[1].length; }
    }
  }
  return keys;
}

const ICONS_SRC = path.join(ROOT, "client", "src", "lib", "icons.js");
const APPS_SRC = path.join(ROOT, "client", "src", "lib", "apps.js");

let APPS = [], APP_ICONS = {}, GLYPHS = {}, APPS_ERR = null;
try {
  const icons = loadModule(ICONS_SRC);
  APP_ICONS = icons.APP_ICONS || {};
  GLYPHS = icons.GLYPHS || {};
  const apps = loadModule(APPS_SRC, {
    JG_CHAPTER_ICONS: icons.JG_CHAPTER_ICONS || {},
    CH_COLORS: icons.CH_COLORS || {},
    JBL_CHAPTER_ICONS: icons.JBL_CHAPTER_ICONS || {},
    navigator: { platform: "", userAgent: "" },
  });
  APPS = apps.APPS || [];
} catch (e) {
  APPS_ERR = e;
}

/* ------------------------------------------------------- 自检（验自己） */
/* 这套预检的两个解析器（objectKeys / loadModule）是**唯一会静默出错**的地方 ——
   解析错了，闸不会报错，只会放行。所以它们自己得被测。
   用法：node tools/preflight.mjs --selftest */
function selftest() {
  let bad = 0;
  const t = (label, got, want) => {
    const key = (v) => (v === null ? "<null>" : v instanceof Set ? [...v].sort().join(",") : String(v));
    const ok = key(got) === key(want);
    if (!ok) bad++;
    console.log((ok ? "  \x1b[32m✓\x1b[0m " : "  \x1b[31m✗\x1b[0m ") + label.padEnd(30) + " → " + key(got) + (ok ? "" : "   期望 " + key(want)));
  };

  console.log("\n\x1b[1mobjectKeys —— 静态解析 DESK_TOC\x1b[0m");
  const real = readIf("server/context.js") || "";
  t("真实 server/context.js", objectKeys(real, "const DESK_TOC = {"), new Set(["javaguide", "jbl"]));
  t("三元 + 深层嵌套", objectKeys(`const DESK_TOC = {
  a: { n: "x", l: [{ c: "01" }], r: { "/a.html": "01" } },
  b: D ? { n: "y" } : { n: "z" },
  c: { n: "n", x: { y: { z: 1 } } },
};`, "const DESK_TOC = {"), new Set(["a", "b", "c"]));
  t("字符串里的冒号不算键", objectKeys(`const DESK_TOC = {
  a: { u: "http://x/y", n: "key: value" },
  b: { p: ':' },
};`, "const DESK_TOC = {"), new Set(["a", "b"]));
  t("空对象", objectKeys("const DESK_TOC = {};", "const DESK_TOC = {"), new Set());
  t("marker 不存在 → null", objectKeys("const X = {};", "const DESK_TOC = {"), null);

  console.log("\n\x1b[1mloadModule —— 加载前端注册表\x1b[0m");
  t("apps.js 可解析", APPS_ERR ? "ERR:" + APPS_ERR.message : APPS.length >= 1, true);
  t("每个应用有 id/icon/glyph", APPS.every((a) => a.id && a.icon && a.glyph), true);
  t("图标键都在 APP_ICONS 里", APPS.every((a) => APP_ICONS[a.icon]), true);
  t("符号键都在 GLYPHS 里", APPS.every((a) => GLYPHS[a.glyph]), true);

  console.log("\n" + (bad ? "\x1b[31m✗ 自检 " + bad + " 项未通过\x1b[0m" : "\x1b[32m✓ 自检全部通过\x1b[0m（解析器可信，闸的结论才可信）"));
  return bad;
}

/* ------------------------------------------------------------- 小工具 */
const get = async (p, opt) => {
  try { return await fetch(BASE + p, { redirect: "manual", ...opt }); }
  catch (e) { return { __err: e.message, status: 0, ok: false }; }
};
const readIf = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { return null; } };
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/* 自检要在这里之后才能跑 —— selftest() 用到 readIf（上面刚定义） */
if (has("--selftest")) process.exit(selftest() ? 1 : 0);

/* ======================================================= 闸 A 前端构建 ==
   先构建、再校验产物 —— 否则查的是上一轮的 dist，等于没查。 */
section("闸 A · 前端构建（vite build）");
const VITE = path.join(ROOT, "client", "node_modules", "vite", "bin", "vite.js");
let built = false;
if (SKIP_BUILD) skip("vite build", "按 --skip-build 跳过");
else if (!fs.existsSync(VITE)) fail("找不到 vite", "→ npm --prefix client install");
else {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [VITE, "build", path.join(ROOT, "client")], { encoding: "utf8" });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status === 0) { built = true; pass("vite build 通过", secs + "s"); }
  else {
    fail("vite build 失败", secs + "s");
    const tail = ((r.stderr || "") + (r.stdout || "")).split(/\r?\n/).filter(Boolean).slice(-12).join("\n     ");
    if (tail && !AS_JSON) console.log("     " + tail);
  }
}

/* ============================================================ 闸 B 产物 ==
   构建产物是服务端唯一会读的东西 —— 不存在就是 503。 */
section("闸 B · 前端构建产物");
const distIndex = path.join(ROOT, "client", "dist", "index.html");
if (fs.existsSync(distIndex)) {
  const assets = fs.readdirSync(path.join(ROOT, "client", "dist", "assets")).filter((f) => /\.(js|css)$/.test(f));
  const hasHash = assets.some((f) => /-[A-Za-z0-9_]{8}\./.test(f));
  pass("client/dist/index.html 存在", assets.length + " 个资源");
  hasHash ? pass("构建产物带内容哈希", "浏览器无需强刷") : warn("构建产物没看到哈希文件名", "确认 dist 是最新构建");
  if (built && !hasHash) warn("刚构建完却没有哈希文件名", "确认 client/vite.config.js 没被改掉默认命名");
} else {
  fail("client/dist/index.html 不存在", "→ 跑 npm run build:client");
}

/* ===================================================== 闸 C 内容自检 == */
section("闸 C · 内容自检（verify-links.js）");
if (!exists("public/content")) skip("内容自检", "public/content 不存在（内容管线未跑过）");
else {
  const r = spawnSync(process.execPath, [path.join(ROOT, "verify-links.js")], { encoding: "utf8" });
  const out = ((r.stdout || "") + (r.stderr || "")).trim().split(/\r?\n/).filter(Boolean);
  if (r.status === 0) pass("链接 / 落点 / 锚点自检通过", out.slice(-1)[0] || "");
  else { fail("内容自检非零退出", "退出码 " + r.status); if (!AS_JSON) console.log("     " + out.slice(-8).join("\n     ")); }
}

/* ================================================ 闸 D 注册表一致性 ==
   ★ 这一闸是「新增子应用」最值钱的一条：它把新应用最容易漏的注册
     （图标双注册、id 唯一、toc 与 /api/desk 对齐）变成提交前就能看见的错。 */
section("闸 D · 应用注册表一致性");
if (APPS_ERR) fail("加载 apps.js / icons.js 失败", APPS_ERR.message);
else {
  pass("注册表可解析", APPS.length + " 个应用：" + APPS.map((a) => a.id).join(", "));

  const ids = APPS.map((a) => a.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  dup.length ? fail("app.id 有重复", dup.join(", ")) : pass("app.id 唯一");

  for (const a of APPS) {
    const miss = [];
    if (!a.icon || !APP_ICONS[a.icon]) miss.push("APP_ICONS[" + a.icon + "]");
    if (!a.glyph || !GLYPHS[a.glyph]) miss.push("GLYPHS[" + a.glyph + "]");
    miss.length
      ? fail(a.id + " 图标未双注册", "缺 " + miss.join(" 与 ") + " → 会看到空白 Dock 按钮 / 无图标侧栏")
      : pass(a.id + " 图标已双注册", "icon=" + a.icon + " glyph=" + a.glyph);
  }

  for (const a of APPS) {
    const bad = [];
    if (!a.src || !String(a.src).startsWith("/")) bad.push("src 必须是根绝对路径");
    if (a.native && !a.name) bad.push("native 应用应有 name");
    if (!a.w || !a.h) bad.push("缺 w/h 初始尺寸");
    bad.length ? fail(a.id + " 注册项字段有缺", bad.join("；")) : pass(a.id + " 注册项字段完整");
  }

  /* ---- 多应用泛化就绪度 ----
     ★ 关键判断：这三处「按两个应用写死」在**只有 2 个应用时是正确的实现**，不是缺陷。
       它们只在第 3 个应用出现时才是 bug（窗口开空白 / 跳转跳错 / 进度探针不认）。
       所以闸的门槛是「应用数量 ≥ 3」，而不是「代码里有没有 jbl 字面量」——
       否则 CI 会在主干上永远红，变成没人看的噪音。 */
  const wf = readIf("client/src/components/shell/WinFrame.vue") || "";
  const nu = readIf("client/src/lib/nburl.js") || "";
  const dk = readIf("client/src/stores/desk.js") || "";
  const appOfHref = (nu.match(/export function appOfHref[\s\S]*?\n\}/) || [""])[0];
  const pending = [];
  if (/v-if="app\.native"/.test(wf) && !/:is="Host"|:is="host"/.test(wf)) pending.push("① WinFrame 仍是二元 v-if 分发（改宿主表 + <component :is>）");
  if (/\/jbl\//.test(appOfHref)) pending.push("② appOfHref 写死 /jbl/ 前缀（改按 APPS.src 最长前缀匹配）");
  if (/progress:\s*\{[^}]*javaguide[^}]*jbl[^}]*\}/.test(dk)) pending.push("③ desk.progress 写死 { javaguide, jbl }（改按 APPS 生成的 map + 探针表）");
  const hasTocOrRouteHardcode = /appId\s*===\s*["']jbl["']/.test(wf);

  if (!pending.length && !hasTocOrRouteHardcode) pass("多应用泛化就绪度", "已数据驱动，加应用只需加注册项");
  else if (APPS.length < 3) {
    pass("多应用泛化就绪度", APPS.length + " 个应用下二元实现成立；加到第 3 个时下面 " + pending.length + " 处必须先泛化");
    if (!AS_JSON) for (const p of pending) console.log("       \x1b[2m待办 · " + p + "\x1b[0m");
  } else {
    fail("多应用泛化未完成（当前 " + APPS.length + " 个应用）", "→ 必须先泛化，再加应用：\n       " + pending.join("\n       "));
  }

  /* ---- 目录键（离线）：静态解析 server/context.js 的 DESK_TOC，与注册表的 toc 对齐 ----
     有这条，--static 模式下也挡得住「忘了给新应用加目录键」——
     否则这个错只在闸 E（要求服务在跑）才暴露，钩子场景就漏了。
     闸 E 是运行时确认，这里是构建期检查，两者互补而非重复。 */
  const tocKeys = objectKeys(readIf("server/context.js") || "", "const DESK_TOC = {");
  if (!tocKeys) warn("未能解析 server/context.js 的 DESK_TOC", "人工确认新应用的 toc 键加上了");
  else {
    const wanted = APPS.filter((a) => a.toc);
    const missing = wanted.filter((a) => !tocKeys.has(a.toc));
    missing.length
      ? fail("DESK_TOC 缺目录键", missing.map((a) => a.id + ' 的 toc="' + a.toc + '"').join("、") + " → 侧栏章节会是空的，补 server/context.js")
      : pass("DESK_TOC 含全部应用目录键", wanted.map((a) => a.toc).join(", "));
    const orphans = [...tocKeys].filter((k) => !wanted.some((a) => a.toc === k));
    if (orphans.length) warn("DESK_TOC 有未被任何应用引用的键", orphans.join(", ") + "（若是给旧应用留的可以忽略）");
  }
}

/* ==================================================== 闸 E 服务冒烟 == */
section("闸 E · 服务冒烟（" + BASE + "）");
const root = STATIC ? null : await get("/", { headers: { accept: "text/html" } });
if (STATIC) {
  /* 钩子场景的关键决定：「没起服务」不该让提交失败 —— 只标为跳过，不判失败。
     真正的运行时确认交给 `npm run ci`（提交后 / 推送前跑）。 */
  skip("服务冒烟", "静态模式：不要求服务在跑");
} else if (root.__err) {
  fail("服务不可达", root.__err + " → 先 npm start");
  skip("后续冒烟项", "服务没起来");
} else {
  root.status === 200 && String(root.headers.get("content-type")).includes("text/html")
    ? pass("GET / 返回 HTML", root.status)
    : fail("GET / 异常", "status=" + root.status + " type=" + root.headers.get("content-type"));

  /* 不依赖库的两条：库没起也该通 */
  for (const p of ["/api/meta", "/api/desk"]) {
    const r = await get(p);
    if (r.__err || r.status !== 200) { fail("GET " + p, r.__err || ("status=" + r.status)); continue; }
    try {
      const d = await r.json();
      const shapeOk = p === "/api/meta" ? Array.isArray(d) : (d && typeof d === "object" && !Array.isArray(d));
      shapeOk ? pass("GET " + p + " 形状正确", p === "/api/meta" ? d.length + " 条" : Object.keys(d).join(", ")) : fail("GET " + p + " 形状不对", "返回不是预期结构");
      if (p === "/api/desk" && !APPS_ERR) {
        for (const a of APPS) {
          if (!a.toc) continue;
          Object.prototype.hasOwnProperty.call(d, a.toc)
            ? pass("  /api/desk 含 toc 键 " + JSON.stringify(a.toc), "对应应用 " + a.id)
            : fail("  /api/desk 缺 toc 键 " + JSON.stringify(a.toc), "应用 " + a.id + " 的侧栏章节会是空的 → 补 server/context.js 的 DESK_TOC");
        }
      }
    } catch (e) { fail("GET " + p + " 不是 JSON", e.message); }
  }

  /* 依赖库的一条：失败降级为 WARN（库没起是允许的运行时状态） */
  const ov = await get("/api/overview");
  if (ov.__err) warn("GET /api/overview 不可达", ov.__err);
  else if (ov.status === 200) pass("GET /api/overview 正常（MySQL 已连）");
  else if (ov.status === 503) warn("GET /api/overview 503", "MySQL 未就绪 —— 允许的状态，只是进度数字不可用");
  else fail("GET /api/overview 异常", "status=" + ov.status);

  /* 每个应用的入口 URL 必须可达（native 走 SPA fallback，iframe 走静态挂载） */
  if (!APPS_ERR) {
    for (const a of APPS) {
      const r = await get(a.src, { headers: { accept: "text/html" } });
      if (r.__err) fail(a.id + " 入口不可达", a.src + " → " + r.__err);
      else if (r.status !== 200) fail(a.id + " 入口非 200", a.src + " → " + r.status + (a.native ? "（native 应落到 SPA fallback）" : "（iframe 应落到 server/statics.js 的挂载，且要排在 client/dist 之前）"));
      else {
        const body = await r.text();
        const isSpa = body.includes("<div id=\"app\"");
        const note = a.native ? (isSpa ? "SPA 壳" : "⚠ 不是 SPA 壳") : (isSpa ? "⚠ 被 SPA fallback 抢走了" : "独立页面");
        (a.native ? isSpa : !isSpa) ? pass(a.id + " 入口可达", a.src + " · " + note) : fail(a.id + " 入口内容不对", a.src + " · " + note);
      }
    }
  }
}

/* ============================================== 闸 F 硬编码残留（报告）==
   静态 grep 分不清「数据」与「逻辑分支」，所以只报告不阻断 —— 真正判它的是
   闸 G 的三窗同开。这里只把候选行摊开，让人一眼扫过。 */
section("闸 F · 子应用硬编码残留（仅报告，不阻断）");
{
  const SRC = path.join(ROOT, "client", "src");
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : (/\.(js|vue)$/.test(e.name) && files.push(p)); } })(SRC);
  /* 只匹配「逻辑形态」：比较、三元、前缀判断；`id: "jbl"` 这类数据不算 */
  const PATTERNS = [
    { re: /[!=]==\s*["']jbl["']/g, why: "与 jbl 字面量比较" },
    { re: /\?\s*["']jbl["']\s*:/g, why: "按 jbl 三元取值" },
    { re: /indexOf\(\s*["']\/jbl\//g, why: "写死 /jbl/ 前缀判断" },
    { re: /startsWith\(\s*["']\/jbl\//g, why: "写死 /jbl/ 前缀判断" },
    { re: /appId\s*[!=]==\s*["'][a-z]+["']/g, why: "按 appId 特判（可能是文案/行为分支）" },
  ];
  /* 同一行可能被多个模式命中 —— 按 (文件:行) 去重，原因合并，避免刷屏 */
  const byLine = new Map();
  for (const f of files) {
    const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
    lines.forEach((l, i) => {
      const whys = [];
      for (const { re, why } of PATTERNS) { re.lastIndex = 0; if (re.test(l)) whys.push(why); }
      if (!whys.length) return;
      const key = path.relative(ROOT, f).replace(/\\/g, "/") + ":" + (i + 1);
      byLine.set(key, { key, text: l.trim().slice(0, 108), why: [...new Set(whys)].join(" / ") });
    });
  }
  const hits = [...byLine.values()];
  const CAP = 12;
  if (!hits.length) pass("没有发现硬编码应用的逻辑分支", files.length + " 个源文件");
  else {
    warn("发现 " + hits.length + " 处「按应用特判」的候选（仅报告）", "逐条确认：是数据就放过，是逻辑分支就泛化成表");
    if (!AS_JSON) {
      for (const h of hits.slice(0, CAP)) console.log("     \x1b[2m" + h.key + "\x1b[0m  " + h.why + "\n       " + h.text);
      if (hits.length > CAP) console.log("     \x1b[2m… 还有 " + (hits.length - CAP) + " 处，用 --json 看全量\x1b[0m");
    }
  }
}

/* ============================================== 闸 G 无头验证（可选）===
   唯一能真正判「多应用并存」的闸：把每个应用各开一窗，断言它们都在、
   都有玻璃材质、且控制台没有报错。 */
section("闸 G · 无头浏览器验证" + (E2E ? "" : "（未开启，加 --e2e）"));
if (STATIC) skip("每应用一窗验证", "静态模式：不开浏览器");
else if (!E2E) skip("每应用一窗验证", "加 --e2e 开启（需要本机 Chrome）");
else if (!fs.existsSync(CHROME)) skip("每应用一窗验证", "没找到 Chrome：" + CHROME);
else if (APPS_ERR) skip("每应用一窗验证", "注册表加载失败");
else await runE2E();

async function runE2E() {
  const PORT = 9333;
  const profile = path.join(process.env.TEMP || "/tmp", "wb-preflight-" + Date.now());
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--no-default-browser-check", "--disable-extensions", "--force-device-scale-factor=1",
    "--window-size=1680,1050", "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });

  let ws;
  try {
    let url = null;
    for (let i = 0; i < 60 && !url; i++) {
      try {
        const list = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json();
        const pg = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
        if (pg) url = pg.webSocketDebuggerUrl;
      } catch { /* 未就绪 */ }
      if (!url) await sleep(250);
    }
    if (!url) { fail("Chrome 调试端口未就绪", "无法连 CDP"); return; }

    ws = new WebSocket(url);
    let seq = 0;
    const pending = new Map(), consoleErrors = [];
    const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); return; }
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrors.push(m.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 160));
      if (m.method === "Log.entryAdded" && m.params.entry.level === "error") consoleErrors.push("[log] " + m.params.entry.text.slice(0, 160));
    };
    await new Promise((r) => (ws.onopen = r));

    /* 种子：每个应用各开一窗，坐标错开叠放（叠放才能验玻璃有没有材质） */
    const seed = `try{localStorage.setItem('desk:session',JSON.stringify(${JSON.stringify({
      v: 2,
      order: APPS.map((a) => a.id),
      front: APPS[APPS.length - 1].id,
      wins: Object.fromEntries(APPS.map((a, i) => [a.id, { x: 60 + i * 46, y: 40 + i * 34, w: 900, h: 620, i: 0, noSide: 0, sideW: 200, tabs: [{ url: a.src, title: "", hist: [a.src], hi: 0 }] }])),
    })}))}catch(e){}`;

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", { source: seed });
    await send("Page.navigate", { url: BASE + "/" });
    await sleep(6000);   // SPA 挂载 + 会话错峰恢复（每窗 90ms）

    const expr = `(() => {
      const wins = [...document.querySelectorAll('.win')];
      return {
        want: ${APPS.length},
        got: wins.length,
        bars: wins.map((w) => { const b = w.querySelector('.win-bar'); return b ? getComputedStyle(b).backdropFilter : 'none'; }),
        dockItems: document.querySelectorAll('.dock-item').length,
        titles: wins.map((w) => (w.querySelector('.tb-title .t') || {}).textContent || ''),
      };
    })()`;
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    const v = r.result.value;

    v.got === v.want ? pass("每个应用一窗： " + v.want + " 个都开了", "标题 " + JSON.stringify(v.titles)) : fail("开窗数量不对", "期望 " + v.want + " 实得 " + v.got);
    const opaque = v.bars.filter((b) => !b || b === "none").length;
    opaque === 0 ? pass("每个窗口工具栏都有玻璃材质") : fail(opaque + " 个窗口工具栏没有 backdrop-filter", "→ .win-bar / .win-side 要自带材质（不是只取 glass-thin 的颜色）");
    v.dockItems === APPS.length + 1 ? pass("Dock 项数正确（" + APPS.length + " 应用 + 启动台）") : fail("Dock 项数不对", "期望 " + (APPS.length + 1) + " 实得 " + v.dockItems);
    consoleErrors.length === 0 ? pass("控制台无报错") : fail("控制台有 " + consoleErrors.length + " 条报错", consoleErrors.slice(0, 4).join(" ｜ "));
  } catch (e) {
    fail("e2e 执行出错", e.message);
  } finally {
    try { ws && ws.close(); } catch { /* 忽略 */ }
    try { chrome.kill(); } catch { /* 忽略 */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }
}

/* ------------------------------------------------------------- 汇总 */
const n = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
for (const r of results) n[r.level]++;

if (AS_JSON) {
  console.log(JSON.stringify({ base: BASE, pass: n.PASS, fail: n.FAIL, warn: n.WARN, skip: n.SKIP, results }, null, 1));
} else {
  console.log("\n" + "─".repeat(58));
  console.log(`  \x1b[32m${n.PASS} 通过\x1b[0m   \x1b[31m${n.FAIL} 失败\x1b[0m   \x1b[33m${n.WARN} 警告\x1b[0m   \x1b[2m${n.SKIP} 跳过\x1b[0m`);
  if (n.FAIL) {
    console.log("\n失败项：");
    for (const r of results.filter((x) => x.level === "FAIL")) console.log("  · [" + r.gate + "] " + r.name + (r.detail ? "  — " + r.detail : ""));
  }
  console.log(n.FAIL ? "\n\x1b[31m✗ 预检未通过，别提交\x1b[0m" : "\n\x1b[32m✓ 预检通过\x1b[0m");
}
process.exit(n.FAIL ? 1 : 0);
