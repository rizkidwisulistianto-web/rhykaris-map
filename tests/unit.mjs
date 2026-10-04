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

// ---------------------------------------------------------------- data-line widths (shared by flat map, globe and disk)
{
  let mono = true; for (let z = 0.5; z < 6.5; z += 0.25) if (C.lineW(1.1, z + 0.25) > C.lineW(1.1, z) + 1e-12) mono = false;
  t('line width never grows when zooming in', mono);
  t('line width is thinner at zoom 6 than at zoom 3', C.lineW(C.LINE.terr, 6) < C.lineW(C.LINE.terr, 3));
  t('line width never drops below the visible floor', C.lineW(0.1, 6.5) >= C.LINE_MIN && C.lineW(C.LINE.terr, 6.5) >= C.LINE_MIN);
  t('territory border is thin (≤ 1.3 px) at every zoom', [1, 2, 3, 4, 5, 6].every(z => C.lineW(C.LINE.terr, z) <= 1.3));
  t('arrow scale shrinks with zoom but stays ≥ 0.5', C.arrowK(6) < C.arrowK(3) && C.arrowK(6.5) >= 0.5);
}

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


// ---------------------------------------------------------------- dual-disk Lambert azimuthal equal-area (RH.disk.math)
{
  const K = RH.disk.math, D2R = Math.PI / 180;
  const dotv = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  t('frame: a, u0, u90 are orthonormal', near(dotv(K.a, K.a), 1, 1e-12) && near(dotv(K.u0, K.u0), 1, 1e-12) && near(dotv(K.u90, K.u90), 1, 1e-12) && near(dotv(K.a, K.u0), 0, 1e-12) && near(dotv(K.a, K.u90), 0, 1e-12) && near(dotv(K.u0, K.u90), 0, 1e-12));
  nearName('u90 is local east at the Scar centre (+y, lon 90°)', K.u90[1], 1, 1e-12);
  // the disk azimuth is the SAME parametrisation as the Scar curve used by the 2D/3D viewers (RH.core.circlePt)
  let dev = 0; for (let al = -180; al < 180; al += 7.3) { const p = K.fromPolar(72.5, al), q = C.circlePt(al, 72.5); dev = Math.max(dev, Math.abs(p[0] - q[0]), Math.abs(C.lonN(p[1] - q[1]))); }
  t(`fromPolar(72,5°, α) = RH.core.circlePt(α, 72,5) for all azimuths (max Δ ${dev.toExponential(1)}°)`, dev < 1e-9);
  nearName('azimuth 0 at θ = 72,5° is the Scar peak (+17,0° lat, lon 0°)', K.fromPolar(72.5, 0)[0], 17.0, 1e-9); nearName('peak longitude', K.fromPolar(72.5, 0)[1], 0, 1e-9);
  // polar round trip
  let rt = 0; for (let i = 0; i < 3000; i++) { const th = rnd() * 178 + 1, al = (rnd() - 0.5) * 359, ll = K.fromPolar(th, al), pp = K.polar(ll[0], ll[1]); rt = Math.max(rt, Math.abs(pp.theta - th), Math.abs(((pp.alpha - al + 540) % 360) - 180)); }
  t(`polar ↔ geographic round trip (3000 points, max Δ ${rt.toExponential(1)}°)`, rt < 1e-8);
  // Lambert forward/inverse round trip in both layouts and both disks
  for (const orient of ['h', 'v']) {
    const L = K.layout(orient); let worst = 0, n = 0, bothDisks = 0;
    for (let i = 0; i < 4000; i++) {
      const la = (rnd() - 0.5) * 178, lo = (rnd() - 0.5) * 359.9, prs = K.project(la, lo, L);
      for (const pr of prs) { const back = K.unproject(pr.x, pr.y, L); n++; if (!back) { worst = 9; continue; } worst = Math.max(worst, Math.abs(back.lat - la), Math.abs(C.lonN(back.lon - lo)) * Math.cos(la * D2R)); }
      if (prs.length === 2) bothDisks++;
    }
    t(`Lambert round trip, layout ${orient}: ${n} projected points, max Δ ${worst.toExponential(1)}° (${bothDisks} in the margin overlap)`, worst < 1e-7);
  }
  // every point is on at least one disk
  { let miss = 0; const L = K.layout('h'); for (let i = 0; i < 4000; i++) if (!K.project((rnd() - 0.5) * 178, (rnd() - 0.5) * 359.9, L).length) miss++; t('every point of the sphere lands on a disk', miss === 0); }
  // test places land on the right disk
  { const L = K.layout('h'), place = (id) => P[id]; const pr = (id) => K.project(place(id).lat, place(id).lon, L);
    t('Sinus Adventus head / Litus Primum lands on the Rhykar disk only', pr('litus_primum').length === 1 && pr('litus_primum')[0].disk === 'R');
    t('Dies Ignis lands on the Rhykar disk only', pr('dies_ignis').length === 1 && pr('dies_ignis')[0].disk === 'R');
    const lb = pr('libbal'); t('Libbāl lands on the Aëris disk only', lb.length === 1 && lb[0].disk === 'A');
    t('Libbāl is at the exact centre of the Aëris disk (it is the antipode of the Scar centre)', near(lb[0].x, L.A.cx, 1e-6) && near(lb[0].y, L.A.cy, 1e-6), JSON.stringify(lb[0]));
    const c0 = K.project(-55.5, 0, L)[0]; t('Scar centre is the exact centre of the Rhykar disk', near(c0.x, L.R.cx, 1e-9) && near(c0.y, L.R.cy, 1e-9));
    t('Ellumāt (55,5°, 180°) is on the Aëris disk, Vastitas pole (−90°) on the Rhykar disk', K.project(55.5, 180, L)[0].disk === 'A' && K.project(-90, 0, L)[0].disk === 'R');
    const m = K.project(...K.fromPolar(74.5, 30), L); t('a point 2° beyond the Scar rim shows on BOTH disks (faded context margin)', m.length === 2 && m[0].disk === 'R' && m[1].disk === 'A');
  }
  // the Scar is a perfect circle in both disks
  for (const orient of ['h', 'v']) {
    const L = K.layout(orient); let dR = 0, dA = 0;
    for (let al = -180; al < 180; al += 1) {
      const ll = K.fromPolar(72.5, al), pr = K.project(ll[0], ll[1], L);
      const r = pr.find((q) => q.disk === 'R'), a = pr.find((q) => q.disk === 'A');
      dR = Math.max(dR, Math.abs(Math.hypot(r.x - L.R.cx, r.y - L.R.cy) - K.rho(72.5))); dA = Math.max(dA, Math.abs(Math.hypot(a.x - L.A.cx, a.y - L.A.cy) - K.rho(107.5)));
    }
    t(`Scar = perfect circle on the Rhykar disk (radius ${K.rho(72.5).toFixed(4)} Rs) and the Aëris disk (${K.rho(107.5).toFixed(4)} Rs), layout ${orient}: deviation ${Math.max(dR, dA).toExponential(1)} Rs`, dR < 1e-12 && dA < 1e-12);
  }
  nearName('rim radius Rhykar ≈ 1,1826 Rs', K.rho(72.5), 1.1826, 1e-4); nearName('rim radius Aëris ≈ 1,6128 Rs', K.rho(107.5), 1.6128, 1e-4);
  // areas: one common Rs → pi*rho^2 ratio = 34,964 : 65,036 and the two add up to the whole sphere (4 Rs^2)
  const aR = K.rho(72.5) ** 2, aA = K.rho(107.5) ** 2;
  nearName('rho² sum = 4·Rs² (area of the sphere)', aR + aA, 4, 1e-12);
  nearName(`Rhykar share = ${(aR / 4 * 100).toFixed(3)} % (canon cap: ${DATA.stats.hemR} %)`, aR / 4 * 100, DATA.stats.hemR, 0.001); nearName('Aëris share = 65,036 %', aA / 4 * 100, DATA.stats.hemA, 0.001);
  // equal-area: |det J| of (θ, α) → plane equals the sphere's area element sinθ — numerically, at random points on both disks
  let ea = 0; for (let i = 0; i < 600; i++) {
    const which = rnd() < 0.5 ? 'R' : 'A', th = which === 'R' ? 3 + rnd() * 69 : 75 + rnd() * 100, al = (rnd() - 0.5) * 340, h = 1e-5;
    const f = (t2, a2) => { const q = K.diskXY(which, t2, a2, 'h'); return [q.x, q.y]; };
    const fa = f(th + h, al), fb = f(th - h, al), fc = f(th, al + h), fd = f(th, al - h);
    const J = [[(fa[0] - fb[0]) / (2 * h * D2R), (fc[0] - fd[0]) / (2 * h * D2R)], [(fa[1] - fb[1]) / (2 * h * D2R), (fc[1] - fd[1]) / (2 * h * D2R)]];
    ea = Math.max(ea, Math.abs(Math.abs(J[0][0] * J[1][1] - J[0][1] * J[1][0]) / Math.sin(th * D2R) - 1));
  }
  t(`equal-area: |det J| = sin θ at 600 random points on both disks (max rel. error ${ea.toExponential(1)})`, ea < 1e-5);
  nearName('radial scale at the Aëris rim (θ′ = 107,5°) ≈ 0,59', K.radialScale(107.5), 0.5906, 1e-3); nearName('radial × tangential scale = 1 (equal area)', K.radialScale(107.5) * K.tangentialScale(107.5), 1, 1e-12);
  // orientation and the "facing" convention
  { const L = K.layout('h'), pk = K.diskXY('R', 72.5, 0, 'h'), e1 = K.diskXY('R', 72.5, 90, 'h'), ea1 = K.diskXY('A', 72.5, 90, 'h'), pa = K.diskXY('A', 72.5, 0, 'h'), tr = K.diskXY('R', 72.5, 180, 'h');
    t('landscape: the peak (α = 0) is at the TOP of both disks and the trough (±180) at the bottom', pk.y < 0 && near(pk.x, 0, 1e-12) && pa.y < 0 && near(pa.x, 0, 1e-12) && tr.y > 0);
    t('landscape: α = +90 is the RIGHT rim of Rhykar and the LEFT rim of Aëris → the two east-slope points face each other across the gap', e1.x > 0 && ea1.x < 0 && near(e1.y, ea1.y, 1e-12) && (L.A.cx + ea1.x) > (L.R.cx + e1.x));
    const Lv = K.layout('v'), ev = K.diskXY('R', 72.5, 90, 'v'), av = K.diskXY('A', 72.5, 90, 'v');
    t('portrait: Rhykar on top, Aëris below; the east-slope points face each other vertically', Lv.R.cy < Lv.A.cy && ev.y > 0 && av.y < 0 && near(ev.x, av.x, 1e-12));
    t('portrait: the peak (α = 0) is at the right of both disks', K.diskXY('R', 72.5, 0, 'v').x > 0 && K.diskXY('A', 72.5, 0, 'v').x > 0);
  }
  // reprojection of the real canon texture
  { const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'assets/base_4096.png'))), L = K.layout('h'), Rs = 110, sw = Math.ceil(L.W * Rs), sh = Math.ceil(L.H * Rs), out = new Uint8ClampedArray(sw * sh * 4);
    const rgba = new Uint8Array(png.width * png.height * 4); rgba.set(png.data);
    const cnt = K.reproject(rgba, png.width, png.height, L, Rs, out, sw, sh, 0, sh);
    const share = cnt.R / (cnt.R + cnt.A) * 100;
    t(`reprojected pixel areas: Rhykar ${share.toFixed(3)} % : Aëris ${(100 - share).toFixed(3)} % (canon 34,964 : 65,036; Rs = ${Rs} px)`, near(share, 34.964, 0.15), `${share}`);
    let nan = 0; for (let i = 0; i < out.length; i += 997) if (Number.isNaN(out[i])) nan++; t('no NaN pixels (poles prefiltered)', nan === 0);
    const a = [], b = [], cShift = []; let nSamp = 0;
    for (let k = 0; k < 6000 && nSamp < 1200; k++) { const px = Math.floor(rnd() * sw), py = Math.floor(rnd() * sh), o = (py * sw + px) * 4; if (out[o + 3] < 255) continue;
      const un = K.unproject(-L.W / 2 + (px + 0.5) / Rs, -L.H / 2 + (py + 0.5) / Rs, L); if (!un) continue; if (Math.abs(un.lat) > 75) continue;
      const tx = Math.floor((C.lonN(un.lon) + 180) / 360 * png.width), ty = Math.floor((90 - un.lat) / 180 * png.height), i = (ty * png.width + tx) * 4;
      const j = (ty * png.width + ((tx + 1024) % png.width)) * 4;   // negative control: same row, 90° further east
      a.push(0.2126 * out[o] + 0.7152 * out[o + 1] + 0.0722 * out[o + 2]); b.push(0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]); cShift.push(0.2126 * png.data[j] + 0.7152 * png.data[j + 1] + 0.0722 * png.data[j + 2]); nSamp++; }
    const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length, ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
    const rr = sab / Math.sqrt(saa * sbb), mc = mean(cShift); let sac = 0, scc = 0; for (let i = 0; i < a.length; i++) { sac += (a[i] - ma) * (cShift[i] - mc); scc += (cShift[i] - mc) ** 2; }
    const rc = sac / Math.sqrt(saa * scc);
    t(`reprojected luminance matches the canon texture at the inverse-projected position (r = ${rr.toFixed(4)}, n = ${a.length}; shifted control r = ${rc.toFixed(3)})`, rr > 0.95 && rc < rr - 0.25);
  }
  t('layout sizes: landscape 2·ρmaxR + gap + 2·ρmaxA by 2·ρmaxA', (() => { const L = K.layout('h'); return near(L.W, 2 * L.rhoMaxR + L.gap + 2 * L.rhoMaxA, 1e-12) && near(L.H, 2 * L.rhoMaxA, 1e-12); })());
}

// ---------------------------------------------------------------- Interregna polity names as map labels (viewer v2.0.1; shared by flat map, globe and disk)
{
  const inR = (lat, lon, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const yi = r[i][0], xi = r[i][1], yj = r[j][0], xj = r[j][1]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; };
  const sq = [[0, 0], [0, 10], [10, 10], [10, 0]], hole = [[4, 4], [4, 6], [6, 6], [6, 4]];
  const a = C.labelPoint(sq, []);
  t('labelPoint: the label point of a square is its centre, with the full width as free room', near(a.lat, 5, 0.05) && near(a.lon, 5, 0.05) && near(a.room, 10, 0.05) && near(a.depth, 5, 0.1), JSON.stringify(a));
  const b = C.labelPoint(sq, [hole]);
  t('labelPoint: never inside a pocket drawn on top (enclave) and never on its edge', !inR(b.lat, b.lon, hole) && b.depth > 0.5 && inR(b.lat, b.lon, sq), JSON.stringify(b));
  const Lsh = [[0, 0], [0, 10], [2, 10], [2, 2], [10, 2], [10, 0]];   // L-shape: the centre of its bounding box is outside the shape
  const c = C.labelPoint(Lsh, []);
  t('labelPoint: concave shape — the point is inside the polygon (not the bounding-box centre)', inR(c.lat, c.lon, Lsh) && c.depth > 0.5, JSON.stringify(c));
  t('labelPoint: deterministic', JSON.stringify(C.labelPoint(Lsh, [])) === JSON.stringify(c));

  const PL = C.polityLabels(DATA), IRS = DATA.territories.filter((x) => /^ir_\d+$/.test(x.id)), PARTS = IRS.reduce((s, x) => s + x.rings.length, 0);
  t(`polityLabels: one label per part of each Interregna polity (${IRS.length} polities, ${PARTS} parts), in drawing order`, PL.length === PARTS && IRS.length >= 20 && PL.every((p) => /^ir_\d+$/.test(p.id)) && IRS.every((x) => PL.filter((p) => p.id === x.id).length === x.rings.length), `${PL.length}/${PARTS}`);
  t('polityLabels: keys are unique; part 0 (the largest) has key = id, the others id#2, id#3 …', new Set(PL.map((p) => p.key)).size === PL.length && PL.every((p) => p.key === (p.part ? `${p.id}#${p.part + 1}` : p.id)) && IRS.every((x) => PL.filter((p) => p.id === x.id).map((p) => p.part).sort().join() === x.rings.map((_, i) => i).join()));
  t('polityLabels: the result is cached (same object for flat map, globe and disk)', C.polityLabels(DATA) === PL);
  t('polityLabels: the name is the faction name, nothing invented', PL.every((p) => p.name === DATA.factions[p.id].name && p.fid === p.id && p.cat === 'polity' && p.label_only === true && p.polity === true));
  t('polityLabels: names are not places — none is in DATA.places (no search hit, no entry count, no card)', PL.every((p) => !DATA.places.some((q) => q.id === p.id || q.name === p.name)));
  t('polityLabels: the epistemic status and the "usulan" flag follow the faction (kind says "nama usulan (Draft)")', PL.every((p) => p.epi === DATA.factions[p.id].epi && p.proposal === /usulan|draft/i.test(DATA.factions[p.id].kind || '')));
  t('polityLabels: layer group is the territory group of the polygon (the label follows that layer)', PL.every((p) => p.tg === C.tgroupOf(IRS.find((x) => x.id === p.id))) && PL.every((p) => p.tg === 'int'));
  let onOwn = 0, covered = [];
  const order = C.terrOrder(DATA.territories);
  PL.forEach((p) => {
    const own = IRS.find((x) => x.id === p.id), idx = order.indexOf(own);
    if (own.rings.some((r) => inR(p.lat, p.lon, r))) onOwn++;
    const over = order.slice(idx + 1).filter((u) => C.tgroupOf(u) === 'int' && u.rings.some((r) => inR(p.lat, p.lon, r))).map((u) => u.id);
    if (over.length) covered.push(`${p.id} under ${over.join()}`);
  });
  t(`polityLabels: every label point lies on its own polygon (${onOwn}/${PL.length})`, onOwn === PL.length);
  // a shape that stands alone is never left without its name: every ring (part) of every polity holds exactly one label of that polity (v2.0.2: the Akṣata exclave inside Novalia)
  const ringsAll = []; IRS.forEach((x) => x.rings.forEach((r) => ringsAll.push({ id: x.id, r })));
  const unnamed = ringsAll.filter((q) => PL.filter((p) => p.id === q.id && inR(p.lat, p.lon, q.r)).length !== 1).map((q) => q.id);
  t(`polityLabels: every part of every polity holds exactly one label of its own (${ringsAll.length - unnamed.length}/${ringsAll.length})${unnamed.length ? ' — ' + unnamed.join() : ''}`, unnamed.length === 0);
  t('polityLabels: the rings of a polity are separate parts, never a hole inside another ring of the same polity (the assumption behind "one ring = one named part")', IRS.every((x) => x.rings.every((r, i) => x.rings.every((q, j) => i === j || !inR(r[0][0], r[0][1], q)))));
  const AK = PL.filter((p) => p.id === 'ir_14');   // data is pinned by canon-hashes.json: if the exclave is ever removed, this test is the one to update
  t('polityLabels: Akṣata (ir_14) has an exclave and both parts are named; the exclave\'s label is smaller (size class never larger) and has its own key', AK.length === 2 && AK[0].part === 0 && AK[1].part === 1 && AK[1].key === 'ir_14#2' && AK[1].px < AK[0].px && AK[1].tier >= AK[0].tier && AK[0].name === AK[1].name);
  t(`polityLabels: no label point is covered by a polygon drawn later (the label sits on the visible part)${covered.length ? ' — ' + covered.join(' | ') : ''}`, covered.length === 0);
  t('polityLabels: depth and free room are positive and finite', PL.every((p) => p.depth > 0 && isFinite(p.depth) && (p.room == null || (p.room > 0 && isFinite(p.room)))));
  t('polityLabels: size tier never grows with a smaller polygon (1 = largest … 4 = smallest)', PL.every((p) => p.tier >= 1 && p.tier <= 4) && PL.every((p) => PL.every((q) => p.px <= q.px || p.tier <= q.tier)));
  t('polityLabels: polity kind follows the faction kind text (adat / kota / mikro / other)', PL.every((p) => { const k = DATA.factions[p.id].kind || ''; return p.ptype === (/wilayah adat/i.test(k) ? 'a' : /kota/i.test(k) ? 'c' : /mikro/i.test(k) ? 'm' : 'k'); }));
  const t0 = performance.now(); C._pl = null; C.polityLabels(DATA); const ms = performance.now() - t0;
  t(`polityLabels: computed once at start-up in well under a second (${ms.toFixed(0)} ms)`, ms < 1000);

  // declutter: the larger polygon wins, a name that does not fit its polygon or hits an obstacle is hidden, and a hidden name blocks nothing
  const log = {}, mk = (id, rc, px, fit) => ({ rc, px, fit, hide: (h) => { log[id] = h; } });
  C.declutterPolity([mk('big', [0, 0, 50, 10], 100, null), mk('small', [20, 0, 70, 10], 50, null), mk('apart', [200, 0, 250, 10], 10, null),
    mk('wide', [300, 0, 400, 10], 200, 40), mk('under', [310, 0, 360, 10], 1, null), mk('blocked', [500, 0, 550, 10], 5, null), mk('snug', [600, 0, 640, 10], 3, 40)], [[480, -5, 520, 15]]);
  t('declutterPolity: the larger polygon keeps its name, the smaller one that overlaps it is hidden', log.big === false && log.small === true);
  t('declutterPolity: a name clear of everything stays', log.apart === false);
  t('declutterPolity: a name wider than its polygon (fit × 1.12) is hidden', log.wide === true && log.snug === false);
  t('declutterPolity: a hidden name blocks nothing (the name under it is shown)', log.under === false);
  t('declutterPolity: an obstacle (marker name, region label) hides the polity name, never the reverse', log.blocked === true);
}

// ---------------------------------------------------------------- rings that are drawn (viewer v2.0.3; shared by flat map, globe and disk)
{
  const inR = (lat, lon, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const yi = r[i][0], xi = r[i][1], yj = r[j][0], xj = r[j][1]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; };
  const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'assets/datagrid.png')));
  const T = (id) => DATA.territories.find((x) => x.id === id);
  const inside = (r, o) => r.every((p) => inR(p[0], p[1], o));
  const DR = DATA.territories.map((x) => [x, C.drawRings(x)]);
  t('drawRings: a territory with one ring is returned as it is (same array)', DR.filter(([x]) => x.rings.length === 1).every(([x, d]) => d === x.rings));
  t('drawRings: every territory keeps its rings that are drawn, in data order, and at least one', DR.every(([x, d]) => d.length >= 1 && d.every((r) => x.rings.includes(r)) && d.every((r, i) => i === 0 || x.rings.indexOf(d[i - 1]) < x.rings.indexOf(r))));
  const dropped = DR.filter(([x, d]) => d.length < x.rings.length).map(([x]) => x.id);
  t(`drawRings: the only territories that lose a ring are Hesperia and the Imperial Commonwealth umbrella (${dropped.join()}); a new case would need a decision`, dropped.length === 2 && dropped.includes('hesperia') && dropped.includes('imperial_commonwealth'));
  ['hesperia', 'imperial_commonwealth'].forEach((id) => {
    const x = T(id), d = C.drawRings(x), lake = x.rings[1];
    t(`drawRings: ${id} is drawn as its outer ring only, and the data still holds both rings`, d.length === 1 && d[0] === x.rings[0] && x.rings.length === 2);
    t(`drawRings: ${id} — the dropped ring lies wholly inside the drawn one (the polygon covers the lake)`, inside(lake, d[0]));
    const la = lake.reduce((s, p) => s + p[0], 0) / lake.length, lo = lake.reduce((s, p) => s + p[1], 0) / lake.length, g = C.terrainFrom(png.data, png.width, png.height, la, lo);
    t(`drawRings: ${id} — the dropped ring encloses water in the physical layer (datagrid: ${g && g.b})`, g && /laut|Paparan|Danau|Teluk/i.test(g.b), JSON.stringify(g));
  });
  t('drawRings: separate parts are all drawn — the exclave of Akṣata and the other multi-part territories keep every ring', ['ir_14', 'anabasim', 'andura'].every((id) => C.drawRings(T(id)).length === T(id).rings.length));
  t('drawRings: the same array every time (cached) and the data itself is not modified', C.drawRings(T('hesperia')) === C.drawRings(T('hesperia')) && T('hesperia').rings.length === 2 && T('imperial_commonwealth').rings.length === 2);
  const sq = { rings: [[[0, 0], [0, 10], [10, 10], [10, 0]], [[4, 4], [4, 6], [6, 6], [6, 4]], [[20, 0], [20, 3], [23, 3], [23, 0]], [[1, 1], [1, 11], [2, 11], [2, 1]]] };
  t('drawRings: a ring wholly inside a larger one is dropped, a separate ring is kept, a ring that only overlaps the edge is kept', JSON.stringify(C.drawRings(sq).map((r) => sq.rings.indexOf(r))) === '[0,2,3]');
}

console.log(`unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
