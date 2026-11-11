/* posts.js — lista única de artículos del blog.
 *
 * Para publicar un artículo nuevo se agrega UNA entrada aquí (arriba de las demás), se crea su archivo
 * en /blog/ y se suma al sitemap.xml. Lo demás (listado del blog y "Quizás te interese") se arma solo.
 *
 * Campos: slug (nombre del archivo sin .html), title, summary, image (URL de Cloudinary),
 *         alt (descripción de la foto), tag (categoría; los artículos con la misma se recomiendan primero),
 *         date (AAAA-MM-DD).
 */
window.MT_POSTS = [
  {
    slug: 'como-elegir-fotografo-de-bodas-en-bogota',
    title: 'Cómo elegir fotógrafo de bodas en Bogotá: 7 preguntas antes de reservar',
    summary: 'Siete preguntas para conocer a su fotógrafo antes de firmar, y qué escuchar en cada respuesta.',
    image: 'https://res.cloudinary.com/yqfqih5o/image/upload/w_900,h_600,c_fill,g_auto,q_auto,f_auto/v1789770575/Mel_Trujillo_-_Photography-7.jpg',
    alt: 'Fotografía de boda documental en Bogotá por Mel Trujillo Weddings',
    tag: 'Elegir fotógrafo',
    date: '2026-11-11'
  },
  {
    slug: 'cronograma-del-dia-de-la-boda',
    title: 'Cronograma del día de la boda: cómo repartir las horas para vivirlo con calma',
    summary: 'Un cronograma armado al revés, con margen y con luz, para que el día fluya sin carreras.',
    image: 'https://res.cloudinary.com/yqfqih5o/image/upload/w_900,h_600,c_fill,g_auto,q_auto,f_auto/v1789770651/Mel_Trujillo_-_Photography-126.jpg',
    alt: 'Pareja de novios durante su boda, fotografía de Mel Trujillo Weddings',
    tag: 'Planear el día',
    date: '2026-11-11'
  },
  {
    slug: 'honrar-a-quienes-faltan-en-su-boda',
    title: 'Cómo honrar a quienes faltan en el día de su boda',
    summary: 'Gestos pequeños, elegidos por ustedes, para que una ausencia tenga su lugar en un día de alegría.',
    image: 'https://res.cloudinary.com/yqfqih5o/image/upload/w_900,h_600,c_fill,g_auto,q_auto,f_auto/v1789770718/Mel_Trujillo_-_Photography-143.jpg',
    alt: 'Momento íntimo de una boda fotografiado por Mel Trujillo Weddings',
    tag: 'Lo que se siente',
    date: '2026-11-11'
  }
];
