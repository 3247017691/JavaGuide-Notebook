<template>
  <Teleport to="body">
    <div v-if="ui.paletteOpen" class="scrim" @pointerdown="ui.closePalette()" />
    <div v-if="ui.paletteOpen" class="palette glass-thick" role="dialog" aria-modal="true" aria-label="搜索内容与命令">
      <div class="pal-in">
        <span v-html="gl('search')" />
        <input ref="input" v-model="q" type="search" placeholder="搜篇目、题目、章节，或输入命令…"
               autocomplete="off" spellcheck="false" aria-label="搜索" @keydown="onKey" />
        <div class="pal-scope" role="group" aria-label="搜索范围">
          <button v-for="s in SCOPES" :key="s.id" type="button" :aria-pressed="scope === s.id" @click="scope = s.id">
            {{ s.label }}
          </button>
        </div>
      </div>
      <div class="pal-list desk-scroll" role="listbox" aria-label="结果">
        <template v-if="groups.length">
          <div v-for="g in groups" :key="g.title" class="pal-grp">{{ g.title }}</div>
          <template v-for="(g, gi) in groups">
            <button v-for="(it, ii) in g.items" :key="gi + '-' + ii" type="button" role="option"
                    class="pal-row" :class="{ hi: flatIndex(gi, ii) === hiIdx }"
                    :style="{ '--acc': it.acc }" @click="pick(it)" @pointerenter="hiIdx = flatIndex(gi, ii)">
              <span class="pr-g" v-html="gl(it.g || 'list')" />
              <span class="pr-main">
                <span class="pr-t" v-html="it.t || '（无标题）'" />
                <span v-if="it.sub" class="pr-sub" v-html="it.sub" />
                <span v-if="it.snip" class="pr-snip" v-html="it.snip" />
              </span>
              <span v-if="it.kbd" class="pr-kbd">{{ it.kbd }}</span>
            </button>
          </template>
        </template>
        <div v-else class="pal-empty">
          <b>{{ q.trim() ? `没有匹配「${esc(q.trim())}」的内容` : "没有可显示的条目" }}</b><br>
          {{ q.trim() ? "试试更短的关键词，或换个范围；命令与章节也在这一屏里。" : "" }}
        </div>
      </div>
      <div class="pal-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span><kbd>Enter</kbd> 打开</span>
        <span><kbd>{{ MOD }} ⇧ Enter</kbd> 新标签页</span>
        <span><kbd>Esc</kbd> 关闭</span>
        <span style="margin-left: auto">{{ remoteTotal != null && q.trim() ? "共 " + remoteTotal + " 条正文命中" : "" }}</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from "vue";
import { gl } from "../../lib/icons";
import { MOD } from "../../lib/apps";
import { useUi } from "../../stores/ui";
import { useWins } from "../../stores/windows";
import { useDesk } from "../../stores/desk";
import { usePrefs } from "../../stores/prefs";
import { getJSON } from "../../api";
import { appById } from "../../lib/apps";

const SCOPES = [
  { id: "all", label: "全部" },
  { id: "javaguide", label: "小抄" },
  { id: "jbl", label: "题库" },
  { id: "recent", label: "最近" },
];

const ui = useUi();
const wins = useWins();
const desk = useDesk();
const prefs = usePrefs();

const q = ref("");
const scope = ref("all");
const input = ref(null);
const hiIdx = ref(0);
const remote = ref([]);
const remoteTotal = ref(null);
let seq = 0;

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function hl(text, query) {
  const s = esc(text);
  const terms = String(query || "").trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (!terms.length) return s;
  const re = new RegExp("(" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  return s.replace(re, "<mark>$1</mark>");
}

/* 远端正文搜索：150ms 防抖 */
let timer = 0;
watch(q, (v) => {
  clearTimeout(timer);
  const query = v.trim();
  if (!query) { remote.value = []; remoteTotal.value = null; return; }
  timer = setTimeout(async () => {
    const my = ++seq;
    const d = await getJSON("/api/search?q=" + encodeURIComponent(query) + "&limit=20");
    if (my !== seq) return;
    remote.value = (d && d.hits) || [];
    remoteTotal.value = d ? d.total : null;
  }, 150);
});
watch(scope, () => { hiIdx.value = 0; });

/* 本地行：命令 / 已开标签 / 模块 / 最近 —— 移植 localRows() */
const localRows = computed(() => {
  const query = q.value.trim().toLowerCase();
  const rows = [];
  const cmds = [
    { t: "外观：浅色", g: "sun", run: () => prefs.setTheme("light") },
    { t: "外观：深色", g: "moon", run: () => prefs.setTheme("dark") },
    { t: "外观：跟随系统", g: "contrast", run: () => prefs.setTheme("auto") },
    { t: prefs.opaque ? "恢复液态玻璃透明度" : "降低透明度（玻璃退成实面）", g: "contrast", run: () => prefs.toggleOpaque() },
    { t: "切换侧边栏", g: "sidebar", run: () => wins.run("side-toggle") },
    { t: "新建标签页", g: "plus", run: () => wins.run("tab-new") },
    { t: "关闭标签页", g: "xmark", run: () => wins.run("tab-close") },
    { t: "窗口居左半屏", g: "tile-left", run: () => wins.run("tile:left") },
    { t: "窗口居右半屏", g: "tile-right", run: () => wins.run("tile:right") },
    { t: "两窗并列排布", g: "tile-all", run: () => wins.run("tile:all") },
    { t: "显示偏好设置", g: "gear", run: () => ui.openSheet("prefs") },
    { t: "操作指南（没有右键怎么用）", g: "question", run: () => ui.openSheet("guide") },
    { t: "键盘快捷键一览", g: "command", run: () => ui.openSheet("shortcuts") },
    { t: "打开启动台", g: "launchpad", run: () => ui.openLaunchpad() },
    { t: "关闭全部窗口", g: "trash", run: () => wins.run("closeall") },
    { t: "重新载入桌面", g: "reload", run: () => location.reload() },
  ];
  Object.values(appById).forEach((a, i) => {
    cmds.push({ t: "打开 " + a.name, g: a.glyph, kbd: MOD + (i + 1), run: () => wins.dockClick(a.id) });
  });
  const cm = cmds.filter((c) => !query || c.t.toLowerCase().includes(query));
  if (cm.length) rows.push({ title: "命令", items: cm.map((c) => ({ t: esc(c.t), g: c.g, kbd: c.kbd, acc: "var(--accent)", run: c.run })) });

  const openRows = [];
  wins.order.slice().reverse().forEach((id) => {
    const w = wins.wins[id];
    if (!w) return;
    w.tabs.forEach((t) => {
      const tt = t.title || t.url;
      if (query && String(tt + " " + t.url).toLowerCase().includes(query) === false) return;
      openRows.push({
        t: esc(tt), sub: appById[w.appId].name, g: appById[w.appId].glyph, acc: appById[w.appId].accent, kbd: "窗口",
        run: () => { if (w.min) wins.setMin(id, false); wins.focusWin(id); wins.showTab(id, t.id); },
        tabNew: () => wins.tabNew(id, t.url),
      });
    });
  });
  if (openRows.length) rows.push({ title: "已打开的标签", items: openRows.slice(0, 8) });

  if (scope.value === "all" || scope.value === "recent") {
    Object.values(appById).forEach((a) => {
      if (scope.value !== "all" && scope.value !== "recent" && scope.value !== a.id) return;
      const mods = [];
      (a.modules || []).forEach((g) => (g.items || []).forEach((it) => {
        if (query && it.label.toLowerCase().includes(query) === false) return;
        mods.push({ t: esc(it.label), sub: esc(a.name + (it.hint ? " · " + it.hint : "")), g: it.glyph, acc: a.accent, href: it.href });
      }));
      const toc = desk.toc(a.toc);
      (toc && toc.chapters || []).forEach((c) => {
        if (query && (c.name + c.code).toLowerCase().includes(query) === false) return;
        mods.push({
          t: esc(c.name), sub: esc(a.name + " · " + c.count + " 篇"),
          g: (a.chapterIcons && a.chapterIcons[c.code]) || "list",
          acc: (a.chapterColors && a.chapterColors[c.code]) || a.accent, href: c.href,
        });
      });
      if (mods.length) rows.push({
        title: a.name + " 的模块",
        items: mods.slice(0, 14).map((m) => ({
          t: m.t, sub: m.sub, g: m.g, acc: m.acc,
          run: () => wins.gotoModule(m.href),
          tabNew: () => wins.tabNew(m.href.indexOf("/jbl/") === 0 ? "jbl" : "javaguide", m.href),
        })),
      });
    });
  }

  if (!query && (scope.value === "all" || scope.value === "recent")) {
    const rec = desk.recent;
    if (rec.length) rows.push({
      title: "最近打开",
      items: rec.slice(0, 6).map((r) => ({
        t: esc(r.title || r.url), sub: esc(r.url), g: "clock", acc: "var(--txt-3)",
        run: () => wins.openRecent(r),
      })),
    });
  }
  return rows;
});

const remoteRows = computed(() => {
  const hits = remote.value.filter((h) => scope.value === "all" || scope.value === h.app || scope.value === "recent");
  if (!hits.length) return [];
  const groups = {};
  hits.forEach((h) => {
    const name = h.app === "jbl" ? "JBL 火箭题库" : "JavaGuide 离线小抄";
    (groups[name] = groups[name] || []).push(h);
  });
  return Object.keys(groups).map((name) => ({
    title: name + " 的正文",
    items: groups[name].map((h) => {
      const app = h.app === "jbl" ? "jbl" : "javaguide";
      return {
        t: hl(h.title, q.value),
        sub: esc(h.sub || "") + (h.kind ? " · " + esc(h.kind) : ""),
        snip: h.snip ? hl(h.snip, q.value) : "",
        g: app === "jbl" ? "bolt" : "book", acc: appById[app].accent,
        run: () => wins.gotoModule(h.url),
        tabNew: () => { if (!wins.wins[app]) wins.openApp(app, { url: h.url }); else wins.tabNew(app, h.url); },
      };
    }),
  }));
});

const groups = computed(() => {
  const out = [...localRows.value];
  if (scope.value !== "recent") out.push(...remoteRows.value);
  return out;
});
const flat = computed(() => groups.value.flatMap((g) => g.items));
const flatIndex = (gi, ii) => groups.value.slice(0, gi).reduce((s, g) => s + g.items.length, 0) + ii;

function pick(it, shift = false) {
  if (shift && it.tabNew) it.tabNew();
  else it.run();
  if (!shift) ui.closePalette();
}
function onKey(ev) {
  if (ev.key === "Escape") { ev.preventDefault(); ui.closePalette(); return; }
  if (ev.key === "ArrowDown") { ev.preventDefault(); hiIdx.value = (hiIdx.value + 1) % Math.max(flat.value.length, 1); }
  else if (ev.key === "ArrowUp") { ev.preventDefault(); hiIdx.value = (hiIdx.value - 1 + flat.value.length) % Math.max(flat.value.length, 1); }
  else if (ev.key === "Enter") {
    ev.preventDefault();
    const it = flat.value[hiIdx.value];
    if (it) pick(it, ev.shiftKey);
  } else if (ev.key === "Tab") ev.preventDefault();
}

watch(ui, (s) => {
  if (s.paletteOpen) {
    q.value = "";
    scope.value = s.paletteScope || "all";
    hiIdx.value = 0;
    desk.loadCatalog();
    nextTick(() => input.value?.focus());
  }
});
onMounted(() => { desk.loadCatalog(); });
</script>
