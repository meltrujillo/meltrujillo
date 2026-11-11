/* related.js — arma dos cosas a partir de posts.js:
 *   1) <div id="lista-posts">  : el listado completo (página /blog/).
 *   2) <aside id="relacionados" data-slug="..."> : "Quizás te interese" al pie de cada artículo.
 * Para los relacionados, primero busca artículos con la misma categoría y, si faltan, completa con otros
 * hasta llegar a 3 (o a todos los que existan). */
(function () {
  var posts = window.MT_POSTS || [];
  if (!posts.length) return;

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  var list = document.getElementById('lista-posts');
  if (list) {
    list.innerHTML = posts.map(function (p) {
      return '<a class="post-card" href="/blog/' + esc(p.slug) + '">' +
        '<img src="' + esc(p.image) + '" alt="' + esc(p.alt) + '" width="900" height="600" loading="lazy">' +
        '<div><p class="eyebrow">' + esc(p.tag) + '</p><h2>' + esc(p.title) + '</h2><p>' + esc(p.summary) + '</p></div></a>';
    }).join('');
  }

  var box = document.getElementById('relacionados');
  if (box) {
    var current = box.getAttribute('data-slug');
    var me = posts.filter(function (p) { return p.slug === current; })[0];
    var others = posts.filter(function (p) { return p.slug !== current; });
    var same = others.filter(function (p) { return me && p.tag === me.tag; });
    var rest = others.filter(function (p) { return same.indexOf(p) === -1; });
    var picks = same.concat(rest).slice(0, 3);
    if (!picks.length) { box.hidden = true; return; }
    box.querySelector('.related-grid').innerHTML = picks.map(function (p) {
      return '<a href="/blog/' + esc(p.slug) + '">' +
        '<img src="' + esc(p.image) + '" alt="' + esc(p.alt) + '" width="900" height="600" loading="lazy">' +
        '<p class="eyebrow">' + esc(p.tag) + '</p><span class="t">' + esc(p.title) + '</span></a>';
    }).join('');
    box.hidden = false;
  }
})();
