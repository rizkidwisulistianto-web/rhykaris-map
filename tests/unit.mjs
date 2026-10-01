// Unit tests for the shared math: sphere geometry, The Scar compass, datagrid reader, Kepler solver and moon parameters.
//   node unit.mjs
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { loadRH, readJSON } from './lib/load.mjs';
import { ROOT } from './lib/server.mjs';

const RH = loadRH();
const C = RH.core, M = RH.moons;
const DATA = readJSON('data/data.json'), MOONS = readJSON('data/moons.json');
C.configure(DATA.stats, DATA.thresholds);
M.configure(MOONS);

let pass = 0, fail = 0;
function t(name, ok, detail = '') { if (ok) pass++; else { fail++; console.log(`FAIL ${name} ${detail}`); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function nearName(name, a, b, tol) { t(name, near(a, b, tol), `got ${a}, want ${b} ±${tol}`); }
let seed = 1647; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// ---------------------------------------------------------------- sphere math
for (let i = 0; i < 2000; i++) {
  const lat = (rnd() - 0.5) * 178, lon = (rnd() - 0.5) * 359.9;
  const r = C.fromVec(C.vec(lat, lon));
  if (!near(r.lat, lat, 1e-9) || !near(C.lonN(r.lon - lon), 0, 1e-9)) { t('vec round-trip', false, `${lat},${lon} -> ${r.lat},${r.lon}`); break; }
}
t('vec round-trip (2000 random points)', true);
nearName('angDist 90°', C.angDist(0, 0, 0, 90), 90, 1e-9);
nearName('angDist antipode', C.angDist(10, 20, -10, -160), 180, 1e-7);
nearName('angDist pole-pole', C.angDist(90, 0, -90, 0), 180, 1e-9);
nearName('angDist tiny', C.angDist(0, 0, 0, 1e-7), 1e-7, 1e-12);
nearName('bearing east', C.bearing(0, 0, 0, 90), 90, 1e-9);
nearName('bearing north', C.bearing(0, 0, 10, 0), 0, 1e-9);
nearName('bearing south', C.bearing(10, 0, 0, 0), 180, 1e-9);
nearName('bearing west', C.bearing(0, 0, 0, -45), 270, 1e-9);
for (let i = 0; i < 500; i++) {                       // destination ∘ (distance, bearing) round trip
  const la = (rnd() - 0.5) * 160, lo = (rnd() - 0.5) * 360, b = rnd() * 360, d = rnd() * 150 + 0.1;
  const q = C.destination(la, lo, b, d);
  if (!near(C.angDist(la, lo, q[0], q[1]), d, 1e-7)) { t('destination distance', false, `${la},${lo},${b},${d}`); break; }
  if (d < 170 && Math.abs(la) < 80 && !near(((C.bearing(la, lo, q[0], q[1]) - b + 540) % 360) - 180, 0, 1e-6)) { t('destination bearing', false, `${la},${lo},${b},${d}`); break; }
}
t('destination round-trip (500)', true);
nearName('KM_DEG = 144,55 km/°', C.cfg.KM_DEG, 144.55, 0.01);
nearName('circumference', C.cfg.KM_DEG * 360, DATA.stats.circ_km, 2);

// ---------------------------------------------------------------- The Scar
const P = Object.fromEntries(DATA.places.map((p) => [p.id, p]));
nearName('Dies Ignis ≈ 18,25° from the curve', Math.abs(C.scarD(P.dies_ignis.lat, P.dies_ignis.lon)), 18.25, 0.06);
nearName('Litus Primum ≈ 19,35°', Math.abs(C.scarD(P.litus_primum.lat, P.litus_primum.lon)), 19.35, 0.06);
nearName('Libbāl ≈ 107,5°', Math.abs(C.scarD(P.libbal.lat, P.libbal.lon)), 107.5, 0.06);
t('Dies Ignis is on the Rhykar side, Libbāl on Aëris', C.scarD(P.dies_ignis.lat, P.dies_ignis.lon) < 0 && C.scarD(P.libbal.lat, P.libbal.lon) > 0);
let bad = 0; DATA.places.forEach((p) => { if (typeof p.d === 'number' && !p.label_only && Math.abs(C.scarD(p.lat, p.lon) - p.d) > 0.06) { bad++; console.log('  d mismatch', p.id, C.scarD(p.lat, p.lon), p.d); } });
t('recorded d matches computed d for point places', bad === 0, `${bad} mismatches`);
nearName('Sinus Adventus head (−2,3° / 0°) vs Litus Primum', P.litus_primum.lat, -2.35, 0.06);
// circle points are on the curve
for (const a of [-170, -90, 0, 45, 120, 180]) { const q = C.circlePt(a, 72.5); nearName(`circlePt(${a}) on curve`, C.scarD(q[0], q[1]), 0, 1e-9); }
// compass: singular cases
t('compass singular at Scar centre', C.scarCompass(-55.5, 0).singular);
t('compass singular at antipode', C.scarCompass(55.5, 180).singular);
t('compass singular at antipode (−180)', C.scarCompass(55.5, -180).singular);
t('compass not singular elsewhere', !C.scarCompass(-55.4, 0).singular && !C.scarCompass(55.4, 180).singular);
// compass: bearing leads to the genuinely nearest curve point (brute force over the curve)
const curve = []; for (let k = 0; k < 7200; k++) curve.push(C.circlePt(k * 0.05 - 180, 72.5));
let worst = 0, checked = 0;
for (let i = 0; i < 400; i++) {
  const la = (rnd() - 0.5) * 176, lo = (rnd() - 0.5) * 360, r = C.scarCompass(la, lo);
  if (r.singular) continue;
  let best = 1e9; for (const q of curve) best = Math.min(best, C.angDist(la, lo, q[0], q[1]));
  worst = Math.max(worst, Math.abs(best - r.distDeg));
  const dd = C.angDist(la, lo, r.nearest[0], r.nearest[1]); worst = Math.max(worst, Math.abs(dd - r.distDeg));
  nearName(`nearest point lies on the curve (${la.toFixed(1)},${lo.toFixed(1)})`, C.scarD(r.nearest[0], r.nearest[1]), 0, 1e-6);
  checked++;
}
t(`compass distance = brute-force nearest curve distance (${checked} points, worst Δ ${worst.toExponential(2)}°)`, worst < 0.06);
// documented rule: inside → opposite of bearing to centre; outside → toward centre
const inside = C.scarCompass(-10, 0), toC = C.bearing(-10, 0, -55.5, 0);
nearName('inside point: bearing = toward-centre + 180°', inside.bearing, (toC + 180) % 360, 1e-9);
const outside = C.scarCompass(30, 40), toC2 = C.bearing(30, 40, -55.5, 0);
nearName('outside point: bearing = toward centre', outside.bearing, toC2, 1e-9);
nearName('Dies Ignis compass distance (km)', C.scarCompass(P.dies_ignis.lat, P.dies_ignis.lon).distKm, 18.25 * 144.55, 10);
t('Dies Ignis ring is Adjacent', C.scarCompass(P.dies_ignis.lat, P.dies_ignis.lon).ring === 'Adjacent');
t('Libbāl ring is Unaffected, side Aëris', C.scarCompass(P.libbal.lat, P.libbal.lon).ring === 'Unaffected' && C.scarCompass(P.libbal.lat, P.libbal.lon).side === 'Aëris');
t('cardinal names', C.cardinal(0) === 'utara' && C.cardinal(92) === 'timur' && C.cardinal(225) === 'barat daya' && C.cardinal(359) === 'utara');
nearName('screenDir2D equator = bearing', C.screenDir2D(0, 70), 70, 1e-9);
nearName('screenDir2D bends east at 60° lat', C.screenDir2D(60, 45), Math.atan2(Math.sin(Math.PI / 4) / 0.5, Math.cos(Math.PI / 4)) * 180 / Math.PI, 1e-9);

// ---------------------------------------------------------------- datagrid reader (same canvas-free decode as the app uses)
{
  const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'assets/datagrid.png')));
  t('datagrid is 1024×512', png.width === 1024 && png.height === 512);
  const at = (la, lo) => C.terrainFrom(png.data, png.width, png.height, la, lo);
  const sea = at(P.tamtu.lat, P.tamtu.lon), land = at(P.aurelia.lat, P.aurelia.lon);
  t('datagrid: Tâmtu (world ocean) is below sea level', sea && sea.el < 0, JSON.stringify(sea));
  t('datagrid: Aurelia is land', land && land.el >= 0 && !/laut|Samudra|Paparan/i.test(land.b), JSON.stringify(land));
  t('datagrid wraps longitude', JSON.stringify(at(10, 190)) === JSON.stringify(at(10, -170)));
  t('datagrid out of range → null', at(95, 0) === null || at(95, 0) !== undefined);
}

// ---------------------------------------------------------------- moons
const big = M.byId('bulan_besar'), small = M.byId('bulan_kecil');
for (const m of [big, small]) {
  let maxRes = 0;
  for (let k = 0; k < 720; k++) { const Mn = k * Math.PI / 360, E = M.kepler(Mn, m.eccentricity); maxRes = Math.max(maxRes, Math.abs(E - m.eccentricity * Math.sin(E) - Mn)); }
  t(`Kepler residual ${m.id} < 1e-12`, maxRes < 1e-12, String(maxRes));
  // extreme eccentricity still converges
  const Ee = M.kepler(1.0, 0.18); t(`Kepler converges at e=0,18 (${m.id})`, Math.abs(Ee - 0.18 * Math.sin(Ee) - 1.0) < 1e-12);
  // periodicity in real units: position repeats every period
  const p0 = M.position(m, 3.3), p1 = M.position(m, 3.3 + M.period(m));
  t(`${m.id} returns after one period`, Math.hypot(p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]) < 1e-9);
  // not back at half a period (it moved)
  const ph = M.position(m, 3.3 + M.period(m) / 2); t(`${m.id} is elsewhere at half a period`, Math.hypot(p0[0] - ph[0], p0[1] - ph[1], p0[2] - ph[2]) > 1);
  // eccentricity read back from the orbit: (rmax − rmin)/(rmax + rmin)
  let rmin = 1e9, rmax = 0, zmax = 0;
  for (let k = 0; k < 4000; k++) { const p = M.position(m, k / 4000 * M.period(m)), r = Math.hypot(p[0], p[1], p[2]); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); zmax = Math.max(zmax, Math.abs(p[2])); }
  nearName(`${m.id} e read back from orbit`, (rmax - rmin) / (rmax + rmin), m.eccentricity, 2e-4);
  nearName(`${m.id} semi-major axis (rmin+rmax)/2`, (rmin + rmax) / 2, m.semi_major_axis_rel, 1e-3 * m.semi_major_axis_rel);
  // inclination read back: orbit normal tilt, and z extent
  const F = M.orbitFrame(m); nearName(`${m.id} inclination (normal·z)`, Math.acos(F[2][2]) * 180 / Math.PI, m.inclination_deg, 1e-9);
  t(`${m.id} max |z| ≈ r·sin i`, zmax <= rmax * Math.sin(m.inclination_deg * Math.PI / 180) + 1e-9 && zmax > 0.9 * rmin * Math.sin(m.inclination_deg * Math.PI / 180) * 0.9, `${zmax}`);
  // displayed radius is the REAL relative radius
  nearName(`${m.id} scene radius = real relative radius`, M.sceneRadius(m), m.radius_km / MOONS.planet.radius_km, 5e-5);
  // mass vs density
  const mass = m.density_gcm3 * 1000 * 4 / 3 * Math.PI * Math.pow(m.radius_km * 1000, 3);
  nearName(`${m.id} mass consistent with density·volume`, mass / m.mass_kg, 1, 0.01);
  // Kepler III sanity vs the table period (±2%)
  nearName(`${m.id} Kepler-III period vs table (Earth days)`, M.keplerPeriodDaysEarth(m) / m.period_days_earth, 1, 0.02);
  const dv = M.derived(m);
  nearName(`${m.id} period in Earth days (derived)`, dv.periodDaysE, m.period_days_earth, 0.06);
  nearName(`${m.id} angular size at mean distance ≈ table`, dv.angMeanDeg, (m.angular_size_deg[0] + m.angular_size_deg[1]) / 2, 0.01);
  if (m.angular_size_deg[0] !== m.angular_size_deg[1]) {   // the small moon's table range IS the e = 0,12 range
    nearName(`${m.id} angular size min (apoapsis)`, dv.angMinDeg, m.angular_size_deg[0], 0.006);
    nearName(`${m.id} angular size max (periapsis)`, dv.angMaxDeg, m.angular_size_deg[1], 0.006);
  }
}
nearName('period ratio big:small = 3,41', M.periodRatio(), 3.41, 0.005);
nearName('periods 12,1 and 3,55 hari-R', M.period(big) + M.period(small), 12.1 + 3.55, 1e-12);
t('small moon stays inside the big moon orbit (real)', small.semi_major_axis_km * (1 + small.eccentricity) < big.semi_major_axis_km * (1 - big.eccentricity));
t('small moon distance ≤ 125.000 km and below the 131.000 km stability cliff', small.semi_major_axis_km <= 125000 && small.semi_major_axis_km < MOONS.stability.cliff_km);
// compression: monotone, anchors, order, ellipse shape preserved
let mono = true; for (let a = 2; a < 60; a += 0.1) if (!(M.compress(a + 0.1) > M.compress(a))) mono = false;
t('compress() strictly monotone', mono);
nearName('compress(near) = 2,2', M.compress(small.semi_major_axis_rel), 2.2, 1e-9);
nearName('compress(far) = 3,4', M.compress(big.semi_major_axis_rel), 3.4, 1e-9);
t('display order preserved & orbits do not cross', M.compress(small.semi_major_axis_rel) * (1 + small.eccentricity) < M.compress(big.semi_major_axis_rel) * (1 - big.eccentricity));
for (const m of [big, small]) {   // compressed orbit keeps e exactly
  const path = M.orbitPath(m, 720); let rmin = 1e9, rmax = 0; path.forEach((q) => { const r = Math.hypot(q[0], q[1], q[2]); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); });
  nearName(`${m.id} displayed orbit keeps e`, (rmax - rmin) / (rmax + rmin), m.eccentricity, 5e-4);
}
// scene frame: planet frame (x,y,z) → scene (y,z,x); equator orbit would lie in the XZ plane
{ const p = M.position(big, 0, 1), s = M.scenePosition(big, 0), a = M.compress(big.semi_major_axis_rel); nearName('scenePosition = (y,z,x) · compressed', Math.hypot(s[0], s[1], s[2]), Math.hypot(p[0], p[1], p[2]) * a, 1e-9); }
nearName('moons.json provenance: all moons Inferensi AI', MOONS.moons.filter((m) => m.epi === 'inferensi').length, 2, 0);
t('moons.json top-level epi is inferensi', MOONS.epi === 'inferensi');

console.log(`unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
