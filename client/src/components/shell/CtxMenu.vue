<template>
  <Teleport to="body">
    <div v-if="ctx.open" ref="pop" class="ctx-pop glass-thick" role="menu" :style="popStyle">
      <template v-for="(it, i) in ctx.items" :key="i">
        <div v-if="it.sep" class="menu-sep" />
        <div v-else-if="it.title" class="menu-title">{{ it.title }}</div>
        <button
          v-else
          type="button"
          role="menuitem"
          class="menu-item"
          :class="{ danger: it.danger, hi: i === hi }"
          :disabled="it.disabled"
          @click.stop="onPick(it)"
          @pointerenter="hi = it.disabled ? hi : i"
        >
          <span v-if="it.glyph" class="mi-g" v-html="gl(it.glyph)" />
          <span v-else class="tick">{{ it.checked ? "✓" : "" }}</span>
          <span class="mi-t">{{ it.label }}</span>
          <span v-if="it.kbd" class="kbd">{{ it.kbd }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { ctxState as ctx, closeCtx } from "./ctx";
import { gl } from "../../lib/icons";

const pop = ref(null);
const hi = ref(-1);
const pos = reactive({ x: 0, y: 0 });

const popStyle = computed(() => ({ left: pos.x + "px", top: pos.y + "px" }));

function place() {
  const el = pop.value;
  if (!el) return;
  let x = ctx.x, y = ctx.y;
  if (ctx.anchor) {
    const a = ctx.anchor.getBoundingClientRect();
    x = a.left;
    y = a.bottom + 3;
  }
  const r = el.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) {
    x = ctx.anchor ? Math.max(8, ctx.anchor.getBoundingClientRect().right - r.width) : Math.max(8, window.innerWidth - r.width - 8);
  }
  if (y + r.height > window.innerHeight - 8) y = Math.max(8, y - r.height - 8);
  pos.x = Math.round(x);
  pos.y = Math.round(y);
  // macOS 右键弹出不预高亮任何行：高亮只来自悬停 / 方向键
  hi.value = -1;
}

function onPick(it) {
  if (it.disabled) return;
  closeCtx();
  if (it.fn) it.fn();
}

function onKey(ev) {
  if (!ctx.open) return;
  const btns = [...(pop.value?.querySelectorAll(".menu-item") || [])];
  if (!btns.length) return;
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    let n = hi.value;
    for (let k = 0; k < btns.length; k++) {
      n = (n + (ev.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length;
      if (!btns[n].disabled) break;
    }
    hi.value = n;
    btns[n]?.scrollIntoView({ block: "nearest" });
  } else if (ev.key === "Enter" || ev.key === " ") {
    ev.preventDefault();
    btns[hi.value]?.click();
  } else if (ev.key === "Escape") {
    ev.preventDefault();
    closeCtx();
  }
}

function onDocClick(ev) {
  if (!ctx.open) return;
  if (pop.value && pop.value.contains(ev.target)) return;
  if (ev.target.closest("[data-ctx-anchor]")) return;
  closeCtx();
}

watch(() => ctx.open, async (v) => {
  if (v) {
    await nextTick();
    place();
  }
});

onMounted(() => {
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("click", onDocClick, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKey, true);
  document.removeEventListener("click", onDocClick, true);
});
</script>
