/* 玻璃弹层菜单引擎：菜单栏 / 工具栏 ⋯ / 右键 / 长按共用同一份 items。
   items: {label, glyph, kbd, checked, disabled, danger, title, sep, fn} */
import { reactive } from "vue";

export const ctxState = reactive({
  open: false,
  items: [],
  x: 0,
  y: 0,
  anchor: null,   // HTMLElement：锚定在其下方
  owner: null,    // 'bar:file' 等，用于菜单间悬停切换
});

export function openCtx(spec) {
  const items = (Array.isArray(spec) ? spec : spec.items || []).filter(Boolean);
  if (!items.length) return;
  ctxState.open = true;
  ctxState.items = items;
  ctxState.x = spec.x ?? 0;
  ctxState.y = spec.y ?? 0;
  ctxState.anchor = spec.anchor || null;
  ctxState.owner = spec.owner || null;
}

export function closeCtx() {
  ctxState.open = false;
  ctxState.items = [];
  ctxState.anchor = null;
  ctxState.owner = null;
}

export function isCtxOwner(prefix) {
  return ctxState.open && typeof ctxState.owner === "string" && ctxState.owner.startsWith(prefix);
}
