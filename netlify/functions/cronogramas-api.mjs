import { getStore } from "@netlify/blobs";

export const config = { path: "/api/cronogramas/*" };

const KEY_RE = new RegExp(
  "^(?:" + [
    "(?:prep|cer|fot|rec)_\\d{1,2}_(?:hora|notas)",
    "ext_(?:prep|cer|fot|rec)_[0-4]_(?:hora|nombre|notas)",
    "con_\\d{1,2}_(?:nombre|tel)",
    "per_\\d{1,2}_(?:nombre|rel)",
    "imp_(?:momentos|grupos|no|poses)",
    "log_(?:novia|novio|restric|acceso|lluvia|evento)",
    "log_(?:ini|fin)_hora",
    "notas_finales",
  ].join("|") + ")$"
);
const SLUG_RE = /^[a-z0-9-]{3,80}$/;
const MAX_BODY = 90000;
const MAX_VAL = 2000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const clean = (s, max = 300) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

function slugify(s) {
  return String(s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " y ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function rand(n = 5) {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => a[x % a.length]).join("");
}

const ADMIN_HASH = "a280be6703d96341f8ecf7d116a937c9d6f6a2e6050cbfc89c3ae4cbd9091c79";

async function isAdmin(req) {
  const k = req.headers.get("x-admin-key") || "";
  if (!k || k.length > 100) return false;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(k));
  const hex = Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
  let d = hex.length ^ ADMIN_HASH.length;
  for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ (ADMIN_HASH.charCodeAt(i) || 0);
  return d === 0;
}

function cleanConfig(b) {
  const groups = Array.isArray(b.groups) ? b.groups.slice(0, 8).map((g) => ({
    t: clean(g.t, 120),
    i: (Array.isArray(g.i) ? g.i : []).slice(0, 12).map((x) => clean(x, 160)).filter(Boolean),
  })).filter((g) => g.t) : [];
  return {
    pareja: clean(b.pareja, 120),
    fecha_larga: clean(b.fecha_larga, 80),
    fecha_iso: /^\d{4}-\d{2}-\d{2}$/.test(b.fecha_iso || "") ? b.fecha_iso : "",
    ceremonia: clean(b.ceremonia, 300),
    recepcion: clean(b.recepcion, 300),
    hora_ceremonia: clean(b.hora_ceremonia, 20),
    coleccion: clean(b.coleccion, 200),
    groups,
  };
}

export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/cronogramas\/?/, "").replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);
  const store = getStore({ name: "cronogramas", consistency: "strong" });

  try {
    // ---------- público: ver y guardar respuestas de una pareja ----------
    if (parts[0] === "c" && parts[1] && SLUG_RE.test(parts[1])) {
      const slug = parts[1];
      const key = "c/" + slug;

      if (req.method === "GET") {
        const doc = await store.get(key, { type: "json" });
        if (!doc) return json({ error: "no_existe" }, 404);
        return json({ config: doc.config, respuestas: doc.respuestas || {}, updated: doc.updated || 0 });
      }

      if (req.method === "PUT" || req.method === "POST") {
        const raw = await req.text();
        if (raw.length > MAX_BODY) return json({ error: "muy_grande" }, 413);
        let body;
        try { body = JSON.parse(raw); } catch { return json({ error: "json" }, 400); }
        const inc = body && typeof body.respuestas === "object" && body.respuestas ? body.respuestas : null;
        if (!inc) return json({ error: "datos" }, 400);

        const doc = await store.get(key, { type: "json" });
        if (!doc) return json({ error: "no_existe" }, 404);

        const resp = { ...(doc.respuestas || {}) };
        for (const [k, v] of Object.entries(inc)) {
          if (!KEY_RE.test(k)) continue;
          resp[k] = String(v ?? "").slice(0, MAX_VAL);
        }
        const now = Date.now();
        const nuevo = { ...doc, respuestas: resp, updated: now, guardados: (doc.guardados || 0) + 1 };
        await store.setJSON(key, nuevo);
        // copia de seguridad por versión (últimas se pueden revisar luego)
        await store.setJSON("h/" + slug + "/" + now, { respuestas: resp, t: now });
        return json({ ok: true, updated: now });
      }
      return json({ error: "metodo" }, 405);
    }

    // ---------- administración (requiere clave) ----------
    if (parts[0] === "admin") {
      if (!(await isAdmin(req))) return json({ error: "clave" }, 401);

      if (parts[1] === "lista" && req.method === "GET") {
        const { blobs } = await store.list({ prefix: "c/" });
        const out = [];
        for (const b of blobs) {
          const d = await store.get(b.key, { type: "json" });
          if (!d) continue;
          const r = d.respuestas || {};
          const llenos = Object.values(r).filter((x) => String(x).trim()).length;
          out.push({
            slug: d.slug, pareja: d.config.pareja, fecha_larga: d.config.fecha_larga, fecha_iso: d.config.fecha_iso,
            coleccion: d.config.coleccion, creado: d.creado, updated: d.updated || 0,
            guardados: d.guardados || 0, campos_llenos: llenos,
          });
        }
        out.sort((a, b) => String(a.fecha_iso || "9999").localeCompare(String(b.fecha_iso || "9999")));
        return json({ items: out });
      }

      if (parts[1] === "crear" && req.method === "POST") {
        const body = await req.json().catch(() => null);
        if (!body) return json({ error: "json" }, 400);
        const config = cleanConfig(body);
        if (!config.pareja || !config.fecha_larga) return json({ error: "faltan_datos" }, 400);
        let slug = slugify(config.pareja) + "-" + rand(5);
        if (!SLUG_RE.test(slug)) slug = "pareja-" + rand(8);
        const now = Date.now();
        await store.setJSON("c/" + slug, { slug, config, respuestas: {}, creado: now, updated: 0, guardados: 0 });
        return json({ ok: true, slug, path: "/c/" + slug });
      }

      if (parts[1] === "c" && parts[2] && SLUG_RE.test(parts[2])) {
        const slug = parts[2];
        const key = "c/" + slug;
        if (req.method === "GET") {
          const d = await store.get(key, { type: "json" });
          if (!d) return json({ error: "no_existe" }, 404);
          const { blobs } = await store.list({ prefix: "h/" + slug + "/" });
          return json({ ...d, versiones: blobs.length });
        }
        if (req.method === "PUT") {
          const d = await store.get(key, { type: "json" });
          if (!d) return json({ error: "no_existe" }, 404);
          const body = await req.json().catch(() => null);
          if (!body) return json({ error: "json" }, 400);
          d.config = cleanConfig(body);
          await store.setJSON(key, d);
          return json({ ok: true });
        }
        if (req.method === "DELETE") {
          await store.delete(key);
          const { blobs } = await store.list({ prefix: "h/" + slug + "/" });
          for (const b of blobs) await store.delete(b.key);
          return json({ ok: true });
        }
      }
    }

    return json({ error: "no_encontrado" }, 404);
  } catch (e) {
    return json({ error: "servidor", detalle: String((e && e.message) || e).slice(0, 200) }, 500);
  }
};
