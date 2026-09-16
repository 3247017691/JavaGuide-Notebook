/* 液玻璃交互 —— 样式在 styles/desk.css 末尾的「液玻璃增强」一节，两处名单必须一致。
   三件事都属「材质自己怎么反光」，所以收在一处，且只在系统没要求减少动效时开工：
     · 开闸 —— 往 <html> 写 data-desk-liquid，CSS 整段挂在这个属性下
     · 高光 —— 委托 pointermove，把指针在「当前这块玻璃」里的局部坐标写成 --mx/--my
     · 涟漪 —— pointerdown 时在宿主里放一个圆环，animationend 自己收走
   边界：只认外壳的玻璃面。窗口正文是 iframe，事件不冒泡到本文档，
   所以正文里点不会出涟漪 —— 那里本来也不是玻璃。 */

/* 与 desk.css 里那串 :is(...) 是同一个人名单，改一边就得改另一边 */
const HOSTS = [
  ".dock", ".win-bar", ".win-side", ".ctx-pop", ".palette",
  ".sheet-scrim .sheet", ".desk-toast", ".widget", ".lp-panel", ".lp-search", ".d-tip",
].join(", ");

const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const mqHover = window.matchMedia("(hover: none)");

export function liquidOn() {
  return !mqMotion.matches;
}

function applyLiquid() {
  if (liquidOn()) document.documentElement.dataset.deskLiquid = "1";
  else document.documentElement.removeAttribute("data-desk-liquid");
}

function hostOf(target) {
  return target && target.closest ? target.closest(HOSTS) : null;
}

/* 追踪高光：只维护指针所在的那一块玻璃 */
function trackSpec() {
  if (mqHover.matches) return;      /* 触屏没有悬停，这一维不存在 */
  let cur = null;
  let raf = 0;
  let cx = 0;
  let cy = 0;

  document.addEventListener("pointermove", (ev) => {
    const h = hostOf(ev.target);
    if (h !== cur) {
      /* 换面时把上一块的光斑收回：不清的话它会僵在最后停下的位置，像块污渍 */
      if (cur) {
        cur.style.removeProperty("--mx");
        cur.style.removeProperty("--my");
      }
      cur = h;
    }
    if (!cur) return;
    cx = ev.clientX;
    cy = ev.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!liquidOn() || !cur) return;
      /* rect 每帧现取、不缓存：窗口能被拖走、侧栏能被拉宽、标签条能横向滚，
         缓存下来光斑会系统性走偏。一帧至多一次，而且只算指针所在的那一块。 */
      const r = cur.getBoundingClientRect();
      cur.style.setProperty("--mx", Math.round(cx - r.left) + "px");
      cur.style.setProperty("--my", Math.round(cy - r.top) + "px");
    });
  }, { passive: true });

  /* 指针整个离开文档（切标签页、移到浏览器外）时把光斑收干净 */
  document.addEventListener("pointerleave", () => {
    if (!cur) return;
    cur.style.removeProperty("--mx");
    cur.style.removeProperty("--my");
    cur = null;
  });
}

/* 点击涟漪 */
function trackRipple() {
  const boxes = new WeakMap();

  document.addEventListener("pointerdown", (ev) => {
    if (!liquidOn()) return;        /* 中途关掉之后不再生成新的 */
    const h = hostOf(ev.target);
    if (!h) return;
    const r = h.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    /* 直径取「点击点到最远那个角」的两倍，于是 scale(1) 正好铺满整块容器 */
    const d = 2 * Math.max(
      Math.hypot(x, y),
      Math.hypot(r.width - x, y),
      Math.hypot(x, r.height - y),
      Math.hypot(r.width - x, r.height - y),
    );

    let box = boxes.get(h);
    if (!box) {
      box = document.createElement("span");
      box.className = "rip-layer";
      box.setAttribute("aria-hidden", "true");
      /* 插在最前：装饰层该待在内容之下，万一宿主漏了层叠上下文也不会压住字 */
      h.insertBefore(box, h.firstChild);
      boxes.set(h, box);
    }

    const el = document.createElement("i");
    el.className = "ripple";
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--rx", x + "px");
    el.style.setProperty("--ry", y + "px");
    el.style.setProperty("--rd", d + "px");
    el.addEventListener("animationend", () => el.remove());
    /* 兜底：动画被掐掉（按下之后系统才切成减少动效）就不会有 animationend，
       只靠事件回收会留下永久节点，所以补一个定时器。remove() 是幂等的。 */
    setTimeout(() => el.remove(), 1000);
    box.appendChild(el);
  }, true);   /* 捕获阶段：子元素自己 stopPropagation 也照收 —— 按下反馈不该被吞掉 */
}

export function initLiquid() {
  applyLiquid();
  /* 减少动效不是「启动时读一次的常数」：用户在系统里改完偏好回来、页面还开着，
     得跟着变。摘属性时不用手动扫 DOM —— CSS 里 .wallpaper .blob / .rip-layer /
     .ripple 默认就是 display:none，属性一没它们立刻退场。 */
  if (mqMotion.addEventListener) mqMotion.addEventListener("change", applyLiquid);
  else if (mqMotion.addListener) mqMotion.addListener(applyLiquid);
  trackSpec();
  trackRipple();
}
