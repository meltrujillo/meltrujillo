/* tracking.js — Mel Trujillo Weddings (se carga en TODAS las páginas del sitio)
 *
 * Qué hace:
 *   1) Muestra un aviso de cookies (aceptar / ahora no) y recuerda la decisión en este navegador.
 *   2) Solo si la persona acepta, carga el píxel de Meta y mide el recorrido.
 *   3) Cada evento viaja dos veces con el MISMO event_id: por el navegador (píxel) y por servidor
 *      (/.netlify/functions/capi). Meta los junta y cuenta cada uno una sola vez (deduplicación).
 *   4) Apaga la "configuración automática" del píxel. Es la que inventa eventos como
 *      SubscribedButtonClick por cada botón de la página y ensucia los datos.
 *
 * EVENTOS (nombre en Meta · qué ocurre · quién lo envía)
 *   PageView             entran a cualquier página                              navegador + servidor
 *   ViewContent          llegan a las colecciones (portada) o abren un recurso  navegador + servidor
 *   InteresadoEnReunion  clic en cualquier botón que lleva a agendar en Cal.com navegador + servidor  (personalizado)
 *   VioPortafolio        abren una foto del portafolio                          navegador + servidor  (personalizado)
 *   VerBlog              abren el blog o un artículo                            navegador + servidor  (personalizado)
 *   IniciaEnBlog         hacen clic hacia la portada o hacia agendar desde el blog  navegador + servidor (personalizado)
 *   Contact              clic en WhatsApp (data-mt-event="Contact") o llegada a la página de gracias
 *   InitiateCheckout     llegada a una página de pago (data-page-event="InitiateCheckout")
 *   Lead y Schedule      los envía SOLO cal-webhook.js cuando Cal.com confirma la reserva (servidor)
 *   Purchase             nunca sale del navegador: se sube desde una fuente verificada (CSV offline o pasarela)
 *
 * CÓMO SE USA EN CUALQUIER PÁGINA NUEVA
 *   <body data-page="landing|blog|blog-post|recurso|gracias" data-slug="nombre-corto">
 *   <script src="/assets/js/tracking.js" defer></script>
 *   Un botón que debe medirse:  data-mt-event="Contact" data-mt-label="whatsapp"
 *   Los enlaces a cal.com/meltrujillo ya se miden solos; un data-mt-label="nombre" dice cuál fue.
 *
 * El ID del píxel es un dato público, por eso puede vivir en este archivo.
 */
(function () {
  'use strict';

  var PIXEL_ID = '1094122853434268';
  var CAPI_URL = '/.netlify/functions/capi';
  var STORAGE_KEY = 'mt_consent_v1';

  // ---------- Decisión de la persona (localStorage puede fallar: siempre con try/catch) ----------
  function readConsent() {
    try { return window.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function saveConsent(value) {
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* sin almacenamiento */ }
  }

  // ---------- Utilidades ----------
  function uid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'ev-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }
  function fbcFromUrl() {
    var m = window.location.search.match(/[?&]fbclid=([^&]+)/);
    return m ? 'fb.1.' + Date.now() + '.' + m[1] : '';
  }

  // ---------- Píxel de Meta (código base oficial, cargado solo con permiso) ----------
  var pixelReady = false;
  function loadPixel() {
    if (pixelReady) return;
    pixelReady = true;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    // Sin configuración automática: nada de SubscribedButtonClick ni PageMetadata inventados por Meta.
    window.fbq('set', 'autoConfig', false, PIXEL_ID);
    window.fbq('init', PIXEL_ID);
  }

  var STANDARD_EVENTS = ['PageView', 'ViewContent', 'Contact', 'Lead', 'Schedule', 'InitiateCheckout', 'Purchase'];

  function track(name, customData) {
    if (readConsent() !== 'yes') return;
    loadPixel();
    var eventId = uid();
    var data = customData || {};

    var method = STANDARD_EVENTS.indexOf(name) === -1 ? 'trackCustom' : 'track';
    window.fbq(method, name, data, { eventID: eventId });

    // Pequeña espera para que el píxel alcance a crear las cookies _fbp y _fbc antes de leerlas.
    window.setTimeout(function () {
      var body = {
        event_name: name,
        event_id: eventId,
        event_source_url: window.location.href,
        fbp: getCookie('_fbp'),
        fbc: getCookie('_fbc') || fbcFromUrl()
      };
      if (data.content_name) body.content_name = data.content_name;
      try {
        window.fetch(CAPI_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true
        }).catch(function () {});
      } catch (e) { /* si falla el envío por servidor, el píxel del navegador ya hizo su parte */ }
    }, 1200);
  }

  // ---------- Cookies de Meta dentro de la reserva de Cal.com ----------
  // Al ir a Cal.com se agregan _fbp y _fbc al enlace como metadata de la reserva. Cal.com los guarda con la
  // reserva y los entrega al webhook, que los reenvía a Meta para reconocer mejor a quien agendó.
  // Solo ocurre si la persona aceptó las cookies.
  function addMetaCookiesToLink(link) {
    if (readConsent() !== 'yes') return;
    var fbp = getCookie('_fbp');
    var fbc = getCookie('_fbc') || fbcFromUrl();
    if (!fbp && !fbc) return;
    try {
      var url = new URL(link.href, window.location.href);
      if (url.hostname !== 'cal.com' && url.hostname !== 'www.cal.com') return;
      if (fbp) url.searchParams.set('metadata[fbp]', fbp);
      if (fbc) url.searchParams.set('metadata[fbc]', fbc);
      link.href = url.toString();
    } catch (e) { /* si falla, el enlace queda como estaba */ }
  }

  // ---------- Los momentos que se miden ----------
  var body = document.body;
  var PAGE = (body && body.getAttribute('data-page')) || 'landing';
  var SLUG = (body && body.getAttribute('data-slug')) || '';
  var IN_BLOG = PAGE === 'blog' || PAGE === 'blog-post';
  var firedOnce = {};

  // Los nombres que viajan al servidor solo pueden tener letras minúsculas, números, guion y guion bajo.
  function safeLabel(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  // De qué parte de la página salió el clic (sirve para saber qué botón convierte más).
  function positionOf(el) {
    if (el.closest('header')) return 'encabezado';
    if (el.closest('footer')) return 'pie';
    if (el.closest('#colecciones')) return 'colecciones';
    if (el.closest('.hero')) return 'portada';
    if (el.closest('#reservar')) return 'cierre';
    if (IN_BLOG) return 'blog';
    if (PAGE === 'recurso') return 'recurso';
    return 'pagina';
  }

  function isCalLink(a) {
    try {
      var u = new URL(a.href, window.location.href);
      return (u.hostname === 'cal.com' || u.hostname === 'www.cal.com') && u.pathname.indexOf('/meltrujillo') === 0;
    } catch (e) { return false; }
  }
  function isHomeLink(a) {
    try {
      var u = new URL(a.href, window.location.href);
      return u.origin === window.location.origin && (u.pathname === '/' || u.pathname === '/index.html');
    } catch (e) { return false; }
  }

  var listenersReady = false;
  function startMeasuring() {
    track('PageView');
    if (listenersReady) return;
    listenersReady = true;

    // Eventos de página: se disparan al entrar.
    if (PAGE === 'blog') track('VerBlog', { content_name: 'indice' });
    if (PAGE === 'blog-post') track('VerBlog', { content_name: safeLabel(SLUG) || 'articulo' });
    if (PAGE === 'recurso') track('ViewContent', { content_name: 'recurso-' + (safeLabel(SLUG) || 'indice') });
    var pageEvent = body && body.getAttribute('data-page-event');
    if (pageEvent === 'Contact' || pageEvent === 'InitiateCheckout') {
      track(pageEvent, { content_name: safeLabel(SLUG) || safeLabel(PAGE) });
    }

    // Portada: llegaron a las colecciones.
    var section = document.getElementById('colecciones');
    if (section && 'IntersectionObserver' in window) {
      var seen = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            seen.disconnect();
            track('ViewContent', { content_name: 'colecciones' });
          }
        });
      }, { threshold: 0.25 });
      seen.observe(section);
    }

    // Clics
    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;

      // 1) Cualquier botón que lleva a agendar en Cal.com
      var link = target.closest('a[href]');
      if (link && isCalLink(link)) {
        addMetaCookiesToLink(link);
        var label = safeLabel(link.getAttribute('data-mt-label')) || positionOf(link);
        track('InteresadoEnReunion', { content_name: label });
        if (IN_BLOG) track('IniciaEnBlog', { content_name: 'agendar' });
        return;
      }

      // 2) Desde el blog hacia la portada
      if (link && IN_BLOG && isHomeLink(link) && link.closest('main')) {
        track('IniciaEnBlog', { content_name: 'portada' });
        return;
      }

      // 3) Cualquier elemento marcado con data-mt-event (WhatsApp, portafolio, etc.)
      var marked = target.closest('[data-mt-event]');
      if (marked) {
        var name = marked.getAttribute('data-mt-event');
        var allowed = ['Contact', 'VioPortafolio'];
        if (allowed.indexOf(name) === -1) return;
        var key = name + ':' + (marked.getAttribute('data-mt-label') || '');
        if (marked.hasAttribute('data-mt-once') && firedOnce[key]) return;
        firedOnce[key] = true;
        track(name, { content_name: safeLabel(marked.getAttribute('data-mt-label')) || safeLabel(PAGE) });
      }
    });
  }

  // ---------- Aviso de cookies ----------
  var STYLE = [
    '.mt-consent{position:fixed;left:16px;bottom:16px;z-index:900;max-width:380px;background:#fff;color:#221F1B;',
    'border:1px solid rgba(34,31,27,0.18);padding:20px 22px;font-size:14px;line-height:1.55;',
    'box-shadow:0 10px 40px rgba(34,31,27,0.12)}',
    '.mt-consent p{margin:0 0 14px}',
    '.mt-consent a{color:#9D0009}',
    '.mt-consent-actions{display:flex;gap:10px;flex-wrap:wrap}',
    '.mt-consent .btn{padding:12px 20px;cursor:pointer;font-family:inherit;font-size:12px}',
    '@media (max-width:520px){.mt-consent{left:12px;right:12px;bottom:12px;max-width:none}}'
  ].join('');

  function removeBanner() {
    var el = document.getElementById('mt-consent');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function showBanner() {
    if (document.getElementById('mt-consent')) return;
    if (!document.getElementById('mt-consent-style')) {
      var style = document.createElement('style');
      style.id = 'mt-consent-style';
      style.appendChild(document.createTextNode(STYLE));
      document.head.appendChild(style);
    }
    var box = document.createElement('div');
    box.id = 'mt-consent';
    box.className = 'mt-consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Aviso de cookies');
    box.innerHTML =
      '<p>Cuido sus datos como cuido sus historias. Uso cookies para entender qué parte de esta página los emociona. ustedes deciden. más en la <a href="/privacidad.html">política de privacidad</a>.</p>' +
      '<div class="mt-consent-actions">' +
      '<button type="button" class="btn btn-primary" data-mt="yes">aceptar</button>' +
      '<button type="button" class="btn btn-ghost" data-mt="no">ahora no</button>' +
      '</div>';
    box.addEventListener('click', function (event) {
      var choice = event.target.getAttribute && event.target.getAttribute('data-mt');
      if (!choice) return;
      saveConsent(choice);
      removeBanner();
      if (choice === 'yes') startMeasuring();
    });
    document.body.appendChild(box);
  }

  function init() {
    var consent = readConsent();
    if (consent === 'yes') startMeasuring();
    else if (consent !== 'no') showBanner();

    // El enlace "Cookies" del pie de página permite cambiar la decisión cuando quieran.
    var prefs = document.getElementById('mt-cookie-prefs');
    if (prefs) {
      prefs.addEventListener('click', function (event) {
        event.preventDefault();
        showBanner();
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
