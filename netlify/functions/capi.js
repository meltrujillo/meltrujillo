// netlify/functions/capi.js
//
// Dos trabajos en un solo archivo:
//   1) Ayudantes compartidos para hablar con Meta (hash SHA256, Conversions API, audiencias).
//      Los usa cal-webhook.js con require('./capi').
//   2) Un endpoint (/.netlify/functions/capi) que recibe eventos desde el navegador de
//      meltrujillo.com y los reenvía a Meta por servidor, con el mismo event_id del píxel
//      para que Meta cuente cada evento una sola vez.
//
// Variables de entorno en Netlify (nada secreto vive en este archivo):
//   META_ACCESS_TOKEN      (secreta)  token del usuario del sistema
//   META_PIXEL_ID          (no secreta)
//   META_AD_ACCOUNT_ID     (no secreta)
//   META_TEST_EVENT_CODE   (opcional) para ver los eventos en "Probar eventos"
//   META_GRAPH_VERSION     (opcional) por defecto v23.0

const crypto = require('crypto');

const GRAPH = 'https://graph.facebook.com/' + (process.env.META_GRAPH_VERSION || 'v23.0');

const ALLOWED_ORIGINS = ['https://meltrujillo.com', 'https://www.meltrujillo.com'];
// Desde el navegador solo entran estos tres. "Lead" lo envía únicamente cal-webhook.js,
// que verifica la firma de Cal.com. Así nadie puede fabricar Leads falsos que contaminen la optimización.
const ALLOWED_EVENTS = ['PageView', 'ViewContent', 'Contact'];
const ALLOWED_CONTENT_NAMES = ['colecciones', 'agendar_llamada'];

// Límites de protección (se reinician si Netlify apaga la función por inactividad, y aun así frenan el abuso normal)
const MAX_BODY_BYTES = 2048;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_PER_IP = 30;      // eventos por IP cada 10 minutos
const RATE_MAX_GLOBAL = 1500;    // eventos en total cada 10 minutos
const SEEN_TTL_MS = 60 * 60 * 1000;
const BOT_UA = /bot|crawl|spider|slurp|headless|phantom|curl|wget|python|axios|node-fetch|go-http|java\/|okhttp|postman|insomnia|scrapy|httpclient/i;

// ---------- Hash y normalización ----------

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// minúsculas, sin tildes, sin espacios en los bordes
const clean = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

const hashEmail = (value) => {
  const v = clean(value);
  return v ? sha256(v) : undefined;
};

// solo dígitos con código de país; un celular colombiano de 10 dígitos recibe el 57
const normalizePhone = (value) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('3')) digits = '57' + digits;
  return digits;
};

const hashPhone = (value) => {
  const v = normalizePhone(value);
  return v ? sha256(v) : undefined;
};

const hashText = (value) => {
  const v = clean(value);
  return v ? sha256(v) : undefined;
};

// "María José Jaramillo" -> { fn: 'maria', ln: 'jose jaramillo' }
const splitName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { fn: '', ln: '' };
  return { fn: parts[0], ln: parts.slice(1).join(' ') };
};

// ---------- Llamadas a Meta ----------

async function graphRequest(path, { method = 'GET', query = {}, body } = {}) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('Falta la variable META_ACCESS_TOKEN en Netlify');

  const url = new URL(GRAPH + path);
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Detalle completo del error de Meta (sin datos personales) para poder diagnosticar en los registros de Netlify
    const e = (json && json.error) || {};
    const detail = [
      e.message || 'HTTP ' + res.status,
      e.code ? 'code ' + e.code : '',
      e.error_subcode ? 'subcode ' + e.error_subcode : '',
      e.error_user_msg || '',
      e.fbtrace_id ? 'trace ' + e.fbtrace_id : '',
    ]
      .filter(Boolean)
      .join(' | ');
    throw new Error('Meta respondió (' + method + ' ' + path + '): ' + detail);
  }
  return json;
}

// Envía un evento a la Conversions API del píxel.
async function sendEvent({ eventName, eventId, eventTime, sourceUrl, userData = {}, customData }) {
  const pixelId = process.env.META_PIXEL_ID;
  if (!pixelId) throw new Error('Falta la variable META_PIXEL_ID en Netlify');

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime || Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: sourceUrl,
        user_data: userData,
        ...(customData ? { custom_data: customData } : {}),
      },
    ],
  };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  return graphRequest('/' + pixelId + '/events', { method: 'POST', body: payload });
}

// ---------- Audiencias personalizadas ----------

const audienceCache = {}; // se conserva mientras la función está "caliente"

const adAccountPath = () => {
  const id = String(process.env.META_AD_ACCOUNT_ID || '').replace(/\D/g, '');
  if (!id) throw new Error('Falta la variable META_AD_ACCOUNT_ID en Netlify');
  return '/act_' + id;
};

// Busca la audiencia por nombre; si no existe, la crea. Devuelve su id.
async function findOrCreateAudience(name, description) {
  if (audienceCache[name]) return audienceCache[name];

  let after;
  for (let page = 0; page < 5; page++) {
    const query = { fields: 'id,name', limit: '200' };
    if (after) query.after = after;
    const res = await graphRequest(adAccountPath() + '/customaudiences', { query });
    const found = (res.data || []).find((a) => a.name === name);
    if (found) {
      audienceCache[name] = found.id;
      return found.id;
    }
    after = res.paging && res.paging.cursors && res.paging.next ? res.paging.cursors.after : null;
    if (!after) break;
  }

  const created = await graphRequest(adAccountPath() + '/customaudiences', {
    method: 'POST',
    body: {
      name,
      description,
      subtype: 'CUSTOM',
      customer_file_source: 'USER_PROVIDED_ONLY',
    },
  });
  audienceCache[name] = created.id;
  return created.id;
}

// Agrega a una persona (datos ya hasheados) a la audiencia.
async function addToAudience(audienceId, { em, ph, fn, ln, country }) {
  return graphRequest('/' + audienceId + '/users', {
    method: 'POST',
    body: {
      payload: {
        schema: ['EMAIL', 'PHONE', 'FN', 'LN', 'COUNTRY'],
        data: [[em || '', ph || '', fn || '', ln || '', country || '']],
      },
    },
  });
}

// ---------- Endpoint para eventos del navegador ----------

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

const header = (event, name) => (event.headers && event.headers[name]) || '';

// Memoria temporal de la función (por instancia)
const rateByIp = new Map();
let rateGlobal = { start: Date.now(), count: 0 };
const seenEventIds = new Map();

function overRateLimit(ip) {
  const now = Date.now();
  if (now - rateGlobal.start > RATE_WINDOW_MS) rateGlobal = { start: now, count: 0 };
  rateGlobal.count += 1;
  if (rateGlobal.count > RATE_MAX_GLOBAL) return true;

  const key = ip || 'sin-ip';
  let entry = rateByIp.get(key);
  if (!entry || now - entry.start > RATE_WINDOW_MS) entry = { start: now, count: 0 };
  entry.count += 1;
  rateByIp.set(key, entry);

  if (rateByIp.size > 5000) {
    for (const [k, v] of rateByIp) if (now - v.start > RATE_WINDOW_MS) rateByIp.delete(k);
  }
  return entry.count > RATE_MAX_PER_IP;
}

function alreadySeen(eventId) {
  const now = Date.now();
  if (seenEventIds.size > 5000) {
    for (const [k, t] of seenEventIds) if (now - t > SEEN_TTL_MS) seenEventIds.delete(k);
  }
  if (seenEventIds.has(eventId) && now - seenEventIds.get(eventId) < SEEN_TTL_MS) return true;
  seenEventIds.set(eventId, now);
  return false;
}

// La URL de origen del evento solo se acepta si es de este sitio; si no, se usa la portada.
function safeSourceUrl(value) {
  try {
    const u = new URL(String(value || ''));
    if (u.protocol === 'https:' && ALLOWED_ORIGINS.includes(u.origin)) return u.origin + u.pathname;
  } catch (e) { /* cae a la portada */ }
  return ALLOWED_ORIGINS[0] + '/';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  const origin = header(event, 'origin');
  if (!ALLOWED_ORIGINS.includes(origin)) return json(403, { error: 'Origen no permitido' });

  // Un navegador real que viene de este sitio nunca envía "cross-site"
  const fetchSite = header(event, 'sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return json(403, { error: 'Solicitud no permitida' });

  // Si trae Referer, debe ser de este sitio
  const referer = header(event, 'referer');
  if (referer && !ALLOWED_ORIGINS.some((o) => referer === o || referer.startsWith(o + '/'))) {
    return json(403, { error: 'Referer no permitido' });
  }

  if (!/^application\/json/i.test(header(event, 'content-type'))) return json(415, { error: 'Tipo de contenido no permitido' });

  const ua = header(event, 'user-agent');
  if (!ua || BOT_UA.test(ua)) return json(403, { error: 'Cliente no permitido' });

  const rawBody = event.body || '';
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return json(413, { error: 'Mensaje demasiado grande' });

  let data;
  try {
    data = JSON.parse(rawBody || '{}');
  } catch (e) {
    return json(400, { error: 'JSON inválido' });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return json(400, { error: 'JSON inválido' });

  if (!ALLOWED_EVENTS.includes(data.event_name)) return json(400, { error: 'Evento no permitido' });
  if (typeof data.event_id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(data.event_id)) {
    return json(400, { error: 'event_id inválido' });
  }

  const ip =
    header(event, 'x-nf-client-connection-ip') ||
    header(event, 'x-forwarded-for').split(',')[0].trim();

  if (overRateLimit(ip)) return json(429, { error: 'Demasiados eventos, intenta más tarde' });

  // Mismo evento repetido: se responde bien pero no se reenvía a Meta
  if (alreadySeen(data.event_id)) return json(200, { ok: true, duplicado: true });

  const userData = {
    client_ip_address: ip || undefined,
    client_user_agent: ua || undefined,
  };
  if (/^fb\.\d\.\d+\.\d+$/.test(data.fbp || '')) userData.fbp = data.fbp;
  if (/^fb\.\d\.\d+\.[\w-]+$/.test(data.fbc || '')) userData.fbc = data.fbc;

  const customData = {};
  if (ALLOWED_CONTENT_NAMES.includes(data.content_name)) customData.content_name = data.content_name;

  try {
    await sendEvent({
      eventName: data.event_name,
      eventId: data.event_id,
      sourceUrl: safeSourceUrl(data.event_source_url),
      userData,
      customData: Object.keys(customData).length ? customData : undefined,
    });
    return json(200, { ok: true });
  } catch (err) {
    console.error('capi:', err.message);
    return json(502, { error: err.message });
  }
};

// Ayudantes para cal-webhook.js
exports.__test = { rateByIp, seenEventIds, resetRate: () => { rateByIp.clear(); seenEventIds.clear(); rateGlobal = { start: Date.now(), count: 0 }; } };
exports.helpers = {
  hashEmail,
  hashPhone,
  hashText,
  normalizePhone,
  splitName,
  sendEvent,
  findOrCreateAudience,
  addToAudience,
};
