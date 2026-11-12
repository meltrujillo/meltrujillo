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
      slides.style.scrollBehavior = 'auto';
      slides.scrollLeft = w;
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
      if(!mobileMQ.matches) return;            // en PC lo maneja el carrusel de abajo
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

// Hero en PC: las 6 fotos pasan solas y también con las flechas, sin fin
(function(){
  var slides = document.getElementById('heroSlides');
  var mq = window.matchMedia('(min-width:768px)');
  if(!slides || !mq.matches) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var imgs = Array.prototype.slice.call(slides.querySelectorAll('img'));
  imgs.forEach(function(im){ im.loading = 'eager'; });
  // Orden: primero la foto del anuncio, luego la de siempre y las demás
  var list = [imgs[1], imgs[0]].concat(imgs.slice(2)).filter(Boolean);
  var paint = function(){ list.forEach(function(el, i){ el.style.order = i; }); };
  paint();
  var gap = function(){ return parseFloat(getComputedStyle(slides).columnGap) || 0; };
  var busy = false, pend = 0, timer;
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
    if(!mq.matches) return;
    if(busy){ pend = dir; return; }
    busy = true;
    var first, w;
    if(dir > 0){
      w = list[0].getBoundingClientRect().width + gap();
      slides.scrollTo({ left: w, behavior: reduce ? 'auto' : 'smooth' });
      waitStop(function(){
        list.push(list.shift()); paint();
        slides.scrollLeft = 0;
        busy = false; next();
      });
    } else {
      first = list[list.length - 1];
      w = first.getBoundingClientRect().width + gap();
      list.unshift(list.pop()); paint();
      slides.scrollLeft = w;
      slides.scrollTo({ left: 0, behavior: reduce ? 'auto' : 'smooth' });
      waitStop(function(){ busy = false; next(); });
    }
  };
  var next = function(){ if(pend){ var d = pend; pend = 0; go(d); } };
  var prev = document.querySelector('.hero-arrow.prev');
  var nxt = document.querySelector('.hero-arrow.next');
  if(prev) prev.addEventListener('click', function(){ go(-1); schedule(); });
  if(nxt) nxt.addEventListener('click', function(){ go(1); schedule(); });
  // Avance automático cada 3 segundos (se apaga si la persona pidió menos movimiento)
  var hovering = false;
  var schedule = function(){
    clearTimeout(timer);
    if(reduce) return;
    timer = setTimeout(function(){
      if(!document.hidden) go(1);
      schedule();
    }, 3000);
  };
  var hero = slides.parentNode;
  hero.addEventListener('mousemove', function(e){ hovering = e.clientY <= slides.getBoundingClientRect().bottom; });
  hero.addEventListener('mouseleave', function(){ hovering = false; });
  schedule();
  // Si cambian el tamaño de la ventana a celular, se recarga para usar el carrusel del celular
  mq.addEventListener && mq.addEventListener('change', function(){ location.reload(); });
})();
