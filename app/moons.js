/* Master Map Rhykaris — dua bulan: orbit Kepler, kompresi jarak, nilai turunan. Murni (tanpa DOM, tanpa three.js).
   Satu-satunya sumber parameter: data/moons.json (semuanya Inferensi AI, bukan kanon).

   Kerangka planet-ekuatorial (P): x → (lat 0°, bujur 0°), y → (lat 0°, bujur 90° BT), z → kutub utara rotasi.
   Bidang orbit planet digambar sejajar ekuator (ilustratif — kemiringan sumbu belum ditetapkan, Terbuka #2).
   Kerangka adegan three.js (S) = (y_P, z_P, x_P): bujur 0° menghadap kamera (+Z), timur ke kanan (+X), utara ke atas (+Y). */
(function (root) {
'use strict';
var RH = root.RH = root.RH || {};
var M = RH.moons = {};
var D2R = Math.PI / 180;

M.data = null;
/** Daftarkan isi data/moons.json. Menghitung konstanta kompresi jarak dan mengembalikan modul. */
M.configure = function (data) {
  M.data = data;
  var ms = data.moons.slice().sort(function (a, b) { return a.semi_major_axis_rel - b.semi_major_axis_rel; });
  var near = ms[0], far = ms[ms.length - 1];
  // Kompresi jarak "tidak berskala": s(a) = K·a^p, monoton naik → urutan orbit terjaga. Jangkar tampilan: bulan dalam → 2,2 jari-jari planet,
  // bulan luar → 3,4. Hanya sumbu semi-mayor yang dikompres; bentuk elips (e) dan kemiringan (i) dipakai apa adanya.
  M.display = { near: 2.2, far: 3.4 };
  M.p = Math.log(M.display.far / M.display.near) / Math.log(far.semi_major_axis_rel / near.semi_major_axis_rel);
  M.K = M.display.near / Math.pow(near.semi_major_axis_rel, M.p);
  return M;
};
/** Sumbu semi-mayor tampilan (satuan jari-jari planet) untuk a (satuan jari-jari planet). */
M.compress = function (aRel) { return M.K * Math.pow(aRel, M.p); };
M.byId = function (id) { return M.data.moons.filter(function (m) { return m.id === id; })[0]; };

/** Persamaan Kepler E − e·sin E = Mean anomaly (radian), Newton–Raphson; konvergen untuk 0 ≤ e < 1. */
M.kepler = function (Man, e) {
  var Mn = ((Man % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  var E = e < 0.8 ? Mn : Math.PI;
  for (var i = 0; i < 30; i++) { var f = E - e * Math.sin(E) - Mn, d = f / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-13) break; }
  return E;
};
function illus(kind, id) { var o = M.data.illustrative; return (o[kind] && o[kind][id] != null ? o[kind][id] : 0) * D2R; }
/** Matriks rotasi bidang orbit → kerangka P: Rz(Ω) · Rx(i) · Rz(ω). */
M.orbitFrame = function (m, incDeg) {
  var O = illus('ascending_node_deg', m.id), w = illus('arg_periapsis_deg', m.id), inc = (incDeg != null ? incDeg : m.inclination_deg) * D2R;
  var cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc), cw = Math.cos(w), sw = Math.sin(w);
  return [[cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci, sO * si],
          [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci, -cO * si],
          [sw * si, cw * si, ci]];
};
function mulv(R, v) { return [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]]; }
/** Periode orbit (hari-Rhykaris). */
M.period = function (m) { return m.period_days_rhykaris; };
M.meanAnomaly = function (m, tDays) { return illus('mean_anomaly_deg_t0', m.id) + 2 * Math.PI * tDays / M.period(m); };
/** Posisi bulan di kerangka P dalam satuan jari-jari planet. scale = sumbu semi-mayor yang dipakai (nyata atau terkompresi). */
M.position = function (m, tDays, scaleA) {
  var a = scaleA != null ? scaleA : m.semi_major_axis_rel, e = m.eccentricity, E = M.kepler(M.meanAnomaly(m, tDays), e);
  var xo = a * (Math.cos(E) - e), yo = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return mulv(M.orbitFrame(m), [xo, yo, 0]);
};
/** Posisi di kerangka adegan three.js (S), sumbu semi-mayor terkompresi, jari-jari planet = 1. */
M.scenePosition = function (m, tDays) { var p = M.position(m, tDays, M.compress(m.semi_major_axis_rel)); return [p[1], p[2], p[0]]; };
/** Titik garis orbit (kerangka S, terkompresi) — n segmen, anomali eksentrik seragam. */
M.orbitPath = function (m, n, incDeg) {
  var a = M.compress(m.semi_major_axis_rel), e = m.eccentricity, F = M.orbitFrame(m, incDeg), out = [];
  for (var k = 0; k <= n; k++) { var E = 2 * Math.PI * k / n, p = mulv(F, [a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E), 0]); out.push([p[1], p[2], p[0]]); }
  return out;
};
M.sceneRadius = function (m) { return m.radius_rel; };   // ukuran relatif ke planet tetap ASLI (0,2415 dan 0,0604)

/** Nilai turunan untuk kartu info. Jarak nyata dari permukaan planet (pusat ke pusat dikurangi jari-jari planet tidak dipakai: sudut tampak memakai jarak pusat). */
M.derived = function (m) {
  var P = M.data.planet, dayRatio = P.day_hours / 24, a = m.semi_major_axis_km, e = m.eccentricity;
  function ang(d) { return 2 * Math.atan(m.radius_km / d) / D2R; }
  return {
    periodDaysR: m.period_days_rhykaris,
    periodDaysE: m.period_days_rhykaris * dayRatio,
    angMeanDeg: ang(a),
    angMinDeg: ang(a * (1 + e)),   // di apoapsis (e nominal) → tampak paling kecil
    angMaxDeg: ang(a * (1 - e)),   // di periapsis (e nominal) → tampak paling besar
    periapsisKm: a * (1 - e), apoapsisKm: a * (1 + e),
    aOverPlanetRadius: a / P.radius_km,
    keplerPeriodDaysE: keplerPeriodDaysEarth(a, P)
  };
};
// Pemeriksaan konsistensi: hukum Kepler III dengan GM planet dari g dan radius (g·R²) — hanya dipakai untuk uji, bukan klaim.
function keplerPeriodDaysEarth(aKm, P) { var GM = P.gravity_g * 9.80665 * Math.pow(P.radius_km * 1000, 2), a = aKm * 1000; return 2 * Math.PI * Math.sqrt(a * a * a / GM) / 86400; }
M.keplerPeriodDaysEarth = function (m) { return keplerPeriodDaysEarth(m.semi_major_axis_km, M.data.planet); };
M.periodRatio = function () { var ms = M.data.moons.slice().sort(function (a, b) { return a.semi_major_axis_rel - b.semi_major_axis_rel; }); return M.period(ms[ms.length - 1]) / M.period(ms[0]); };
})(typeof window !== 'undefined' ? window : globalThis);
