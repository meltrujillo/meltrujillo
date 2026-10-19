// netlify/functions/cal-webhook.js
//
// Cal.com avisa aquí cada vez que alguien agenda ("Booking created").
// La función hace tres cosas:
//   1) Verifica la firma de Cal.com para rechazar avisos falsos.
//   2) Envía un evento a Meta por Conversions API (con datos hasheados).
//   3) Suma a la persona a una audiencia personalizada de Meta.
//
// Variables de entorno en Netlify (nada secreto vive en este archivo):
//   CALCOM_WEBHOOK_SECRET  (secreta)  el mismo secreto que pusiste en el webhook de Cal.com
//   META_ACCESS_TOKEN      (secreta)
//   META_PIXEL_ID          (no secreta)
//   META_AD_ACCOUNT_ID     (no secreta)

const crypto = require('crypto');
const { helpers } = require('./capi');

// Lista a mano. Cada vez que crees un tipo de evento nuevo en Cal.com,
// agrega su nombre corto (slug) aquí, en la lista que corresponda.
//   Lead:    llamadas exploratorias, personas que todavía están conociendo a Mel
//   Cliente: reservas de personas que ya contrataron o van a pagar
const SLUGS_LEAD = ['conocernos'];
const SLUGS_CLIENTE = [];

const SITE_URL = 'https://meltrujillo.com/';
const AUDIENCE_LEAD = 'Agendaron llamada - Mel Trujillo Weddings';
const AUDIENCE_CLIENTE = 'Clientes - Mel Trujillo Weddings';

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

function signatureIsValid(rawBody, received, secret) {
  if (!received) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(received).trim().toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Busca el teléfono en los lugares donde Cal.com suele guardarlo.
function findPhone(payload, attendee) {
  const r = payload.responses || {};
  return (
    (attendee && attendee.phoneNumber) ||
    (r.attendeePhoneNumber && r.attendeePhoneNumber.value) ||
    (r.phone && r.phone.value) ||
    (r.telefono && r.telefono.value) ||
    (r.whatsapp && r.whatsapp.value) ||
    ''
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  const secret = process.env.CALCOM_WEBHOOK_SECRET;
  if (!secret) return json(500, { error: 'Falta la variable CALCOM_WEBHOOK_SECRET en Netlify' });

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event.body || '';

  const received = event.headers && event.headers['x-cal-signature-256'];
  if (!signatureIsValid(rawBody, received, secret)) return json(401, { error: 'Firma inválida' });

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    return json(400, { error: 'JSON inválido' });
  }

  // Cal.com también manda avisos de prueba (PING) y otros tipos de evento.
  if (body.triggerEvent !== 'BOOKING_CREATED') {
    return json(200, { ignored: 'triggerEvent ' + body.triggerEvent });
  }

  const payload = body.payload || {};
  const slug = String(payload.type || (payload.eventType && payload.eventType.slug) || '').toLowerCase();

  let kind;
  if (SLUGS_LEAD.includes(slug)) kind = 'lead';
  else if (SLUGS_CLIENTE.includes(slug)) kind = 'cliente';
  else return json(200, { ignored: 'slug sin audiencia: ' + slug });

  const attendee = (payload.attendees && payload.attendees[0]) || {};
  const email = attendee.email || (payload.responses && payload.responses.email && payload.responses.email.value) || '';
  if (!email) return json(200, { ignored: 'reserva sin correo' });

  const phone = helpers.normalizePhone(findPhone(payload, attendee));
  const { fn, ln } = helpers.splitName(attendee.name || (payload.responses && payload.responses.name && payload.responses.name.value));

  const hashed = {
    em: helpers.hashEmail(email),
    ph: phone ? helpers.hashPhone(phone) : undefined,
    fn: helpers.hashText(fn),
    ln: helpers.hashText(ln),
    country: phone.startsWith('57') ? helpers.hashText('co') : undefined,
  };

  const eventName = kind === 'lead' ? 'Lead' : 'Schedule';
  const audienceName = kind === 'lead' ? AUDIENCE_LEAD : AUDIENCE_CLIENTE;

  const [capi, audience] = await Promise.allSettled([
    helpers.sendEvent({
      eventName,
      eventId: String(payload.uid || body.createdAt || Date.now()),
      sourceUrl: SITE_URL,
      userData: {
        em: hashed.em ? [hashed.em] : undefined,
        ph: hashed.ph ? [hashed.ph] : undefined,
        fn: hashed.fn ? [hashed.fn] : undefined,
        ln: hashed.ln ? [hashed.ln] : undefined,
        country: hashed.country ? [hashed.country] : undefined,
      },
      customData: { content_name: slug },
    }),
    (async () => {
      const id = await helpers.findOrCreateAudience(
        audienceName,
        'Reservas de Cal.com (' + slug + '). Creada automáticamente por cal-webhook.'
      );
      return helpers.addToAudience(id, hashed);
    })(),
  ]);

  if (capi.status === 'rejected') console.error('cal-webhook CAPI:', capi.reason && capi.reason.message);
  if (audience.status === 'rejected') console.error('cal-webhook audiencia:', audience.reason && audience.reason.message);

  // Si Meta rechazó las dos cosas, se responde con error para que se vea en el historial del webhook de Cal.com.
  if (capi.status === 'rejected' && audience.status === 'rejected') {
    return json(502, {
      error: 'Meta rechazó el evento y la audiencia',
      capi: capi.reason && capi.reason.message,
      audiencia: audience.reason && audience.reason.message,
    });
  }

  return json(200, {
    ok: true,
    evento: eventName,
    capi: capi.status,
    audiencia: audience.status,
  });
};
