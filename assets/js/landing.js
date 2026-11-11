/* landing.js — comportamiento de la portada: visor de fotos (lightbox), mini portafolio y cintas deslizables. */
/* ---------- Lightbox: portafolio en ladrillo + mini portafolio deslizable --------- */
(function(){
  var lightbox = document.getElementById('lightbox');
  if(!lightbox) return;
  var imgEl = lightbox.querySelector('.lightbox-img');
  var closeBtn = lightbox.querySelector('.lightbox-close');
  var prevBtn = lightbox.querySelector('.lightbox-prev');
  var nextBtn = lightbox.querySelector('.lightbox-next');
  var currentList = [];
  var currentIndex = 0;

  /* Las miniaturas piden versiones chiquitas a Cloudinary (w_500 / w_600) para
     cargar rápido en la cuadrícula. Para el lightbox pedimos una versión mucho
     más grande del mismo archivo, así no se ve pixelada al ampliarla. */
  function toLightboxSrc(src){
    return src.replace(/\/upload\/w_\d+,/, '/upload/w_1800,');
  }

  function updateImage(){
    var img = currentList[currentIndex];
    if(!img) return;
    imgEl.src = toLightboxSrc(img.getAttribute('src'));
    imgEl.alt = img.getAttribute('alt') || '';
  }
  function openLightbox(list, index){
    currentList = list;
    currentIndex = index;
    updateImage();
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox(){
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  function showPrev(){
    if(!currentList.length) return;
    currentIndex = (currentIndex - 1 + currentList.length) % currentList.length;
    updateImage();
  }
  function showNext(){
    if(!currentList.length) return;
    currentIndex = (currentIndex + 1) % currentList.length;
    updateImage();
  }
  function setupGallery(selector){
    var all = Array.prototype.slice.call(document.querySelectorAll(selector));
    var imgs = all.filter(function(img){ return !img.closest('[aria-hidden="true"]'); });
    imgs.forEach(function(img, i){
      img.addEventListener('click', function(){ openLightbox(imgs, i); });
    });
  }
  setupGallery('.gallery img');
  setupGallery('.coll-gallery-item img');

  closeBtn.addEventListener('click', closeLightbox);
  prevBtn.addEventListener('click', showPrev);
  nextBtn.addEventListener('click', showNext);
  lightbox.addEventListener('click', function(e){
    if(e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', function(e){
    if(!lightbox.classList.contains('is-open')) return;
    if(e.key === 'Escape') closeLightbox();
    if(e.key === 'ArrowLeft') showPrev();
    if(e.key === 'ArrowRight') showNext();
  });
})();

/* ---------- Mini portafolio y testimonios (celular): se deslizan solos y,
   al primer toque, se detienen y quedan libres para mover con el dedo ---------- */
(function(){
  var viewports = document.querySelectorAll('.marquee-viewport, .coll-gallery-viewport');
  viewports.forEach(function(vp){
    vp.addEventListener('touchstart', function(){
      vp.classList.add('is-touched');
    }, { passive:true, once:true });
  });
})();


/* ---------- Menú hamburguesa y flechas del hero (celular) ---------- */
(function(){
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('site-menu');
  if(toggle && menu){
    var setOpen = function(open){
      menu.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    };
    toggle.addEventListener('click', function(){ setOpen(!menu.classList.contains('is-open')); });
    menu.addEventListener('click', function(e){ if(e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') setOpen(false); });
  }
  var slides = document.getElementById('heroSlides');
  if(slides){
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var mobileMQ = window.matchMedia('(max-width:767.98px)');
    var imgs = Array.prototype.slice.call(slides.querySelectorAll('img'));
    // Orden inicial: la foto del anuncio (2.a del HTML) primero, luego la de siempre, luego las demás
    var list = [imgs[1], imgs[0]].concat(imgs.slice(2)).filter(Boolean);
    var paint = function(){ list.forEach(function(el, i){ el.style.order = i; }); };
    var settle = function(){
      // Deja siempre la foto visible en la posición 2, con una vecina a cada lado: así el carrusel nunca tiene principio ni fin
      if(!mobileMQ.matches || list.length < 3) return;
      var w = slides.clientWidth; if(!w) return;
      var shift = Math.round(slides.scrollLeft / w) - 1;
      if(shift === 0 && Math.abs(slides.scrollLeft - w) < 2) return;
      while(shift > 0){ list.push(list.shift()); shift--; }
      while(shift < 0){ list.unshift(list.pop()); shift++; }
      paint();
      slides.style.scrollSnapType = 'none';
      slides.scrollLeft = w;
      slides.style.scrollSnapType = '';
    };
    paint();
    if(mobileMQ.matches && list.length >= 3){
      list.unshift(list.pop()); paint();               // la foto del anuncio queda en la posición 2
      slides.scrollLeft = slides.clientWidth;
    }
    var busy = false, pend = 0, timer;
    var settleIdle = function(){ if(!busy) settle(); };
    slides.addEventListener('scroll', function(){ clearTimeout(timer); timer = setTimeout(settleIdle, 160); }, { passive:true });
    window.addEventListener('resize', settleIdle);
    // Espera a que la foto termine de deslizarse antes de reacomodar el carrusel
    var waitStop = function(cb){
      var last = -1, still = 0;
      (function tick(){
        var x = slides.scrollLeft;
        if(Math.abs(x - last) < 0.5) still++; else still = 0;
        last = x;
        if(still >= 4) cb(); else requestAnimationFrame(tick);
      })();
    };
    var go = function(dir){
      if(busy){ pend = dir; return; }          // un clic durante el movimiento queda en fila
      busy = true;
      var w = slides.clientWidth;
      var idx = Math.round(slides.scrollLeft / w);
      slides.scrollTo({ left: (idx + dir) * w, behavior: reduce ? 'auto' : 'smooth' });
      waitStop(function(){
        busy = false; settle();
        if(pend){ var d = pend; pend = 0; go(d); }
      });
    };
    var prev = document.querySelector('.hero-arrow.prev');
    var nxt = document.querySelector('.hero-arrow.next');
    if(prev) prev.addEventListener('click', function(){ go(-1); });
    if(nxt) nxt.addEventListener('click', function(){ go(1); });
  }
})();

// Colecciones: mazo de cartas. La carta activa va al frente y las demás quedan detrás en orden.
(function(){
  var deck = document.querySelector('.coll-deck');
  if(!deck) return;
  var cards = Array.prototype.slice.call(deck.querySelectorAll('.coll-card'));
  if(cards.length < 2) return;
  var active = 0;
  var render = function(){
    cards.forEach(function(card, i){
      card.setAttribute('data-pos', (i - active + cards.length) % cards.length);
    });
  };
  var activate = function(i){ active = (i + cards.length) % cards.length; render(); };
  render();
  cards.forEach(function(card, i){
    card.addEventListener('click', function(e){
      if(card.getAttribute('data-pos') !== '0'){ e.preventDefault(); activate(i); }
    });
    card.addEventListener('focusin', function(){ if(card.getAttribute('data-pos') !== '0') activate(i); });
  });
  // Deslizar a los lados también pasa de carta
  var sx = null, sy = null;
  deck.addEventListener('touchstart', function(e){ var t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive:true });
  deck.addEventListener('touchend', function(e){
    if(sx === null) return;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    sx = sy = null;
    if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) activate(active + (dx < 0 ? 1 : -1));
  }, { passive:true });
})();
