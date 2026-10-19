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
const ALLOWED_EVENTS = ['PageView', 'ViewContent', 'Contact', 'Lead'];

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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  const origin = header(event, 'origin');
  if (!ALLOWED_ORIGINS.includes(origin)) return json(403, { error: 'Origen no permitido' });

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'JSON inválido' });
  }

  if (!ALLOWED_EVENTS.includes(data.event_name)) return json(400, { error: 'Evento no permitido' });
  if (!data.event_id || typeof data.event_id !== 'string') return json(400, { error: 'Falta event_id' });

  const ip =
    header(event, 'x-nf-client-connection-ip') ||
    header(event, 'x-forwarded-for').split(',')[0].trim();

  const userData = {
    client_ip_address: ip || undefined,
    client_user_agent: header(event, 'user-agent') || undefined,
  };
  if (/^fb\.\d\.\d+\.\d+$/.test(data.fbp || '')) userData.fbp = data.fbp;
  if (/^fb\.\d\.\d+\.[\w-]+$/.test(data.fbc || '')) userData.fbc = data.fbc;

  const customData = {};
  ['content_name', 'content_category'].forEach((k) => {
    if (typeof data[k] === 'string') customData[k] = data[k].slice(0, 100);
  });

  try {
    await sendEvent({
      eventName: data.event_name,
      eventId: data.event_id,
      sourceUrl: typeof data.event_source_url === 'string' ? data.event_source_url : ALLOWED_ORIGINS[0] + '/',
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
