/* tracking.js — Mel Trujillo Weddings
 *
 * Qué hace:
 *   1) Muestra un aviso de cookies (aceptar / ahora no) y recuerda la decisión en este navegador.
 *   2) Solo si la persona acepta, carga el píxel de Meta y mide tres momentos:
 *        PageView     al entrar a la página
 *        ViewContent  cuando llega a la sección de colecciones
 *        Contact      cuando hace clic en un botón que lleva a agendar la llamada (Cal.com)
 *   3) Cada evento viaja dos veces con el mismo event_id: por el navegador (píxel) y por servidor
 *      (/.netlify/functions/capi). Meta los junta y cuenta cada uno una sola vez.
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
    window.fbq('init', PIXEL_ID);
  }

  function track(name, customData) {
    if (readConsent() !== 'yes') return;
    loadPixel();
    var eventId = uid();
    var data = customData || {};

    window.fbq('track', name, data, { eventID: eventId });

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

  // ---------- Los tres momentos que se miden ----------
  var listenersReady = false;
  function startMeasuring() {
    track('PageView');
    if (listenersReady) return;
    listenersReady = true;

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

    document.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a[href*="cal.com/meltrujillo"]');
      if (link) {
        addMetaCookiesToLink(link);
        track('Contact', { content_name: 'agendar_llamada' });
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
