#!/usr/bin/env python3
"""Genera el portafolio de bodas a partir de portafolio/bodas.json.

- Reemplaza el mosaico de la landing (entre <!-- BODAS:INICIO --> y <!-- BODAS:FIN --> en index.html).
- Crea portafolio/<slug>/index.html, una galería por pareja.
Uso: python3 tools/build_portafolio.py
"""
import json, html, pathlib, re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://res.cloudinary.com/yqfqih5o/image/upload/"
SITIO = "https://meltrujillo.com"
OG_DEFECTO = BASE + "w_1200,h_630,c_fill,g_auto,q_auto,f_jpg/v1789771786/Mel_Trujillo_-_Photography-5505.jpg"
CAL = "https://cal.com/meltrujillo/conocernos"

def u(path, w, extra=""):
    return f"{BASE}w_{w},{extra}q_auto,f_auto/{path}"

def e(s):
    return html.escape(s, quote=True)

datos = json.loads((RAIZ / "portafolio" / "bodas.json").read_text(encoding="utf-8"))["bodas"]

# ---------- Mosaico de la landing ----------
def tarjeta(i, b):
    grande = b.get("formato") == "grande"
    clase = "boda boda--grande" if grande else "boda"
    ancho = 1400 if grande else 900
    nombres, lugar = e(b["nombres"]), e(b["lugar"])
    return (
        f'        <a class="{clase}" href="/portafolio/{b["slug"]}/" aria-label="Ver la galería de {nombres}, {lugar}">\n'
        f'          <img src="{u(b["portada"], ancho)}" alt="{nombres}, boda en {lugar}" loading="lazy" style="object-position:{e(b.get("portada_posicion","center"))}">\n'
        f'          <span class="boda-pie"><span class="boda-nombres">{nombres}</span><span class="boda-lugar">{lugar}</span></span>\n'
        f'        </a>'
    )

mosaico = (
    '<!-- BODAS:INICIO (generado por tools/build_portafolio.py, no editar a mano) -->\n'
    '      <div class="bodas" data-mt-event="VioPortafolio" data-mt-label="portafolio-bodas" data-mt-once>\n'
    + "\n".join(tarjeta(i, b) for i, b in enumerate(datos)) +
    '\n      </div>\n      <!-- BODAS:FIN -->'
)

idx = RAIZ / "index.html"
s = idx.read_text(encoding="utf-8")
if "<!-- BODAS:INICIO" in s:
    s = re.sub(r"<!-- BODAS:INICIO.*?<!-- BODAS:FIN -->", lambda m: mosaico, s, flags=re.S)
else:
    # primera vez: reemplaza la cuadrícula antigua (.gallery) del portafolio
    s, n = re.subn(r'<div class="gallery" data-mt-event="VioPortafolio".*?</div>', lambda m: mosaico, s, count=1, flags=re.S)
    assert n == 1, "No encontré la cuadrícula antigua del portafolio"
if 'href="/assets/css/portafolio.css"' not in s:
    s = s.replace('<link rel="stylesheet" href="/assets/css/landing.css">',
                  '<link rel="stylesheet" href="/assets/css/landing.css">\n<link rel="stylesheet" href="/assets/css/portafolio.css">', 1)
idx.write_text(s, encoding="utf-8")

# ---------- Una galería por pareja ----------
def pagina(i, b):
    nombres, lugar = e(b["nombres"]), e(b["lugar"])
    url = f"{SITIO}/portafolio/{b['slug']}/"
    titulo = f'{nombres}, boda en {lugar} | Mel Trujillo Weddings'
    desc = e(b.get("intro") or f'Galería de la boda de {b["nombres"]} en {b["lugar"]}, contada por Mel Trujillo, fotógrafa de bodas en Bogotá.')
    og = u(b["portada"], 1200, "h_630,c_fill,g_auto,") .replace("f_auto", "f_jpg")
    robots = "index, follow, max-image-preview:large" if b.get("publicada") else "noindex, nofollow"
    ant = datos[(i - 1) % len(datos)]; sig = datos[(i + 1) % len(datos)]
    fotos = "\n".join(
        f'      <a class="gl-foto" href="{u(f, 1800)}" data-full="{u(f, 1800)}">'
        f'<img src="{u(f, 900)}" alt="{nombres}, boda en {lugar}, foto {n}" loading="lazy"></a>'
        for n, f in enumerate(b["fotos"], 1))
    intro = f'\n    <p class="gl-intro">{e(b["intro"])}</p>' if b.get("intro") else ""
    return f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{titulo}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta name="robots" content="{robots}">
<meta property="og:title" content="{titulo}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:url" content="{url}">
<meta property="og:locale" content="es_CO">
<meta property="og:site_name" content="Mel Trujillo Weddings">
<meta property="og:image" content="{og}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{BASE}w_64,h_64,c_fit,q_auto,f_auto/v1789771807/Logomt.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="/assets/css/global.css">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,400;1,700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/blog.css">
<link rel="stylesheet" href="/assets/css/portafolio.css">
</head>
<body data-page="portafolio-{b['slug']}">
<div class="inner-header"><div class="page-wrap">
  <header class="site">
    <a class="logo-lockup" href="/"><span class="word">Mel Trujillo Weddings</span></a>
    <nav class="site-nav" aria-label="Principal"><a href="/#portafolio" class="is-current">Portafolio</a><a href="/blog/">Blog</a><a href="/recursos/">Recursos</a></nav>
  </header>
</div></div>
<main class="page-wrap galeria-wrap">
  <nav class="crumbs" aria-label="Migas de pan"><a href="/">Inicio</a><span>/</span><a href="/#portafolio">Portafolio</a><span>/</span>{nombres}</nav>
  <header class="gl-cabeza">
    <p class="gl-lugar">{lugar}</p>
    <h1>{nombres}</h1>{intro}
  </header>
  <section class="gl-grid" aria-label="Fotos de {nombres}">
{fotos}
  </section>
  <nav class="gl-otras" aria-label="Otras bodas">
    <a href="/portafolio/{ant['slug']}/" rel="prev"><span>Boda anterior</span>{e(ant['nombres'])}</a>
    <a href="/portafolio/{sig['slug']}/" rel="next"><span>Siguiente boda</span>{e(sig['nombres'])}</a>
  </nav>
  <section class="article-cta">
    <h2>¿Quieren una galería así?</h2>
    <p>Agenden una videollamada y cuéntenme su historia. Mientras más los conozco, mejor.</p>
    <a class="btn btn-primary" href="{CAL}" target="_blank" rel="noopener" data-mt-label="galeria-{b['slug']}">Cuéntame tu historia</a>
  </section>
</main>
<div class="inner-footer"><div class="page-wrap">
  <footer>
    <div class="footer-bottom">
      <span>Bogotá, Colombia</span>
      <div class="footer-contact">
        <a href="https://instagram.com/meltrujilloweddings" target="_blank" rel="noopener">@meltrujilloweddings</a>
        <a href="{CAL}" target="_blank" rel="noopener" data-mt-label="pie">Agenda tu llamada</a>
        <a href="/privacidad">Privacidad</a>
        <a href="#" id="mt-cookie-prefs">Cookies</a>
      </div>
    </div>
  </footer>
</div></div>
<script src="/assets/js/galeria.js" defer></script>
<script src="/assets/js/tracking.js" defer></script>
</body>
</html>
'''

for i, b in enumerate(datos):
    carpeta = RAIZ / "portafolio" / b["slug"]
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / "index.html").write_text(pagina(i, b), encoding="utf-8")
print(f"Listo: {len(datos)} bodas, mosaico y galerías generados.")
