// Generiše src/app/pages/landing/bih-geo.ts: granicu BiH i općine kao gotove SVG putanje za mapu na početnoj.
// Izvor je geoBoundaries (gbOpen, javna domena), zaključan na konkretan commit da se rezultat ne mijenja sam od sebe.
// Pokretanje: npm run geo:bih (treba internet samo za ovaj korak; aplikacija ne preuzima ništa u radu).
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const COUNTRY_URL =
  'https://github.com/wmgeolab/geoBoundaries/raw/f549eab/releaseData/gbOpen/BIH/ADM0/geoBoundaries-BIH-ADM0.geojson';
const MUNICIPALITIES_URL =
  'https://github.com/wmgeolab/geoBoundaries/raw/f549eab/releaseData/gbOpen/BIH/ADM3/geoBoundaries-BIH-ADM3_simplified.geojson';
const OUT = fileURLToPath(new URL('../src/app/pages/landing/bih-geo.ts', import.meta.url));

/** Širina mape u jedinicama viewBox-a (bez ruba). */
const INNER = 960;
const PAD = 20;
/** Tolerancija pojednostavljenja (u jedinicama viewBox-a): granica je detaljnija, općine su samo blage linije. */
const COUNTRY_TOLERANCE = 0.5;
const MUNICIPALITY_TOLERANCE = 1.4;

async function load(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

const rings = (geometry) =>
  (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).map((polygon) => polygon[0]);

/** Douglas–Peucker; zatvoreni prsten se dijeli na dvije polovine jer su mu prva i zadnja tačka iste. */
function simplifyLine(points, eps) {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points.at(-1)];
  let max = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const d = len ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= eps) return [a, b];
  return simplifyLine(points.slice(0, index + 1), eps).slice(0, -1).concat(simplifyLine(points.slice(index), eps));
}

function simplifyRing(ring, eps) {
  const mid = Math.floor(ring.length / 2);
  return simplifyLine(ring.slice(0, mid + 1), eps).slice(0, -1).concat(simplifyLine(ring.slice(mid), eps));
}

const fmt = (n, decimals) => n.toFixed(decimals).replace(/\.0$/, '');
const toPath = (ring, decimals) => 'M' + ring.map(([x, y]) => `${fmt(x, decimals)} ${fmt(y, decimals)}`).join('L') + 'Z';

const country = await load(COUNTRY_URL);
const municipalities = await load(MUNICIPALITIES_URL);

const outline = rings(country.features[0].geometry).sort((a, b) => b.length - a.length)[0];
let [minLon, maxLon, minLat, maxLat] = [Infinity, -Infinity, Infinity, -Infinity];
for (const [lon, lat] of outline) {
  minLon = Math.min(minLon, lon);
  maxLon = Math.max(maxLon, lon);
  minLat = Math.min(minLat, lat);
  maxLat = Math.max(maxLat, lat);
}

// Ekvidistantna projekcija sa korekcijom cos(44°): za zemlju veličine BiH razlika od "prave" projekcije se ne vidi.
const kx = Math.cos((44 * Math.PI) / 180);
const scale = INNER / ((maxLon - minLon) * kx);
const project = ([lon, lat]) => [PAD + (lon - minLon) * kx * scale, PAD + (maxLat - lat) * scale];
const width = Math.round(INNER + 2 * PAD);
const height = Math.round((maxLat - minLat) * scale + 2 * PAD);

const countryPath = toPath(simplifyRing(outline.map(project), COUNTRY_TOLERANCE), 1);
const municipalityPath = municipalities.features
  .flatMap((f) => rings(f.geometry))
  .filter((ring) => ring.length >= 4)
  .map((ring) => simplifyRing(ring.map(project), MUNICIPALITY_TOLERANCE))
  .filter((ring) => ring.length > 3)
  .map((ring) => toPath(ring, 0))
  .join('');

const source = `// Generisano iz geoBoundaries (gbOpen, javna domena): granica BiH (ADM0) i općine (ADM3).
// Koordinate su već projektovane (ekvidistantna projekcija, korekcija cos 44°) u prostor širine ${width}.
// Ne uređivati ručno: npm run geo:bih (scripts/build-bih-geo.mjs).
export const BIH_GEO = {
  width: ${width},
  height: ${height},
  lon0: ${+minLon.toFixed(5)},
  lat0: ${+maxLat.toFixed(5)},
  scaleX: ${+(kx * scale).toFixed(4)},
  scaleY: ${+scale.toFixed(4)},
  pad: ${PAD},
  country: '${countryPath}',
  municipalities: '${municipalityPath}',
} as const;
`;

await writeFile(OUT, source);
console.log(`bih-geo.ts: ${(source.length / 1024).toFixed(1)} KB, ${municipalities.features.length} općina`);
