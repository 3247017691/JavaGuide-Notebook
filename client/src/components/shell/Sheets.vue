<template>
  <Teleport to="body">
    <div v-if="ui.sheet" class="sheet-scrim" @pointerdown.self="ui.closeSheet()" @keydown.esc="ui.closeSheet()">
      <section class="sheet glass-thick" :class="{ wide: sheet.type !== 'about' }" role="dialog" aria-modal="true"
               :aria-label="titleText">
        <h2>{{ titleText }}</h2>

        <!-- 关于本机 -->
        <div v-if="sheet.type === 'about'" class="sh-body">
          <div class="about-head">
            <span class="about-mark" v-html="icons.workbench()" />
            <div>
              <h2 style="padding: 0">面试工作台</h2>
              <p class="about-ver">桌面壳 3.0 · Vue 3 + Element Plus · 液态玻璃 · 全部本地运行</p>
            </div>
          </div>
          <ul class="about-apps">
            <li v-for="a in APPS" :key="a.id">
              <span class="ai" v-html="icons[a.icon]()" />
              <span><b>{{ a.name }}</b><br><small>{{ a.desc }}</small></span>
            </li>
          </ul>
          <p class="about-note">
            窗口位置、标签页与侧边栏状态记在浏览器 <code>localStorage</code>（<code>desk:session</code>），
            外观偏好记在 <code>desk:prefs</code>。想再加一个应用：把它做成静态站或本机服务，
            然后在 <code>client/src/lib/apps.js</code> 的注册表里添一条，桌面图标、程序坞、侧栏与快捷键会自动就位。
          </p>
        </div>

        <!-- 显示偏好 -->
        <div v-else-if="sheet.type === 'prefs'" class="sh-body">
          <div class="prefs">
            <div class="pref-row">
              <div class="pf-t"><b>外观</b><span>浅色 / 深色 / 跟随系统；窗口内容会一起换装</span></div>
              <div class="seg" role="group" aria-label="外观">
                <button type="button" :aria-pressed="prefs.theme === 'auto'" @click="prefs.setTheme('auto')">跟随系统</button>
                <button type="button" :aria-pressed="prefs.theme === 'light'" @click="prefs.setTheme('light')">浅色</button>
                <button type="button" :aria-pressed="prefs.theme === 'dark'" @click="prefs.setTheme('dark')">深色</button>
              </div>
            </div>
            <div class="pref-row">
              <div class="pf-t"><b>桌面壁纸</b><span>玻璃面会透出壁纸的颜色 —— 越暗、明暗跨度越大，玻璃的通透感越明显</span></div>
              <div class="wall-pick" role="group" aria-label="桌面壁纸">
                <button v-for="w in WALLS" :key="w.id" type="button"
                        :title="w.name" :aria-label="w.name"
                        :aria-pressed="String(prefs.wall === w.id)"
                        :style="{ background: w.chip }"
                        @click="prefs.setWall(w.id)" />
              </div>
            </div>
            <div class="pref-row">
              <div class="pf-t"><b>降低透明度</b><span>材质退成实面，玻璃不再透出下层内容（等同系统的「减少透明度」）</span></div>
              <button type="button" class="sw" role="switch" :aria-checked="String(prefs.opaque === 1)" @click="prefs.toggleOpaque()" />
            </div>
            <div class="pref-row">
              <div class="pf-t"><b>侧边栏宽度</b><span>拖窗口左侧的分隔线也能调，双击分隔线复位</span></div>
              <div class="seg" role="group" aria-label="侧边栏宽度">
                <button v-for="w in [168, 226, 300]" :key="w" type="button"
                        :aria-pressed="String(wins.frontWin ? wins.frontWin.sideW : prefs.sideW) === String(w)"
                        @click="setSideW(w)">{{ { 168: "窄", 226: "标准", 300: "宽" }[w] }}</button>
              </div>
            </div>
            <p class="about-note" style="margin-top: 10px">
              系统级偏好也会被尊重：<em>prefers-color-scheme</em> 决定默认外观、
              <em>prefers-reduced-motion</em> 关掉动效、<em>prefers-reduced-transparency</em> 自动降到实面。
            </p>
          </div>
        </div>

        <!-- 键盘快捷键 -->
        <div v-else-if="sheet.type === 'shortcuts'" class="sh-body">
          <div class="kb-grid">
            <div v-for="k in KEYS" :key="k[0]">{{ k[0] }}<kbd>{{ k[1] }}</kbd></div>
          </div>
          <p class="about-note">Windows 上按 Ctrl，macOS 上按 ⌘，两者等价。小抄是原生窗口内容、直接响应；
            题库（iframe）里的按键经 <code>desk-bridge.js</code> 转交外壳处理。</p>
        </div>

        <!-- 操作指南 -->
        <div v-else-if="sheet.type === 'guide'" class="sh-body">
          <template v-if="!guideSide">
            <p>这套外壳的所有动作都有 <b>四条入口</b>，任何一条被堵住（例如环境禁掉右键、或你用的是触摸屏）都不影响其余三条：</p>
            <div class="kb-grid">
              <div><b>① 长按 0.5 秒</b><kbd>按住不放</kbd></div>
              <div><b>② 顶部菜单栏</b><kbd>点菜单名</kbd></div>
              <div><b>③ 工具栏 ⋯ 按钮</b><kbd>窗口右上角</kbd></div>
              <div><b>④ 命令面板</b><kbd>{{ MOD }} K</kbd></div>
            </div>
            <p>右键 / 长按的位置决定菜单内容：<b>桌面空白处</b>得到桌面菜单，<b>标签页</b>上得到标签菜单，
              <b>侧栏条目</b>上得到「当前页打开 / 新标签页打开」，<b>窗口标题栏</b>得到窗口菜单。</p>
            <div class="kb-grid">
              <div>新建标签页<kbd>{{ MOD }} T</kbd></div>
              <div>关闭标签页<kbd>{{ MOD }} W</kbd></div>
              <div>切换标签页<kbd>{{ MOD }} ⇧ [ / ]</kbd></div>
              <div>显示 / 隐藏侧栏<kbd>{{ MOD }} B</kbd></div>
              <div>切换外观<kbd>{{ MOD }} ⇧ D</kbd></div>
              <div>这份指南<kbd>{{ MOD }} /</kbd></div>
            </div>
          </template>
          <template v-else>
            <p>· 点侧栏条目 = 在<b>当前标签页</b>打开；右键侧栏条目 = 可以选择<b>在新标签页打开</b>。</p>
            <p>· 拖<b>侧栏与正文之间那条缝</b>可改宽度，双击那条缝复位；键盘也可以：<kbd>Tab</kbd> 走到分隔线后用 <kbd>←</kbd><kbd>→</kbd>。</p>
            <p>· 标签页可拖动排序，双击或按 <kbd>Delete</kbd> 关闭，鼠标中键也关。</p>
            <p>· 只有 1 个标签时标签条自动收起，把宽度全部让给正文。</p>
          </template>
        </div>

        <div class="sh-acts">
          <button v-if="sheet.type === 'about'" class="btn" type="button" @click="ui.openSheet('guide')">操作指南</button>
          <button v-if="sheet.type === 'guide'" class="btn" type="button" @click="ui.openSheet('shortcuts')">看快捷键全表</button>
          <button class="btn pri" type="button" data-def @click="ui.closeSheet()">好</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, watch, nextTick } from "vue";
import { APP_ICONS } from "../../lib/icons";
import { APPS, MOD } from "../../lib/apps";
import { useUi } from "../../stores/ui";
import { usePrefs, WALLS } from "../../stores/prefs";
import { useWins } from "../../stores/windows";

const icons = APP_ICONS;
const ui = useUi();
const prefs = usePrefs();
const wins = useWins();

const sheet = computed(() => ui.sheet || {});
const guideSide = computed(() => sheet.value.type === "guide" && sheet.value.props && sheet.value.props.which === "side");
const titleText = computed(() => ({
  about: "面试工作台",
  prefs: "显示偏好",
  shortcuts: "键盘快捷键",
  guide: guideSide.value ? "侧边栏与标签页" : "怎样在不能右键的网页里操作一切",
}[sheet.value.type] || "对话框"));

const KEYS = [
  ["打开第 1 / 2 个应用", "Ctrl ⌘ + 1 / 2"],
  ["启动台", "Ctrl ⌘ + ⇧ A"],
  ["全局搜索与命令面板", "Ctrl ⌘ + K"],
  ["新建标签页", "Ctrl ⌘ + T"],
  ["关闭标签页 / 窗口", "Ctrl ⌘ + W ／ ⇧ W"],
  ["切换标签页", "Ctrl ⌘ + ⇧ + [ ／ ]"],
  ["后退 / 前进（当前标签页）", "Ctrl ⌘ + [ ／ ]"],
  ["重新载入这一页", "Ctrl ⌘ + R"],
  ["显示 / 隐藏侧边栏", "Ctrl ⌘ + B"],
  ["外观：跟随系统 → 浅 → 深", "Ctrl ⌘ + ⇧ + D"],
  ["窗口居左 / 居右半屏", "Ctrl ⌘ + ⇧ + ← ／ →"],
  ["两窗并列排布", "Ctrl ⌘ + ⇧ + F"],
  ["最小化 / 缩放窗口", "Ctrl ⌘ + M ／ ⇧ + ＝"],
  ["切换到下一个窗口", "Ctrl ⌘ + `"],
  ["打开这份快捷键表", "?"],
  ["操作指南（没有右键怎么用）", "Ctrl ⌘ + /"],
  ["关闭当前浮层 / 菜单", "Esc"],
];

function setSideW(w) {
  prefs.setSideW(w);
  Object.keys(wins.wins).forEach((id) => wins.setSideW(id, w));
}

watch(ui, (s) => {
  if (s.sheet) {
    nextTick(() => {
      document.querySelector(".sheet [data-def]")?.focus();
    });
  }
});
</script>
