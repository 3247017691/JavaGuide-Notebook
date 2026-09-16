/* 外壳 UI 状态：toast / 弹层 sheet / 命令面板 / 启动台 */
import { defineStore } from "pinia";

let toastTimer = 0;

export const useUi = defineStore("ui", {
  state: () => ({
    toast: null,        // { msg, bad }
    sheet: null,        // { type: 'about'|'prefs'|'shortcuts'|'guide'|'confirm', props }
    paletteOpen: false,
    paletteScope: "all",
    launchpad: false,
    launchpadFolder: null, // 'jbl' = 题库检查系统面板
  }),
  actions: {
    showToast(msg, bad = false) {
      this.toast = { msg, bad, n: (this.toast?.n || 0) + 1 };
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { this.toast = null; }, 2200);
    },
    openSheet(type, props = {}) { this.sheet = { type, props }; this.paletteOpen = false; },
    closeSheet() { this.sheet = null; },
    openPalette(scope = "all") { this.paletteScope = scope; this.paletteOpen = true; this.launchpad = false; },
    closePalette() { this.paletteOpen = false; },
    openLaunchpad() { this.launchpad = true; this.launchpadFolder = null; },
    closeLaunchpad() { this.launchpad = false; this.launchpadFolder = null; },
  },
});
