import fs from "node:fs";
import path from "node:path";

const inPath = process.argv[2];
const outPath = process.argv[3];

if (!inPath || !outPath) {
  console.error("Usage: node buildCountyBounds.mjs <input.geojson> <output.json>");
  process.exit(1);
}

const inputAbs = path.resolve(process.cwd(), inPath);
const outputAbs = path.resolve(process.cwd(), outPath);

const geo = JSON.parse(fs.readFileSync(inputAbs, "utf8"));

/**
 * Detect if coords look like Web Mercator meters (EPSG:3857)
 * Typical lon/lat are within [-180..180], [-90..90]
 * Typical 3857 x/y are in the millions (|x|>1000 is already suspicious)
 */
function looksLike3857(lng, lat) {
  return Math.abs(lng) > 180 || Math.abs(lat) > 90;
}

/**
 * Convert EPSG:3857 meters -> WGS84 lon/lat degrees
 * See: https://wiki.openstreetmap.org/wiki/Mercator
 */
function mercatorToLonLat(x, y) {
  const R = 6378137.0;
  const lon = (x / R) * (180 / Math.PI);
  const lat =
    (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
  return [lon, lat];
}

function extend(b, lon, lat) {
  if (lon < b.minLng) b.minLng = lon;
  if (lat < b.minLat) b.minLat = lat;
  if (lon > b.maxLng) b.maxLng = lon;
  if (lat > b.maxLat) b.maxLat = lat;
}

function walkCoords(coords, b, state) {
  if (!coords) return;

  // base case: [x,y] (either lon/lat OR mercator meters)
  if (typeof coords[0] === "number") {
    let x = coords[0];
    let y = coords[1];

    // Decide projection on first coordinate we see
    if (state.is3857 === null) {
      state.is3857 = looksLike3857(x, y);
    }

    if (state.is3857) {
      [x, y] = mercatorToLonLat(x, y);
    }

    extend(b, x, y);
    return;
  }

  for (const c of coords) walkCoords(c, b, state);
}

// Your sample confirms NAME exists
function getCountyName(props) {
  return props?.NAME ?? null;
}

const out = {};
let detected3857Count = 0;

for (const f of geo.features ?? []) {
  const name = getCountyName(f.properties);
  if (!name || !f.geometry) continue;

  const b = { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity };
  const state = { is3857: null };

  walkCoords(f.geometry.coordinates, b, state);

  if (state.is3857) detected3857Count++;

  if (Number.isFinite(b.minLng)) {
    out[String(name)] = [
      [b.minLng, b.minLat],
      [b.maxLng, b.maxLat],
    ];
  }
}

fs.mkdirSync(path.dirname(outputAbs), { recursive: true });
fs.writeFileSync(outputAbs, JSON.stringify(out, null, 2));

console.log(
  `Wrote ${Object.keys(out).length} county bounds to ${outputAbs}\n` +
  `Detected EPSG:3857-like coords in ${detected3857Count} features`
);
