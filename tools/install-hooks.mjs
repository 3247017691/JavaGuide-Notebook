#!/usr/bin/env node
/* 把 tools/hooks/* 安装进 .git/hooks/。
   由 package.json 的 `prepare` 生命周期自动调用 —— 所以 `npm install` 一次就把钩子装好了。

   ---------------------------------------------------------------------------
   三条安全约束（改这个脚本前先读）：

   1. **绝不碰别人的钩子。** 只管理 tools/hooks/ 里存在的文件（pre-commit / pre-push），
      且**只认带 `== workbench-buildkit ` 标记的**。
      本仓库里 .git/hooks/post-commit 与 post-checkout 是 Qoder（另一个 AI IDE）的追踪器，
      不在管理范围 —— 它们既不会被覆盖，也不会被删。

   2. **不用 core.hooksPath。** 那会把整个 .git/hooks 挪到别的目录，Qoder 那两个钩子
      会当场失效。所以走「往 .git/hooks 里放文件」这条笨但安全的路。

   3. **永不失败。** 它挂在 npm 的 prepare 上，抛错会让 `npm install` 直接失败。
      所以：.git 不存在（CI / 打包 / 还没 git init）就静默跳过，退出码恒为 0。

   用法：node tools/install-hooks.mjs [--quiet]
   --------------------------------------------------------------------------- */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SRC_DIR = path.join(HERE, "hooks");
const MARKER = "== workbench-buildkit ";
const QUIET = process.argv.includes("--quiet");

const say = (...a) => { if (!QUIET) console.log(...a); };
const done = (code = 0) => process.exit(code);   // 恒 0：绝不拖垮 npm install

/* 找 .git 目录（可能是文件，如 worktree / submodule 的 gitdir 指针） */
let gitDir = null;
{
  const r = spawnSync("git", ["rev-parse", "--git-dir"], { cwd: ROOT, encoding: "utf8" });
  if (r.status === 0 && r.stdout.trim()) {
    gitDir = path.resolve(ROOT, r.stdout.trim());
  } else {
    say("[hooks] 不在 git 仓库里（或没有 git），跳过安装");
    done();
  }
}
if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
  say("[hooks] .git 不是目录（worktree / submodule 指针），跳过安装");
  done();
}

/* core.hooksPath 一旦被设置，.git/hooks 里的文件就不会被执行 —— 提醒但不改它 */
{
  const r = spawnSync("git", ["config", "--get", "core.hooksPath"], { cwd: ROOT, encoding: "utf8" });
  const hp = (r.stdout || "").trim();
  if (hp) {
    console.log("[hooks] ⚠ 检测到 core.hooksPath = " + hp);
    console.log("        它会让 .git/hooks 里的钩子**不再执行**。本脚本不会改它（改了会连带");
    console.log("        停掉 Qoder 装在 .git/hooks 的 post-commit / post-checkout）。");
    console.log("        若想让预检生效，请先 git config --unset core.hooksPath，或把本目录的钩子");
    console.log("        拷进 " + hp + "。");
    done();
  }
}

const hooksDir = path.join(gitDir, "hooks");
try { fs.mkdirSync(hooksDir, { recursive: true }); } catch { say("[hooks] 建不了 .git/hooks，跳过"); done(); }

let srcFiles;
try { srcFiles = fs.readdirSync(SRC_DIR).filter((f) => !f.startsWith(".") && f !== "README.md"); }
catch { say("[hooks] 没有 tools/hooks/ 目录，跳过"); done(); }

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
let installed = 0, updated = 0, backedUp = 0, same = 0;

for (const name of srcFiles) {
  const src = path.join(SRC_DIR, name);
  if (!fs.statSync(src).isFile()) continue;
  /* 行尾归一到 LF：shell 脚本带 CRLF 会让 sh 在 shebang 与行尾的 \r 上出错。
     本机 core.autocrlf=true，.gitattributes 已经保证签出为 LF —— 这里再兜一层，
     防止有人用编辑器把工作区文件存成 CRLF（那样钩子会「装了却跑不起来」，且不报错）。 */
  const content = fs.readFileSync(src, "utf8").replace(/\r\n/g, "\n");
  if (!content.includes(MARKER)) { say("[hooks] 跳过 " + name + "（没有 " + MARKER.trim() + " 标记）"); continue; }

  const target = path.join(hooksDir, name);
  let action = "installed";
  if (fs.existsSync(target)) {
    const cur = fs.readFileSync(target, "utf8");
    if (cur === content) { same++; continue; }
    if (cur.includes(MARKER)) {
      action = "updated";                       // 是我们的旧版 → 直接更新
    } else {
      /* 别人的钩子：备份后再装。绝不静默覆盖 —— 那可能是别人特意写的。 */
      const bak = target + ".bak-" + stamp;
      try { fs.copyFileSync(target, bak); action = "backed-up"; backedUp++; }
      catch { console.log("[hooks] ✗ " + name + " 已存在且非本工具所装，备份失败 —— 保持原样不动"); continue; }
      console.log("[hooks] ⚠ " + name + " 已存在（非本工具所装）→ 已备份为 " + path.basename(bak));
    }
  }
  try {
    fs.writeFileSync(target, content, { mode: 0o755 });
    try { fs.chmodSync(target, 0o755); } catch { /* Windows 上 exec 位无意义，Git for Windows 照跑 */ }
    if (action === "installed") installed++;
    else if (action === "updated") updated++;
  } catch (e) {
    console.log("[hooks] ✗ 写不了 " + name + "：" + (e.code || e.message));
  }
}

const parts = [];
if (installed) parts.push("新装 " + installed);
if (updated) parts.push("更新 " + updated);
if (backedUp) parts.push("备份 " + backedUp);
if (same) parts.push("已是最新 " + same);
if (!parts.length) say("[hooks] 没有可安装的钩子");
else say("[hooks] " + parts.join(" · ") + "  →  " + hooksDir.replace(ROOT + path.sep, ""));

say("[hooks] pre-commit 跑离线静态闸（不构建 / 不连服务）；pre-push 拦「改了前端没构建」");
say("[hooks] 提示：pre-commit 可用 git commit --no-verify 绕过");
done();
