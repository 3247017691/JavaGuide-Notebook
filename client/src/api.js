/* 本机 API 的薄封装：错误一律返回结构化对象，不抛裸异常 */

export async function getJSON(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? await r.json() : { error: `HTTP ${r.status}` };
  } catch (e) {
    return { error: (e && e.message) || "网络错误" };
  }
}

export async function postJSON(url, body) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, d };
  } catch (e) {
    return { ok: false, d: { error: (e && e.message) || "网络错误" } };
  }
}

export async function getText(url) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}
