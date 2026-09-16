/* 把 ../public/cheat.css 作用域化为 src/styles/nb.css：
   :root/html/body → .nb-scope 容器；宽度媒体查询 → 容器查询（窗口内响应窗口宽度）；
   100vh/vw → ResizeObserver 注入的 --nb-h/--nb-w；id 选择器 → 类。
   用法：node scripts/nb-transform.mjs（在 client/ 下执行） */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../../public/cheat.css"), "utf8");

let css = src;

// 1) 根选择器 → 容器
css = css.replace(":root {", ".nb-scope {");
css = css.replace(/^html \{ scrollbar-gutter: stable; -webkit-text-size-adjust: 100%; \}$/m,
  ".nb-scope { scrollbar-gutter: stable; }");

// 2) 摘除 body / body::before / body::after 三块（案面背景改由补丁块用多层 background 实现）
css = css.replace(/^body \{[\s\S]*?^\/\* 内容层压在案面之上 \*\/\n/m, "");

// 3) 宽度媒体查询 → 容器查询（prefers-* 保持不变）
css = css.replace(/@media \(min-width: (\d+)px\)/g, "@container nb (min-width: $1px)");
css = css.replace(/@media \(max-width: (\d+)px\)/g, "@container nb (max-width: $1px)");

// 4) 夜读 / 字号属性选择器落到容器上
css = css.replaceAll('html[data-mode="night"]', '.nb-scope[data-mode="night"]');
css = css.replaceAll('html:not([data-mode="day"])', '.nb-scope:not([data-mode="day"])');
css = css.replaceAll('html[data-size=', '.nb-scope[data-size=');

// 5) id → 类（Vue 组件里用 class）
css = css.replaceAll("#rail-mode", ".rail-mode");
css = css.replaceAll("#rail-size", ".rail-size");
css = css.replaceAll("#rail-top", ".rail-top");

// 6) 视口单位 → 容器实测尺寸（NotebookRoot 以 ResizeObserver 写入）
css = css.replaceAll("100vh", "var(--nb-h, 100vh)");
css = css.replaceAll("100vw", "var(--nb-w, 100vw)");

// 7) 全局伪元素收进容器（selection / 滚动条）
css = css.replace("::selection", ".nb-scope ::selection");
css = css.replace(/^::-webkit-scrollbar \{/m, ".nb-scope ::-webkit-scrollbar, .nb-scope::-webkit-scrollbar {");
css = css.replace(/^::-webkit-scrollbar-track \{/m, ".nb-scope ::-webkit-scrollbar-track, .nb-scope::-webkit-scrollbar-track {");
css = css.replace(/^::-webkit-scrollbar-thumb \{/m, ".nb-scope ::-webkit-scrollbar-thumb, .nb-scope::-webkit-scrollbar-thumb {");
css = css.replace(/^::-webkit-scrollbar-thumb:hover \{/m, ".nb-scope ::-webkit-scrollbar-thumb:hover {");

// 8) 全部规则收进 .nb-scope 作用域 —— 小抄与外壳存在同名类（纸张 .sheet/.btn ↔ 弹层 .sheet/.btn），
//    不收作用域会互相压样式：弹层背景被纸张规则打穿（--paper 在外壳取不到值 → background 失效变透明），
//    纸张又被弹层规则钳制（max-height/overflow/flex 漏进纸张）。
//    逐块扫描：@media/@supports/@container 递归；@keyframes/@font-face 原样；样式规则的选择器逐个加前缀。
function scopeCss(text) {
  const n = text.length;
  let out = "";
  let prelude = "";
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      // 规则之间的注释直接落盘：混进 prelude 会让 @media/@container 的判定失效
      if (prelude.trim() === "") out += text.slice(i, stop);
      else prelude += text.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && text[j] !== ch) { if (text[j] === "\\") j += 1; j += 1; }
      prelude += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "{") {
      let depth = 1;
      let j = i + 1;
      let q = null;
      while (j < n && depth > 0) {
        const c = text[j];
        if (q) { if (c === q && text[j - 1] !== "\\") q = null; }
        else if (c === '"' || c === "'") q = c;
        else if (c === "{") depth += 1;
        else if (c === "}") depth -= 1;
        j += 1;
      }
      const body = text.slice(i + 1, j - 1);
      const t = prelude.trim();
      if (t.startsWith("@")) {
        const nested = /^@(media|supports|container|layer)\b/.test(t);
        out += prelude + "{" + (nested ? scopeCss(body) : body) + "}";
      } else {
        const sel = t.split(",").map((raw) => {
          const s = raw.trim();
          if (!s || /^(\.nb-scope|\.nb-host|\.nb-page)\b/.test(s)) return s;
          return ".nb-scope " + s;
        }).join(", ");
        out += sel + "{" + body + "}";
      }
      prelude = "";
      i = j;
      continue;
    }
    if (ch === "}") { out += prelude + "}"; prelude = ""; i += 1; continue; }
    prelude += ch;
    i += 1;
  }
  return out + prelude;
}
css = scopeCss(css);

// 9) 容器基座补丁：.nb-host（fixed 的包含块）/ .nb-scope（滚动容器 + 案面多层背景）/ .nb-page（内容衬垫）
const patch = `
/* ============================================================ nb 容器基座（Vue 移植补丁）
   .nb-host  带 translateZ：让 .rail/.toast 的 position:fixed 以容器为包含块
             —— 同一份样式在「窗口内」与「全页深链」两种宿主里都钉在正确位置。
   .nb-scope 滚动容器 + 设计令牌作用域 + container nb（宽度媒体查询的查询对象）。
             案面 = 多层 background：暗角 → 织纹×2 → 桌面径向，attachment 默认 scroll
             （内容滚、桌子不滚，等价于原 body 的 fixed 层叠）。
   --nb-h / --nb-w 由 NotebookRoot 的 ResizeObserver 写入（px 实测值）。 */
.nb-host {
  transform: translateZ(0);
  height: 100%;
  min-height: 0;
}
.nb-scope {
  container-type: inline-size;
  container-name: nb;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  color: var(--ink);
  font: 400 16px/1.8 var(--serif);
  color-scheme: light;
  --nb-h: 100vh;
  --nb-w: 100vw;
  background-color: var(--desk-2);
  background-image:
    radial-gradient(120% 100% at 50% 40%, transparent 55%, rgba(var(--vignette), var(--vignette-a)) 100%),
    repeating-linear-gradient(90deg, rgba(var(--linen), var(--linen-a)) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(0deg, rgba(var(--linen), var(--linen-a2)) 0 1px, transparent 1px 3px),
    radial-gradient(1500px 950px at 50% -20%, var(--desk) 0%, var(--desk-2) 55%, var(--desk-deep) 128%);
}
.nb-page {
  position: relative;
  z-index: 1;
  min-height: 100%;
  padding: var(--pad-y) 14px 60px;
}
/* 夜读跟随 .nb-scope[data-mode="night"]（token 块已在上方整体覆盖） */
.nb-scope[data-mode="night"] { color-scheme: dark; }
@media (prefers-color-scheme: dark) {
  .nb-scope:not([data-mode="day"]) { color-scheme: dark; }
}
@media (prefers-reduced-motion: reduce) {
  .nb-scope { scroll-behavior: auto; }
}
`;

writeFileSync(join(here, "../src/styles/nb.css"), css + patch);
console.log("nb.css generated:", css.length + patch.length, "bytes");
