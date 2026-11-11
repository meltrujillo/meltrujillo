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
