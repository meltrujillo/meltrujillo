// netlify/functions/uptime-check.js
//
// Vigilante de la landing. Netlify lo ejecuta solo cada 10 minutos (ver netlify.toml).
// Revisa que meltrujillo.com responda y, si falla dos veces seguidas, manda un aviso
// al celular (app ntfy) y al correo.
//
// Variables de entorno en Netlify (nada secreto vive en este archivo):
//   ALERT_NTFY_TOPIC   nombre privado del canal de avisos en ntfy.sh (actúa como contraseña)
//   ALERT_EMAIL        correo que recibe el aviso
//   SITE_URL           (opcional) por defecto https://meltrujillo.com
//
// Si falta alguna variable, la función no falla: deja constancia en el registro
// ("sin configurar") y termina, para que se note en las pruebas.

const SITE = process.env.SITE_URL || 'https://meltrujillo.com';
// Páginas que deben responder. La portada es la que reciben los anuncios.
const PAGES = ['/', '/gracias-reunion.html'];
const MARKER = 'Mel Trujillo'; // texto que debe aparecer en la portada

async function check(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(SITE + path, { signal: ctrl.signal, redirect: 'follow' });
    if (res.status !== 200) return path + ' respondio ' + res.status;
    if (path === '/') {
      const html = await res.text();
      if (!html.includes(MARKER)) return path + ' respondio, pero sin el contenido esperado';
    }
    return null;
  } catch (e) {
    return path + ' no responde (' + (e.name === 'AbortError' ? 'mas de 10 s' : e.message) + ')';
  } finally {
    clearTimeout(t);
  }
}

async function checkAll() {
  const results = await Promise.all(PAGES.map(check));
  return results.filter(Boolean);
}

async function alertar(problemas) {
  const topic = process.env.ALERT_NTFY_TOPIC;
  const email = process.env.ALERT_EMAIL;
  if (!topic || !email) {
    console.log('uptime-check: sin configurar (faltan ALERT_NTFY_TOPIC o ALERT_EMAIL). Problemas: ' + problemas.join('; '));
    return 'sin-configurar';
  }
  const res = await fetch('https://ntfy.sh/' + encodeURIComponent(topic), {
    method: 'POST',
    headers: {
      Title: 'La landing no responde',
      Priority: 'urgent',
      Tags: 'warning',
      Email: email,
    },
    body: 'meltrujillo.com tiene un problema y los anuncios estan pagando visitas:\n- ' + problemas.join('\n- '),
  });
  console.log('uptime-check: aviso enviado, ntfy respondio ' + res.status);
  return res.ok ? 'avisado' : 'fallo-aviso-' + res.status;
}

exports.handler = async function () {
  let problemas = await checkAll();
  if (problemas.length) {
    // Segundo intento a los 20 segundos para no avisar por un tropiezo pasajero.
    await new Promise((r) => setTimeout(r, 20000));
    problemas = await checkAll();
  }
  if (!problemas.length) {
    console.log('uptime-check: todo bien');
    return { statusCode: 200, body: 'ok' };
  }
  const estado = await alertar(problemas);
  return { statusCode: 200, body: JSON.stringify({ problemas, estado }) };
};
