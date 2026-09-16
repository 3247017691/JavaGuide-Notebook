/* 应用注册表（移植自 desktop/apps.js 的 DESK_APPS）
   id / name / src / accent / toc / modeKey / w·h / modules / actions 全部保留 */
import { JG_CHAPTER_ICONS, CH_COLORS, JBL_CHAPTER_ICONS } from "./icons";

export const APPS = [
  {
    id: "javaguide",
    name: "JavaGuide 离线小抄",
    src: "/index.html",
    icon: "javaguide",
    glyph: "book",
    accent: "#b0492f",
    toc: "javaguide",
    modeKey: "read-mode",
    bulk: true,
    native: true, // 原生 Vue 宿主（去 iframe 化）
    w: 1180, h: 760, minW: 760, minH: 460,
    desc: "332 篇离线阅读 · 已读划线与进度统计（依赖本机 MySQL）",
    chapterIcons: JG_CHAPTER_ICONS,
    chapterColors: CH_COLORS,
    modules: [
      { title: "学习", items: [
        { label: "桌面卡阵", glyph: "grid", href: "/index.html", hint: "12 章一屏看全" },
      ] },
    ],
    actions: [
      { act: "reload", label: "重新载入", glyph: "reload", kbd: "Ctrl R" },
      { act: "bulk:chapter", label: "整章标记已读", glyph: "checkmark" },
      { act: "blank", label: "在新标签页打开", glyph: "external" },
    ],
  },
  {
    id: "jbl",
    name: "JBL 火箭题库",
    src: "/jbl/index.html",
    icon: "jbl",
    glyph: "bolt",
    accent: "#ff6a3d",
    toc: "jbl",
    modeKey: "jbl-rocket:mode",
    w: 1180, h: 760, minW: 720, minH: 460,
    desc: "14 章 308 题检查单 · 掌握进度存于本机 MySQL（离线时暂存浏览器）",
    chapterIcons: JBL_CHAPTER_ICONS,
    modules: [
      { title: "任务", items: [
        { label: "控制台总览", glyph: "grid", href: "/jbl/index.html", hint: "准备度面板" },
      ] },
    ],
    actions: [
      { act: "reload", label: "重新载入", glyph: "reload", kbd: "Ctrl R" },
      { act: "blank", label: "在新标签页打开", glyph: "external" },
    ],
  },
];

export const appById = Object.fromEntries(APPS.map((a) => [a.id, a]));

export const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");
export const MOD = isMac ? "⌘" : "Ctrl";
export const MODK = isMac ? "⌘" : "Ctrl+";
