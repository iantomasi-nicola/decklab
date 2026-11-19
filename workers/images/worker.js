// src/index.ts
var SOURCES = {
  small: "https://images.ygoprodeck.com/images/cards_small",
  full: "https://images.ygoprodeck.com/images/cards",
  cropped: "https://images.ygoprodeck.com/images/cards_cropped"
};
var PATH_RE = /^\/(small|full|cropped)\/(\d{1,10})\.(jpg|webp)$/;
var MIN_GAP_MS = 100;
var MAX_RETRIES = 3;
var nextSlot = 0;
function resetThrottle() {
  nextSlot = 0;
}
async function throttle() {
  const now = Date.now();
  const start = Math.max(now, nextSlot);
  nextSlot = start + MIN_GAP_MS;
  if (start > now) await new Promise((r) => setTimeout(r, start - now));
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchSource(size, id) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();
    let res = null;
    try {
      res = await fetch(`${SOURCES[size]}/${id}.jpg`);
    } catch {
      res = null;
    }
    if (res?.ok) return res.arrayBuffer();
    if (res && (res.status === 404 || res.status === 403)) return null;
    if (attempt === MAX_RETRIES) throw new Error("upstream");
    await sleep(500 * 2 ** attempt);
  }
  return null;
}
function allowedOrigin(env, origin) {
  const list = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.includes("*")) return "*";
  if (origin && list.includes(origin)) return origin;
  return null;
}
function withCors(headers, allow) {
  if (allow) headers.set("Access-Control-Allow-Origin", allow);
  headers.set("Vary", "Origin");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
}
function err(status, msg, allow, extra) {
  const h = new Headers({ "Content-Type": "text/plain; charset=utf-8", ...extra });
  withCors(h, allow);
  return new Response(msg, { status, headers: h });
}
var index_default = {
  async fetch(req, env) {
    const origin = req.headers.get("Origin");
    const allow = allowedOrigin(env, origin);
    if (origin && !allow) return err(403, "Origine non consentita", null);
    if (req.method === "OPTIONS") {
      const h = new Headers({ "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Max-Age": "86400" });
      withCors(h, allow);
      return new Response(null, { status: 204, headers: h });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return err(405, "Metodo non consentito", allow);
    const m = PATH_RE.exec(new URL(req.url).pathname);
    if (!m) return err(404, "Non trovato", allow);
    const size = m[1];
    const id = String(Number(m[2]));
    const ext = m[3];
    if (id === "0") return err(404, "Non trovato", allow);
    if (ext === "webp" && size !== "small") return err(404, "Non trovato", allow);
    if (ext === "webp" && !env.IMAGES) return err(404, "WebP non attivo", allow);
    const key = `${size}/${id}.${ext}`;
    const type = ext === "webp" ? "image/webp" : "image/jpeg";
    const ok = (body) => {
      const h = new Headers({ "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" });
      withCors(h, allow);
      return new Response(req.method === "HEAD" ? null : body, { status: 200, headers: h });
    };
    const hit = await env.BUCKET.get(key);
    if (hit) return ok(hit.body);
    try {
      if (ext === "webp" && env.IMAGES) {
        const jpgKey = `${size}/${id}.jpg`;
        let src = await env.BUCKET.get(jpgKey);
        if (!src) {
          const data2 = await fetchSource(size, id);
          if (!data2) return err(404, "Carta inesistente", allow, { "Cache-Control": "public, max-age=3600" });
          await env.BUCKET.put(jpgKey, data2, { httpMetadata: { contentType: "image/jpeg" } });
          src = await env.BUCKET.get(jpgKey);
        }
        if (!src) throw new Error("r2");
        const out = await (await env.IMAGES.input(src.body).output({ format: "image/webp" })).response().arrayBuffer();
        await env.BUCKET.put(key, out, { httpMetadata: { contentType: "image/webp" } });
        return ok(out);
      }
      const data = await fetchSource(size, id);
      if (!data) return err(404, "Carta inesistente", allow, { "Cache-Control": "public, max-age=3600" });
      await env.BUCKET.put(key, data, { httpMetadata: { contentType: "image/jpeg" } });
      return ok(data);
    } catch {
      return err(502, "Sorgente immagini non disponibile, riprova", allow, { "Cache-Control": "no-store" });
    }
  }
};
export {
  SOURCES,
  index_default as default,
  fetchSource,
  resetThrottle
};
