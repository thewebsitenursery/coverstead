import path from 'node:path';

export const marketingPages = ['/', '/demo', '/manual', '/install', '/get-started', '/managed', '/pub-booking-system', '/switching-from-paper', '/venue-fit', '/developers'];
export function registerMarketing(app, directory, origin) {
  for (const page of ['/managed', '/pub-booking-system', '/switching-from-paper', '/website-data', '/enquire', '/venue-fit', '/developers']) {
    app.get(page, (_req, res) => res.sendFile(path.join(directory, 'public', page.slice(1) + '.html')));
  }
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send(
    'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /assets/\nSitemap: ' + origin + '/sitemap.xml\n'
  ));
  app.get('/sitemap.xml', (_req, res) => res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    marketingPages.map(page => '<url><loc>' + (origin + page).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;') + '</loc></url>').join('') + '</urlset>'
  ));
}
