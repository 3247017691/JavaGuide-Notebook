/* 外观偏好：desk:prefs（theme/opaque/wall/sideW）+ 小抄 read-mode/read-size。
   深浅色落到 <html>（.dark 给 Element Plus、data-desk-theme 给玻璃 token）。
   与小抄的联动规则沿用原版：外壳显式选了浅/深 → 下发并持久化到 read-mode；
   外壳「跟随系统」→ 小抄自己决定（没手动选过就跟系统），应用内切换反过来收养外壳。 */
import { defineStore } from "pinia";

const KEY_PREF = "desk:prefs";
const KEY_MODE = "read-mode";
const KEY_SIZE = "read-size";

/* 可选壁纸。真正的配色在 styles/desk.css 的 html[data-desk-wall="…"] 里，
   这里只登记 id / 名字 / 选择器上那个小色片的预览渐变（取壁纸的三个代表色）。
   加一套壁纸 = 这里加一条 + desk.css 里加浅深两块 token，别处都不用动。 */
export const WALLS = [
  { id: "linen", name: "暖贝", chip: "linear-gradient(150deg, #c9b48c, #8f7a5c, #463a29)" },
  { id: "abyss", name: "深海", chip: "linear-gradient(150deg, #5a7ea6, #33506f, #08131f)" },
  { id: "dusk", name: "暮山", chip: "linear-gradient(150deg, #e2a468, #c4737c, #37234a)" },
  { id: "moss", name: "苔原", chip: "linear-gradient(150deg, #a8b892, #6d8468, #1c2a22)" },
];
const WALL_IDS = WALLS.map((w) => w.id);

function loadJSON(key, def) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "");
    return v && typeof v === "object" ? v : def;
  } catch { return def; }
}
function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 隐私模式 */ } }

const mqDark = window.matchMedia("(prefers-color-scheme: dark)");

export const usePrefs = defineStore("prefs", {
  state: () => {
    const p = loadJSON(KEY_PREF, {});
    return {
      theme: ["auto", "light", "dark"].includes(p.theme) ? p.theme : "auto",
      opaque: p.opaque ? 1 : 0,
      wall: WALL_IDS.includes(p.wall) ? p.wall : "linen",
      sideW: Math.max(168, Math.min(340, Number(p.sideW) || 226)),
      nbSize: localStorage.getItem(KEY_SIZE) === "s" || localStorage.getItem(KEY_SIZE) === "l"
        ? localStorage.getItem(KEY_SIZE) : "m",
      sysDark: mqDark.matches,
    };
  },
  getters: {
    resolved: (s) => (s.theme === "auto" ? (s.sysDark ? "dark" : "light") : s.theme),
    /* 小抄的 day/night：外壳显式档直接映射；auto 档看 read-mode 有没有手动值，没有就跟系统 */
    nbMode(s) {
      if (s.theme === "dark") return "night";
      if (s.theme === "light") return "day";
      const m = localStorage.getItem(KEY_MODE);
      if (m === "night") return "night";
      if (m === "day") return "day";
      return s.sysDark ? "night" : "day";
    },
  },
  actions: {
    init() {
      if (mqDark.addEventListener) {
        mqDark.addEventListener("change", () => { this.sysDark = mqDark.matches; this.apply(); });
      }
      this.apply();
    },
    apply() {
      const r = this.resolved;
      document.documentElement.classList.toggle("dark", r === "dark");
      document.documentElement.dataset.deskTheme = r;
      document.documentElement.dataset.deskOpaque = this.opaque ? "1" : "0";
      document.documentElement.dataset.deskWall = this.wall;
      // 同步到小抄容器（走 read-mode 键，规则与原版一致）
      const m = this.nbMode;
      if (this.theme !== "auto") {
        try { localStorage.setItem(KEY_MODE, m === "night" ? "night" : "day"); } catch { /* 忽略 */ }
      }
      document.documentElement.dataset.nbMode = m;
    },
    save() { saveJSON(KEY_PREF, { theme: this.theme, opaque: this.opaque, wall: this.wall, sideW: this.sideW }); },
    setTheme(t) { this.theme = t; this.apply(); this.save(); },
    cycleTheme() {
      const seq = ["auto", "light", "dark"];
      this.setTheme(seq[(seq.indexOf(this.theme) + 1) % seq.length]);
    },
    toggleOpaque() { this.opaque = this.opaque ? 0 : 1; this.apply(); this.save(); },
    setWall(id) { if (!WALL_IDS.includes(id)) return; this.wall = id; this.apply(); this.save(); },
    setSideW(px) { this.sideW = Math.max(168, Math.min(340, Math.round(px))); this.save(); },
    /* 小抄页内按钮切夜读：显式写 read-mode；外壳在 auto 档时收养成同款深浅（并持久化，同原版 adoptMode） */
    setNbMode(mode) {
      if (mode !== "day" && mode !== "night") return;
      try { localStorage.setItem(KEY_MODE, mode); } catch { /* 忽略 */ }
      if (this.theme === "auto") {
        this.theme = mode === "night" ? "dark" : "light";
        this.save();
      }
      this.apply();
    },
    cycleNbSize() {
      const seq = ["s", "m", "l"];
      this.nbSize = seq[(seq.indexOf(this.nbSize) + 1) % seq.length];
      try { localStorage.setItem(KEY_SIZE, this.nbSize); } catch { /* 忽略 */ }
    },
  },
});
