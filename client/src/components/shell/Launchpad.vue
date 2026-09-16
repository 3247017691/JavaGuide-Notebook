<template>
  <Teleport to="body">
    <div v-if="ui.launchpad" class="launchpad" @pointerdown.self="ui.closeLaunchpad()" @keydown.esc="ui.closeLaunchpad()">
      <div class="lp-search glass-med">
        <span v-html="gl('search')" />
        <input ref="input" v-model="q" type="search" placeholder="搜索应用与章节" aria-label="搜索应用与章节" />
        <button class="lp-more" type="button" aria-label="更多" @click="ui.closeLaunchpad()" v-html="gl('ellipsis')" />
      </div>

      <div class="lp-body desk-scroll">
        <!-- 文件夹玻璃面板（参考图 2）：题库的检查系统 -->
        <template v-if="ui.launchpadFolder === 'jbl'">
          <h2 class="lp-title" style="text-align: center">检查系统</h2>
          <div class="lp-panel glass-thick">
            <div class="lp-grid">
              <button v-for="c in jblChapters" :key="c.code" type="button" class="lp-item" @click="openJbl(c)">
                <span class="li-img" v-html="tileGlyph((appById.jbl.chapterIcons || {})[c.code] || 'list')" />
                <span class="li-name">{{ c.name }}</span>
              </button>
            </div>
          </div>
          <div class="lp-dots" aria-hidden="true"><i class="on" /><i /></div>
        </template>

        <!-- 主网格（参考图 1） -->
        <template v-else>
          <div class="lp-grid">
            <button v-for="it in grid" :key="it.key" type="button" class="lp-item" @click="open(it)">
              <span class="li-img" v-html="it.img" />
              <span class="li-name">{{ it.name }}</span>
            </button>
            <div v-if="!grid.length" class="pal-empty" style="grid-column: 1 / -1">
              <b>没有匹配「{{ q }}」的应用或章节</b>
            </div>
          </div>
          <div class="lp-dots" aria-hidden="true"><i class="on" /><i /></div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { gl } from "../../lib/icons";
import { APP_ICONS } from "../../lib/icons";
import { APPS, appById } from "../../lib/apps";
import { useUi } from "../../stores/ui";
import { useWins } from "../../stores/windows";
import { useDesk } from "../../stores/desk";

const ui = useUi();
const wins = useWins();
const desk = useDesk();
const q = ref("");
const input = ref(null);
const icons = APP_ICONS;

function tileGlyph(name) {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="lp-tile-${name}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5b6472"/><stop offset="1" stop-color="#2c333d"/>
    </linearGradient></defs>
    <rect width="64" height="64" rx="14" fill="url(#lp-tile-${name})"/>
    <g transform="translate(16 16) scale(1.34)" fill="none" stroke="#e8ecf3" stroke-width="1.5"
       stroke-linecap="round" stroke-linejoin="round">${(gl(name).match(/<svg[^>]*>([\s\S]*)<\/svg>/) || [, ""])[1]}</g>
  </svg>`;
}
function chapterTile(code, name, color, icon) {
  const inner = (gl(icon).match(/<svg[^>]*>([\s\S]*)<\/svg>/) || [, ""])[1];
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="lp-ch-${code}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".92"/><stop offset="1" stop-color="${color}"/>
    </linearGradient></defs>
    <rect width="64" height="64" rx="14" fill="url(#lp-ch-${code})"/>
    <rect x="4" y="4" width="56" height="6" rx="3" fill="rgba(255,255,255,.35)"/>
    <g transform="translate(16 18) scale(1.34)" fill="none" stroke="#f7f2e8" stroke-width="1.5"
       stroke-linecap="round" stroke-linejoin="round">${inner}</g>
  </svg>`;
}

const jblChapters = computed(() => {
  const toc = desk.toc("jbl");
  return (toc && toc.chapters) || [];
});

const grid = computed(() => {
  const query = q.value.trim().toLowerCase();
  const out = [];
  APPS.forEach((a) => {
    if (query && a.name.toLowerCase().includes(query) === false) return;
    out.push({ key: a.id, name: a.name, img: icons[a.icon](), run: () => wins.dockClick(a.id) });
  });
  const jg = desk.toc("javaguide");
  if (!desk.catalog) {
    out.push({ key: "loading", name: "目录载入中…", img: icons.launchpad(), run: () => {} });
  } else if (!jg) {
    out.push({ key: "fail", name: "目录加载失败：服务未启动？", img: icons.launchpad(), run: () => {} });
  } else {
    (jg.chapters || []).forEach((c) => {
      if (query && (c.name + c.code).toLowerCase().includes(query) === false) return;
      const a = appById.javaguide;
      out.push({
        key: "jg-" + c.code, name: c.name,
        img: chapterTile(c.code, c.name, (a.chapterColors || {})[c.code] || a.accent, (a.chapterIcons || {})[c.code] || "list"),
        run: () => wins.gotoModule(c.href),
      });
    });
    const jblToc = desk.toc("jbl");
    if (jblToc && jblToc.chapters && jblToc.chapters.length) {
      if (!query || "题库 检查系统 火箭 jbl".toLowerCase().includes(query)) {
        out.push({ key: "jbl-folder", name: "检查系统（14）", img: folderIcon(), run: () => { ui.launchpadFolder = "jbl"; } });
      }
    }
  }
  return out;
});

function folderIcon() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="lp-folder" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8fb6e8"/><stop offset="1" stop-color="#5a86c8"/>
    </linearGradient></defs>
    <rect width="64" height="64" rx="14" fill="url(#lp-folder)"/>
    <path d="M12 22a4 4 0 0 1 4-4h9l4 4h19a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" fill="#eaf1fb" opacity=".94"/>
    <rect x="12" y="28" width="40" height="18" rx="4" fill="#dfe9f8"/>
  </svg>`;
}

function open(it) { it.run(); }
function openJbl(c) {
  wins.gotoModule(c.href);
  ui.closeLaunchpad();
}

watch(ui, (s) => {
  if (s.launchpad) {
    q.value = "";
    desk.loadCatalog();
    nextTick(() => input.value?.focus());
  }
});
</script>
