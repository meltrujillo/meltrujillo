/* galeria.js — visor ampliado para la galería de cada pareja (flechas, Esc y deslizar). */
(function(){
  var fotos = Array.prototype.slice.call(document.querySelectorAll('.gl-foto'));
  if(!fotos.length) return;

  var lb = document.createElement('div');
  lb.className = 'gl-lb'; lb.hidden = true;
  lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Foto ampliada');
  lb.innerHTML = '<button type="button" class="gl-x" aria-label="Cerrar">×</button>' +
                 '<button type="button" class="gl-prev" aria-label="Foto anterior">‹</button>' +
                 '<img alt=""><button type="button" class="gl-next" aria-label="Foto siguiente">›</button>';
  document.body.appendChild(lb);

  var img = lb.querySelector('img'), actual = 0, lanzador = null;

  function mostrar(i){
    actual = (i + fotos.length) % fotos.length;
    img.src = fotos[actual].getAttribute('data-full');
    img.alt = fotos[actual].querySelector('img').alt;
  }
  function abrir(i, desde){
    lanzador = desde; mostrar(i); lb.hidden = false;
    document.body.style.overflow = 'hidden';
    lb.querySelector('.gl-x').focus();
  }
  function cerrar(){
    lb.hidden = true; document.body.style.overflow = '';
    if(lanzador) lanzador.focus();
  }

  fotos.forEach(function(a, i){
    a.addEventListener('click', function(e){ e.preventDefault(); abrir(i, a); });
  });
  lb.querySelector('.gl-x').addEventListener('click', cerrar);
  lb.querySelector('.gl-prev').addEventListener('click', function(){ mostrar(actual - 1); });
  lb.querySelector('.gl-next').addEventListener('click', function(){ mostrar(actual + 1); });
  lb.addEventListener('click', function(e){ if(e.target === lb) cerrar(); });
  document.addEventListener('keydown', function(e){
    if(lb.hidden) return;
    if(e.key === 'Escape') cerrar();
    if(e.key === 'ArrowLeft') mostrar(actual - 1);
    if(e.key === 'ArrowRight') mostrar(actual + 1);
  });

  var x0 = null;
  lb.addEventListener('touchstart', function(e){ x0 = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function(e){
    if(x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0; x0 = null;
    if(Math.abs(dx) > 50) mostrar(actual + (dx < 0 ? 1 : -1));
  });
})();
