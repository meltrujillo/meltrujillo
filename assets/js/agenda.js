/* agenda.js — Mel Trujillo Weddings (se carga solo desde tracking.js, en todas las páginas)
 *
 * Qué hace:
 *   1) Cuando alguien toca un botón que lleva a agendar en Cal.com, abre tu calendario como una ventana
 *      flotante encima de la página. La persona no sale de meltrujillo.com mientras agenda.
 *   2) Cuando Cal avisa que la reserva quedó confirmada, muestra un mensaje de gracias con el botón
 *      "Confirmar por WhatsApp". Ese botón es el evento Contacto (lo mide tracking.js con data-mt-event).
 *   3) Si el calendario flotante no carga, el botón funciona como siempre y lleva a cal.com.
 *
 * Los datos de Meta (_fbp y _fbc) viajan con la reserva solo si la persona aceptó las cookies.
 */
(function () {
  'use strict';

  var CAL_LINK = 'meltrujillo/conocernos';
  var WHATSAPP_URL = 'https://wa.me/573106985532?text=' +
    encodeURIComponent('hola mel, ya agendé nuestra llamada para conocernos');
  var CONSENT_KEY = 'mt_consent_v1';

  var calLoaded = false;
  var thanksShown = false;

  function readConsent() {
    try { return window.localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }
  function isCalLink(a) {
    try {
      var u = new URL(a.href, window.location.href);
      return (u.hostname === 'cal.com' || u.hostname === 'www.cal.com') && u.pathname.indexOf('/meltrujillo') === 0;
    } catch (e) { return false; }
  }

  // ---------- Código oficial de Cal.com para cargar su calendario incrustado ----------
  function loadCal() {
    if (calLoaded) return;
    calLoaded = true;
    /* eslint-disable */
    (function (C, A, L) { var p = function (a, ar) { a.q.push(ar); }; var d = C.document; C.Cal = C.Cal || function () { var cal = C.Cal; var ar = arguments; if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement('script')).src = A; cal.loaded = true; } if (ar[0] === L) { var api = function () { p(api, arguments); }; var namespace = ar[1]; api.q = api.q || []; if (typeof namespace === 'string') { cal.ns[namespace] = cal.ns[namespace] || api; p(cal.ns[namespace], ar); p(cal, ['initNamespace', namespace]); } else p(cal, ar); return; } p(cal, ar); }; })(window, 'https://app.cal.com/embed/embed.js', 'init');
    /* eslint-enable */
    window.Cal('init', { origin: 'https://app.cal.com' });
    window.Cal('ui', { theme: 'light', layout: 'month_view', hideEventTypeDetails: false, styles: { branding: { brandColor: '#9D0009' } } });
    window.Cal('on', { action: 'bookingSuccessfulV2', callback: showThanks });
    window.Cal('on', { action: 'bookingSuccessful', callback: showThanks });
  }

  // ---------- Abrir la ventana flotante ----------
  function openCalendar(link) {
    var config = { layout: 'month_view' };
    try {
      var u = new URL(link.href, window.location.href);
      u.searchParams.forEach(function (value, key) { config[key] = value; });  // por ejemplo notes=Me interesa Colección I
    } catch (e) { /* sin parámetros extra */ }
    if (readConsent() === 'yes') {
      var fbp = getCookie('_fbp');
      var fbc = getCookie('_fbc');
      if (fbp) config['metadata[fbp]'] = fbp;
      if (fbc) config['metadata[fbc]'] = fbc;
    }
    loadCal();
    window.Cal('modal', { calLink: CAL_LINK, config: config });

    // Respaldo: si en 6 segundos no apareció el calendario, la persona sigue por cal.com como siempre.
    window.setTimeout(function () {
      if (!document.querySelector('cal-modal-box')) window.location.assign(link.href);
    }, 6000);
  }

  // ---------- Mensaje de gracias con el botón de WhatsApp ----------
  var STYLE = [
    '#mt-thanks{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;',
    'background:rgba(34,31,27,0.55);padding:20px}',
    '#mt-thanks .mt-thanks-box{background:var(--bg,#fff);color:var(--ink,#221F1B);max-width:460px;width:100%;',
    'padding:36px 30px;text-align:center;border:1px solid var(--line,rgba(34,31,27,0.18))}',
    '#mt-thanks h2{font-size:clamp(22px,5vw,28px);line-height:1.25;margin:10px 0 14px}',
    '#mt-thanks p{margin:0 0 22px;line-height:1.6}',
    '#mt-thanks .mt-thanks-actions{display:flex;flex-direction:column;gap:12px;align-items:stretch}',
    '#mt-thanks .btn{cursor:pointer;font-family:inherit;text-align:center}'
  ].join('');

  function closeThanks() {
    var box = document.getElementById('mt-thanks');
    if (box && box.parentNode) box.parentNode.removeChild(box);
    var modal = document.querySelector('cal-modal-box');
    if (modal) {
      modal.setAttribute('state', 'closed');
      window.setTimeout(function () { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 300);
    }
  }

  function showThanks() {
    if (thanksShown) return;
    thanksShown = true;
    window.setTimeout(function () {
      if (!document.getElementById('mt-thanks-style')) {
        var style = document.createElement('style');
        style.id = 'mt-thanks-style';
        style.appendChild(document.createTextNode(STYLE));
        document.head.appendChild(style);
      }
      var box = document.createElement('div');
      box.id = 'mt-thanks';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-labelledby', 'mt-thanks-title');
      box.innerHTML =
        '<div class="mt-thanks-box">' +
        '<p class="eyebrow">su llamada está agendada</p>' +
        '<h2 id="mt-thanks-title">gracias por contarme su historia</h2>' +
        '<p>ya tengo su reserva. confírmenme por WhatsApp y nos vemos en la llamada.</p>' +
        '<div class="mt-thanks-actions">' +
        '<a class="btn btn-primary" href="' + WHATSAPP_URL + '" target="_blank" rel="noopener" ' +
        'data-mt-event="Contact" data-mt-label="agenda-popup" data-mt-once>Confirmar por WhatsApp</a>' +
        '<button type="button" class="btn btn-ghost" data-mt-close>cerrar</button>' +
        '</div></div>';
      box.addEventListener('click', function (event) {
        if (event.target.closest && event.target.closest('[data-mt-close]')) closeThanks();
      });
      document.body.appendChild(box);
    }, 900);
  }

  // ---------- Clics en cualquier botón que lleva a agendar ----------
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var link = target.closest('a[href]');
    if (!link || !isCalLink(link)) return;
    if (event.defaultPrevented || event.button === 1 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    openCalendar(link);
  });

  // Se prepara el calendario unos segundos después de cargar la página para que abra rápido.
  window.addEventListener('load', function () { window.setTimeout(loadCal, 2500); });

  window.MTAgenda = { open: openCalendar, showThanks: showThanks };
})();
