/* Master Map Rhykaris — modul bersama (v1.5): matematika bola, geometri Scar, pembaca datagrid, label epistemik,
   util state dan pemuat three.js. Dipakai tampilan 2D (Leaflet) dan 3D (globe) — satu sumber, tanpa duplikasi.
   Modul ini murni (tanpa akses DOM saat dimuat) supaya bisa diuji di Node; bagian yang menyentuh DOM ada di fungsi tersendiri. */
(function (root) {
'use strict';
var RH = root.RH = root.RH || {};
var C = RH.core = {};

var D2R = Math.PI / 180, R2D = 180 / Math.PI;
C.D2R = D2R; C.R2D = R2D;
// Geometri The Scar (kanon, Planetary Form): small circle berpusat -55,5° / 0°, radius sudut 72,5°, setengah lebar pita 6,5°.
C.SC = { lat: -55.5, lon: 0, r: 72.5, half: 6.5 };
C.cfg = { R_KM: 8282, KM_DEG: 2 * Math.PI * 8282 / 360, TH: { within: 6.5, adjacent: 19.5, peripheral: 32.5 }, AUR: -8.31 };
/** Terapkan angka planet / ambang dari data.json (radius_km, thresholds, aurelia_lon). */
C.configure = function (stats, th) {
  if (stats) { C.cfg.R_KM = stats.radius_km; C.cfg.KM_DEG = 2 * Math.PI * stats.radius_km / 360; if (stats.aurelia_lon != null) C.cfg.AUR = stats.aurelia_lon; }
  if (th) C.cfg.TH = th;
  return C.cfg;
};

// ------------------------------------------------------------------ tebal garis data (batas teritori, rute, front, panah)
/* Satu aturan untuk peta datar, globe dan cakram. Garis dibuat tipis dan MENGECIL saat zoom masuk, supaya lebarnya di lapangan
   tetap kecil dibanding wilayah yang digambarnya (di zoom 3 satu piksel ≈ 18 km; di zoom 6,5 ≈ 1,6 km). `z` = zoom setara peta datar. */
C.LINE = { terr: 1.1, terrHot: 2.0, under: 1.8, front: 1.7, florian: 2.0, shaft: 1.7, shaftFlorian: 1.4, arrow: 0.85 };
C.LINE_MIN = 0.7;   // piksel layar: di bawah ini garis putus-putus nyaris tak terlihat
C.lineK = function (z) { return Math.max(0.45, Math.min(1.15, Math.pow(0.82, z - 3))); };
C.lineW = function (base, z) { return Math.max(C.LINE_MIN, base * C.lineK(z)); };
C.arrowK = function (z) { return Math.max(0.6, C.lineK(z)) * C.LINE.arrow; };

// ------------------------------------------------------------------ state (localStorage dengan prefiks rh-, selalu try/catch)
C.LS = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

// ------------------------------------------------------------------ format (UI berbahasa Indonesia)
C.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
C.fmt = function (n, d) { return Number(n).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }); };
C.fint = function (n) { return Math.round(n).toLocaleString('id-ID'); };
C.lonN = function (l) { return ((l + 180) % 360 + 360) % 360 - 180; };
C.fLat = function (a) { return C.fmt(Math.abs(a), 2) + '° ' + (a >= 0 ? 'LU' : 'LS'); };
C.fLon = function (o) { o = C.lonN(o); if (Math.abs(o) < 0.005) return '0,00°'; if (180 - Math.abs(o) < 0.005) return '180,00°'; return C.fmt(Math.abs(o), 2) + '° ' + (o >= 0 ? 'BT' : 'BB'); };
C.norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };

// ------------------------------------------------------------------ label epistemik (Kanon / Turunan / Inferensi AI / Terbuka)
C.EPI = { kanon: 'Kanon', turunan: 'Turunan', inferensi: 'Inferensi AI', terbuka: 'Terbuka' };
C.RING = { kanon: ['#e8c66c', ''], turunan: ['#8fd3dc', ''], inferensi: ['#f2b25a', '2.6 1.8'], terbuka: ['#ff7a45', '1 1.6'] };
C.chip = function (epi, conf) { return '<span class="epi ' + epi + '">' + (C.EPI[epi] || epi) + (conf ? ' · ' + conf : '') + '</span>'; };

// ------------------------------------------------------------------ matematika bola (derajat; lat/lon geografis, bujur timur positif)
C.vec = function (lat, lon) { var la = lat * D2R, lo = lon * D2R; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; };
C.fromVec = function (v) { var n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return { lat: Math.asin(Math.max(-1, Math.min(1, v[2] / n))) * R2D, lon: Math.atan2(v[1], v[0]) * R2D }; };
/** Jarak sudut great-circle (derajat), stabil untuk jarak kecil maupun mendekati antipode. */
C.angDist = function (lat1, lon1, lat2, lon2) {
  var a = C.vec(lat1, lon1), b = C.vec(lat2, lon2);
  var cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
  return Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * R2D;
};
/** Azimut awal great-circle dari titik 1 ke titik 2: derajat searah jarum jam dari utara, 0..360. */
C.bearing = function (lat1, lon1, lat2, lon2) {
  var p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  var y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * R2D + 360) % 360;
};
/** Titik tujuan dari (lat, lon) menempuh dist derajat busur ke azimut brg → [lat, lon]. */
C.destination = function (lat, lon, brg, dist) {
  var p1 = lat * D2R, l1 = lon * D2R, b = brg * D2R, d = dist * D2R;
  var p2 = Math.asin(Math.max(-1, Math.min(1, Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b))));
  var l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 * R2D, C.lonN(l2 * R2D)];
};

// ------------------------------------------------------------------ geometri The Scar
/** d = jarak sudut ke pusat − 72,5°; d < 0 sisi Rhykar, d > 0 sisi Aëris. (Rumus asli viewer v1.4.) */
C.scarD = function (lat, lon) {
  var SC = C.SC, la = lat * D2R, lo = lon * D2R, c = SC.lat * D2R;
  var x = Math.sin(la) * Math.sin(c) + Math.cos(la) * Math.cos(c) * Math.cos(lo);
  return Math.acos(Math.max(-1, Math.min(1, x))) * R2D - SC.r;
};
C.prox = function (d) { var TH = C.cfg.TH, a = Math.abs(d); return a <= TH.within ? 'Within Scar' : a <= TH.adjacent ? 'Adjacent' : a <= TH.peripheral ? 'Peripheral' : 'Unaffected'; };
C.PROX_ID = { 'Within Scar': 'di dalam pita', 'Adjacent': 'Adjacent', 'Peripheral': 'Peripheral', 'Unaffected': 'Unaffected' };
/** Titik pada small circle berjarak r dari pusat Scar, azimut alpha (0 = puncak +17° di bujur 0°, +90 = lereng timur, ±180 = palung). */
C.circlePt = function (alpha, r) {
  var SC = C.SC, a = alpha * D2R, rr = r * D2R, la1 = SC.lat * D2R;
  var lat = Math.asin(Math.sin(la1) * Math.cos(rr) + Math.cos(la1) * Math.sin(rr) * Math.cos(a));
  var lon = Math.atan2(Math.sin(a) * Math.sin(rr) * Math.cos(la1), Math.cos(rr) - Math.sin(la1) * Math.sin(lat));
  return [lat * R2D, lon * R2D];
};
C.arcPts = function (a0, a1, r, step) { var out = [], s = step || 0.5, n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / s)); for (var i = 0; i <= n; i++) out.push(C.circlePt(a0 + (a1 - a0) * i / n, r)); return out; };
C.shift = function shift(ll, dx) { if (typeof ll[0] === 'number') return [ll[0], ll[1] + dx]; return ll.map(function (x) { return shift(x, dx); }); };

/**
 * Kompas Scar untuk satu titik: azimut ke TITIK TERDEKAT pada kurva small circle, jarak ke kurva, cincin proximity, sisi hemisfer.
 *  - jarak sudut ke pusat Scar c; d = c − 72,5.
 *  - di dalam lingkaran (c < 72,5°): titik terdekat ada di arah berlawanan dari pusat → azimut ke pusat + 180°.
 *  - di luar lingkaran (c > 72,5°): ke arah pusat.
 *  - titik tepat di pusat (c = 0) atau di antipode (c = 180°): arah tidak terdefinisi → singular.
 */
C.scarCompass = function (lat, lon) {
  var SC = C.SC, c = C.angDist(lat, lon, SC.lat, SC.lon), d = C.scarD(lat, lon);
  var singular = c < 1e-6 || c > 180 - 1e-6;
  var out = { singular: singular, centerDeg: c, d: d, distDeg: Math.abs(d), distKm: Math.abs(d) * C.cfg.KM_DEG, ring: C.prox(d), side: d < 0 ? 'Rhykar' : 'Aëris', bearing: null, nearest: null };
  if (singular) return out;
  var toC = C.bearing(lat, lon, SC.lat, SC.lon);
  out.bearing = d < 0 ? (toC + 180) % 360 : toC;
  out.nearest = C.destination(lat, lon, out.bearing, Math.abs(d));
  return out;
};
var CARD8 = ['utara', 'timur laut', 'timur', 'tenggara', 'selatan', 'barat daya', 'barat', 'barat laut'];
C.cardinal = function (brg) { return CARD8[Math.round((((brg % 360) + 360) % 360) / 45) % 8]; };
/** Arah di layar peta datar (equirectangular) untuk geodesik yang berangkat ke azimut brg: derajat searah jarum jam dari atas layar. */
C.screenDir2D = function (lat, brg) { var b = brg * D2R; return Math.atan2(Math.sin(b) / Math.max(Math.cos(lat * D2R), 0.02), Math.cos(b)) * R2D; };

// ------------------------------------------------------------------ datagrid (1024 × 512 RGB: R = kode elevasi, G = kelas bioma)
C.BIOME = { 0: 'Samudra dalam', 1: 'Paparan / laut dangkal', 2: 'Teluk dangkal', 3: 'Laut-es', 4: 'Palung Sutura', 10: 'Gurun besi Rhykar', 11: 'Semi-gurun Rhykar', 12: 'Stepa oker', 13: 'Sabuk moderat (lahan agraris)',
  14: 'Hutan konifer Rhykar', 15: 'Altiplano basal', 16: 'Gurun kutub beku', 17: 'Pegunungan tinggi Rhykar', 18: 'Playa garam', 19: 'Danau', 20: 'Hutan hujan / megaflora Aëris', 21: 'Hutan Aëris', 22: 'Hutan terbuka Aëris',
  23: 'Dataran tinggi Aëris', 24: 'Alpin & salju Aëris', 25: 'Tundra Aëris', 26: 'Hutan lembap Rhykar' };
/** Elevasi/bioma dari RGBA grid. Laut: code < 100 → kedalaman = −code × 101 m; darat: code ≥ 100 → (code − 100) × 60 m. */
C.terrainFrom = function (data, GW, GH, lat, lon) {
  if (!data) return null;
  var x = Math.floor((C.lonN(lon) + 180) / 360 * GW), y = Math.floor((90 - lat) / 180 * GH);
  if (x < 0 || y < 0 || x >= GW || y >= GH) return null;
  var i = (y * GW + x) * 4, code = data[i], b = data[i + 1];
  return { el: code < 100 ? -code * 101 : (code - 100) * 60, b: C.BIOME[b] || '—' };
};
/** Pembaca datagrid dari data-URI/URL gambar (DOM). Mengembalikan {at(lat, lon), ready}. */
C.createTerrain = function (src) {
  var t = { ready: false, data: null, w: 0, h: 0 };
  var img = new Image();
  img.onload = function () { try { var c = document.createElement('canvas'); t.w = c.width = img.width; t.h = c.height = img.height; var cx = c.getContext('2d'); cx.drawImage(img, 0, 0); t.data = cx.getImageData(0, 0, t.w, t.h).data; t.ready = true; } catch (e) { t.data = null; } };
  img.src = src;
  t.at = function (lat, lon) { return C.terrainFrom(t.data, t.w, t.h, lat, lon); };
  return t;
};

// ------------------------------------------------------------------ anti-tabrakan nama marker (dipakai globe 3D dan peta kerja)
/**
 * Ikon marker selalu tampil; nama marker ditempatkan kanan/kiri menurut prioritas (ibukota > kota > pelabuhan > lainnya, lalu kanon > turunan > inferensi)
 * dan disembunyikan bila kedua sisi bertabrakan. items: [{sx, sy, size, nm (elemen nama), p (place), ref?}], obst: [[x0, y0, x1, y1, pemilik]].
 * DEC = {PRI, EPR, LBL_SIDE} dari app.js. Sama dengan algoritma declutter peta datar.
 */
C.declutterNames = function (items, obst, DEC) {
  function overlap(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
  items.sort(function (a, b) { var pa = DEC.PRI[a.p.cat] != null ? DEC.PRI[a.p.cat] : 4, pb = DEC.PRI[b.p.cat] != null ? DEC.PRI[b.p.cat] : 4; return (pa - pb) || ((DEC.EPR[a.p.epi] || 0) - (DEC.EPR[b.p.epi] || 0)); });
  var placed = [];
  items.forEach(function (it) {
    var w = it.nm.offsetWidth, h = it.nm.offsetHeight; if (!w) return;
    var x = it.sx, y = it.sy, s2 = it.size / 2, self = it.ref || it;
    var R = [x + s2 + 1, y - h / 2 + 1, x + s2 + 3 + w, y + h / 2 - 1], Lf = [x - s2 - 3 - w, y - h / 2 + 1, x - s2 - 1, y + h / 2 - 1];
    var cand = DEC.LBL_SIDE[it.p.id] === 'l' ? [['l', Lf], ['r', R]] : [['r', R], ['l', Lf]], ok = null;
    for (var i = 0; i < cand.length && !ok; i++) {
      var rc = cand[i][1], hit = false;
      for (var j = 0; j < obst.length && !hit; j++) if (obst[j][4] !== self && overlap(rc, obst[j])) hit = true;
      for (var k = 0; k < placed.length && !hit; k++) if (overlap(rc, placed[k])) hit = true;
      if (!hit) ok = cand[i];
    }
    if (ok) { placed.push(ok[1]); it.nm.classList.toggle('l', ok[0] === 'l'); } else it.nm.classList.add('hide');
  });
};

// ------------------------------------------------------------------ three.js (dimuat malas, hanya saat pengguna masuk 3D)
// Versi di-pin ke r160 (build ES module satu berkas, self-contained). Urutan: CDN berantai lalu salinan lokal (vendor/three).
// Setiap sumber diverifikasi dengan SRI (fetch + integrity → blob → import()); sumber yang gagal/mismatch dilewati.
C.THREE_VERSION = '0.160.0';
C.THREE_SRI = 'sha384-__THREE_SRI__';
C.threeSources = function (base) {
  var v = C.THREE_VERSION;
  return [
    'https://cdn.jsdelivr.net/npm/three@' + v + '/build/three.module.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r' + v.split('.')[1] + '/three.module.min.js',
    'https://unpkg.com/three@' + v + '/build/three.module.min.js',
    new URL('vendor/three/three.module.min.js', base || (typeof document !== 'undefined' ? document.baseURI : 'http://localhost/')).href
  ];
};
var threeP = null;
C.loadThree = function () {
  if (threeP) return threeP;
  var srcs = C.threeSources(), errs = [];
  function tryAt(i) {
    if (i >= srcs.length) return Promise.reject(new Error('three.js gagal dimuat dari semua sumber (' + errs.join('; ') + ')'));
    var opts = { mode: 'cors', credentials: 'omit', cache: 'default' };
    if (C.THREE_SRI.indexOf('__') < 0) opts.integrity = C.THREE_SRI;
    return fetch(srcs[i], opts).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then(function (b) { var u = URL.createObjectURL(b); return import(u).then(function (ns) { URL.revokeObjectURL(u); return ns; }); })
      .catch(function (e) { errs.push(srcs[i].replace(/^https?:\/\//, '').split('/')[0] + ': ' + (e && e.message || e)); return tryAt(i + 1); });
  }
  threeP = tryAt(0).catch(function (e) { threeP = null; throw e; });
  return threeP;
};
/** WebGL tersedia? (cek murah sebelum mengunduh three.js) */
C.hasWebGL = function () {
  try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; }
};
})(typeof window !== 'undefined' ? window : globalThis);
