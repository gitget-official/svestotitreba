// Poslije `ng build`: statične HTML stranice za pretraživače i dijeljenje linkova, plus sitemap.xml i robots.txt.
//
// Za svakog aktivnog ponuđača pravi dist/.../ponudjaci/{id}-{slug}/index.html: isti index.html aplikacije,
// ali sa pravim naslovom, opisom, Open Graph podacima, kanonskim linkom, strukturiranim podacima (JSON-LD)
// i osnovnim sadržajem stranice (naziv, grad, opis, usluge i cijene). Pretraživač to vidi odmah, a kad se
// Angular pokrene, zamijeni taj sadržaj pravom stranicom.
//
// Pokretanje:  SITE_URL=https://domena.ba API_URL=http://localhost:5080/api npm run prerender
// Ako API nije dostupan, prave se samo stranice bez ponuđača, sitemap i robots.txt (build ne pada).
//
// SITEMAP_URL (opciono): adresa sitemapa sa servera (API: /sitemap.xml ili /api/sitemap.xml), koji je uvijek svjež.
// Tada robots.txt pokazuje na nju; statični sitemap.xml se i dalje pravi kao rezerva.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = process.env.DIST_DIR ?? join(root, 'dist/frontend/browser');
const SITE = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
const API = (process.env.API_URL ?? 'http://localhost:5080/api').replace(/\/+$/, '');
const SITEMAP_URL = process.env.SITEMAP_URL ?? '';

// Ime i opis se čitaju iz core/brand.ts, da postoje samo na jednom mjestu.
const brandSrc = await readFile(join(root, 'src/app/core/brand.ts'), 'utf8');
const BRAND = {
  name: /name:\s*'([^']+)'/.exec(brandSrc)?.[1] ?? 'Planiraj',
  tagline: /tagline:\s*'([^']+)'/.exec(brandSrc)?.[1] ?? '',
};

/** Javne stranice bez parametara: naslov i opis kao u aplikaciji. */
const PAGES = [
  { path: '/', title: `${BRAND.name}: ${BRAND.tagline}`, description: null, priority: '1.0' },
  {
    path: '/istrazi',
    title: `Istraži ponudu · ${BRAND.name}`,
    description:
      'Saloni, fotografi, muzika, torte, dekoracije i ostalo za vjenčanje u BiH. Filtrirajte po gradu, cijeni i ocjeni.',
    priority: '0.9',
  },
  {
    path: '/planiranje',
    title: `Planiranje vjenčanja · ${BRAND.name}`,
    description: 'Unesite budžet, grad i datum, a planer predloži ponuđače koji se uklapaju.',
    priority: '0.8',
  },
  {
    path: '/uslovi',
    title: `Uslovi korištenja · ${BRAND.name}`,
    description: `Uslovi korištenja platforme ${BRAND.name}.`,
    priority: '0.2',
  },
  {
    path: '/privatnost',
    title: `Privatnost · ${BRAND.name}`,
    description: `Koje podatke ${BRAND.name} čuva, zašto i kako ih obrisati.`,
    priority: '0.2',
  },
];

/** Stranice koje pretraživač ne treba indeksirati (lične ili za prijavljene). */
const PRIVATE = [
  '/profil',
  '/sacuvano',
  '/moje-rezervacije',
  '/moje-recenzije',
  '/salon',
  '/admin',
  '/dobrodosli',
  '/promjena-lozinke',
  '/prijava',
  '/registracija',
];

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const km = (n) => `${Math.round(n).toLocaleString('bs-BA')} KM`;
const abs = (path) => (SITE ? SITE + path : path);
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

if (!SITE)
  console.warn(
    'prerender: SITE_URL nije postavljen; kanonski linkovi i sitemap će imati relativne adrese.',
  );

const template = await readFile(join(DIST, 'index.html'), 'utf8');

/** index.html sa zamijenjenim naslovom i meta podacima, i (opciono) sadržajem u <app-root>. */
function page({ path, title, description, image, jsonLd, body, canonical = true }) {
  let html = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  const set = (attr, key, value) => {
    const re = new RegExp(`<meta ${attr}="${key}"[^>]*>`);
    const tag = `<meta ${attr}="${key}" content="${esc(value)}">`;
    html = re.test(html) ? html.replace(re, tag) : html.replace('</head>', `  ${tag}\n</head>`);
  };
  if (description) {
    set('name', 'description', description);
    set('property', 'og:description', description);
  }
  set('property', 'og:title', title);
  if (image) set('property', 'og:image', image);
  // Početni index.html je i rezerva za sve ostale adrese (SPA), pa on nema kanonski link: njega postavlja aplikacija.
  if (canonical) {
    set('property', 'og:url', abs(path));
    html = html.replace('</head>', `  <link rel="canonical" href="${esc(abs(path))}">\n</head>`);
  }
  if (jsonLd)
    html = html.replace(
      '</head>',
      `  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>\n</head>`,
    );
  if (body) html = html.replace(/<app-root>\s*<\/app-root>/, `<app-root>${body}</app-root>`);
  return html;
}

async function write(path, html) {
  const file = path === '/' ? join(DIST, 'index.html') : join(DIST, path, 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}

async function fetchVendors() {
  const all = [];
  for (let p = 1; p < 100; p++) {
    const res = await fetch(`${API}/vendors?page=${p}&pageSize=100`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`GET /vendors: ${res.status}`);
    const data = await res.json();
    all.push(...data.items);
    if (all.length >= data.totalCount || data.items.length === 0) break;
  }
  const unique = new Map(all.map((v) => [v.id, v]));
  return [...unique.values()].filter((v) => v.isActive);
}

function vendorPage(v) {
  const path = `/ponudjaci/${v.id}-${v.slug}`;
  const cats = v.categories.join(', ');
  const description = cut(v.description || `${cats} u gradu ${v.cityName}.`, 160);
  const cover = (v.images.find((i) => i.isCover) ?? v.images[0])?.url ?? null;
  const offers = v.offerings.filter((o) => o.isActive);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: v.name,
    description: v.description || undefined,
    url: abs(path),
    image: cover || undefined,
    telephone: v.phoneNumber || undefined,
    email: v.email || undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: v.address || undefined,
      addressLocality: v.cityName || undefined,
      addressCountry: 'BA',
    },
    geo:
      v.latitude != null && v.longitude != null
        ? { '@type': 'GeoCoordinates', latitude: v.latitude, longitude: v.longitude }
        : undefined,
    priceRange:
      v.priceFrom != null ? `${km(v.priceFrom)} - ${km(v.priceTo ?? v.priceFrom)}` : undefined,
    aggregateRating:
      v.reviewCount > 0 && v.averageRating != null
        ? { '@type': 'AggregateRating', ratingValue: v.averageRating, reviewCount: v.reviewCount }
        : undefined,
    sameAs: [v.website, v.instagramUrl, v.facebookUrl, v.tikTokUrl].filter(Boolean),
  };

  const body = `
    <main class="container page prerender">
      <h1>${esc(v.name)}</h1>
      <p>${esc([v.cityName, cats].filter(Boolean).join(' · '))}</p>
      ${v.description ? `<p>${esc(v.description)}</p>` : ''}
      ${offers.length ? `<h2>Usluge i cijene</h2><ul>${offers.map((o) => `<li><strong>${esc(o.title)}</strong>: od ${km(o.priceFrom)} do ${km(o.priceTo)}${o.description ? `. ${esc(o.description)}` : ''}</li>`).join('')}</ul>` : ''}
      ${v.address ? `<p>Adresa: ${esc(v.address)}, ${esc(v.cityName)}</p>` : ''}
      <p><a href="/istrazi">Sva ponuda za vjenčanje</a></p>
    </main>`;

  return {
    path,
    html: page({
      path,
      title: `${v.name} · ${v.cityName} · ${BRAND.name}`,
      description,
      image: cover,
      jsonLd,
      body,
    }),
  };
}

// ---------- pokretanje ----------
for (const p of PAGES.filter((p) => p.path !== '/')) await write(p.path, page(p));
await writeFile(join(DIST, 'index.html'), page({ ...PAGES[0], canonical: false }));

let vendors = [];
try {
  vendors = await fetchVendors();
} catch (e) {
  console.warn(
    `prerender: API nije dostupan (${API}): ${e.message}. Stranice ponuđača se ne prave.`,
  );
}
const vendorPages = vendors.map(vendorPage);
for (const vp of vendorPages) await write(vp.path, vp.html);

const today = new Date().toISOString().slice(0, 10);
const urls = [
  ...PAGES.map(
    (p) =>
      `  <url><loc>${esc(abs(p.path))}</loc><lastmod>${today}</lastmod><priority>${p.priority}</priority></url>`,
  ),
  ...vendorPages.map(
    (vp) =>
      `  <url><loc>${esc(abs(vp.path))}</loc><lastmod>${today}</lastmod><priority>0.7</priority></url>`,
  ),
];
await writeFile(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
);
await writeFile(
  join(DIST, 'robots.txt'),
  `User-agent: *\n${PRIVATE.map((p) => `Disallow: ${p}`).join('\n')}\n\nSitemap: ${SITEMAP_URL || abs('/sitemap.xml')}\n`,
);

console.log(
  `prerender: ${PAGES.length} stranica, ${vendorPages.length} ponuđača, sitemap.xml (${urls.length} adresa), robots.txt`,
);
