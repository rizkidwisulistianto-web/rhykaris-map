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

// ------------------------------------------------------------------ wilayah kuasa: kelompok layer, urutan gambar, gaya (v1.7)
/* SATU tabel untuk peta datar, globe 3D dan peta kerja dual-disk (satu data.json, tanpa salinan gaya per tampilan).
   Kelompok = satu layer di panel. C.TGROUPS berurutan dari BAWAH ke ATAS: zona persebaran Satvan, payung Imperial Commonwealth (v1.8: gabungan Hesperia + marka,
   digambar DI BAWAH keduanya supaya klik pada Hesperia atau marka tetap membuka kartu masing-masing), Hesperia (Paramount, wilayah langsung), kerajaan-kerajaan
   Commonwealth (sabuk marka), sabuk provinsi Hesperia (layer opsional di atas Hesperia), Foedera (klaim luas lalu inti), Interregna, Anabasim, Andurā, lainnya.
   Di dalam kelompok urutannya mengikuti data.json.
   Tanpa aturan ini tumpukan peta datar (urutan DOM) bergantung pada urutan layer dihidup-matikan dan bisa berbeda dari globe dan cakram. */
C.TGROUPS = ['sat', 'ic', 'hes', 'cw', 'hesb', 'foe', 'int', 'ana', 'elv', 'lain'];
C.TDEFAULT = { hesb: false };   // kelompok yang default mati (sabuk provinsi Hesperia: layer opsional); selebihnya default nyala
C.TGROUP = {
  satvan_pedalaman: 'sat',
  imperial_commonwealth: 'ic', hesperia: 'hes', hes_marka: 'cw', hes_pesisir: 'hesb', hes_transisi: 'hesb', hes_pedalaman: 'hesb',
  foedera: 'foe', foedera_inti: 'foe', cassivalla: 'foe',
  nundina: 'int', aventalia: 'int', tarvenna: 'int', anabasim: 'ana', andura: 'elv', anusarri: 'elv',
  kloaka: 'lain', kloaka_zona: 'lain', liminara: 'lain', ktonia: 'lain', pylora: 'lain', emporys: 'lain', perates: 'lain', vasundha: 'lain'
};
/** Kelompok sebuah wilayah. Rekaman jenjang (t.of = id induk) ikut induknya; Interregna (ir_*) selalu 'int'. */
C.tgroupOf = function (t) { var id = t.of || t.id; return C.TGROUP[id] || (id.indexOf('ir_') === 0 ? 'int' : 'lain'); };
/** Wilayah dalam urutan gambar bawah → atas: kelompok menurut C.TGROUPS, lalu urutan data. Stabil. Hit-test memakai urutan terbaliknya. */
C.terrOrder = function (list) {
  return list.map(function (t, i) { return { t: t, g: C.TGROUPS.indexOf(C.tgroupOf(t)), i: i }; })
    .sort(function (a, b) { return (a.g - b.g) || (a.i - b.i); }).map(function (o) { return o.t; });
};
// ------------------------------------------------------------------ nama polity Interregna di atas poligon (v2.0.1)
/* Mosaik Interregna (ir_*) sengaja tidak punya marker, tempat, atau ibukota (Kontrak Data: ibukota belum ditempatkan), jadi namanya (usulan Draft) tidak ikut
   DATA.places dan sebelumnya hanya muncul sebagai tooltip. Di sini namanya diturunkan menjadi LABEL di atas poligon — bukan marker, supaya tak terbaca sebagai lokasi
   kota. Titik label DIHITUNG dari geometri, tidak disimpan: bila mosaik digambar ulang, label ikut pindah. Satu label per bagian poligon (eksklave ikut dinamai, v2.0.2). Satu fungsi untuk peta datar, globe, dan cakram. */
function ringArea(r) { var s = 0; for (var i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][1] * r[i][0] - r[i][1] * r[j][0]; return Math.abs(s) / 2; }
/** Cincin [[lat, lon], …] → {x, y} Float64Array (x = bujur × k, k = cos lintang, supaya jarak mendekati isotropik). Larik datar: pencarian titik label memanggilnya ribuan kali. */
function flatRing(r, k) { var n = r.length, x = new Float64Array(n), y = new Float64Array(n); for (var i = 0; i < n; i++) { x[i] = r[i][1] * k; y[i] = r[i][0]; } return { x: x, y: y, n: n }; }
function inFlat(px, py, f) {
  var c = false, x = f.x, y = f.y;
  for (var i = 0, j = f.n - 1; i < f.n; j = i++) { var yi = y[i], yj = y[j]; if ((yi > py) !== (yj > py) && px < (x[j] - x[i]) * (py - yi) / (yj - yi) + x[i]) c = !c; }
  return c;
}
function distFlat(px, py, f) {
  var best = Infinity, x = f.x, y = f.y;
  for (var i = 0, j = f.n - 1; i < f.n; j = i++) {
    var ax = x[j], ay = y[j], dx = x[i] - ax, dy = y[i] - ay, l2 = dx * dx + dy * dy, t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t; var ex = px - (ax + t * dx), ey = py - (ay + t * dy), d = ex * ex + ey * ey; if (d < best) best = d;
  }
  return Math.sqrt(best);
}
/** Titik di dalam cincin (bujur diskalakan k)? Dipakai untuk menyaring kantong; satu panggilan per titik cincin, bukan per kisi. */
function inRingK(x, y, r, k) {
  var c = false;
  for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
    var xi = r[i][1] * k, yi = r[i][0], xj = r[j][1] * k, yj = r[j][0];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/**
 * Titik label sebuah poligon: titik terdalam (jarak terjauh ke tepi mana pun) di dalam `ring`, di luar semua `holes` (cincin yang digambar di atasnya: enklaf, eksklave).
 * Pencarian kisi lalu penghalusan, deterministik. Mengembalikan {lat, lon, depth (derajat), room (lebar horizontal bebas di titik itu, derajat bujur)}.
 */
C.labelPoint = function (ring, holes) {
  holes = holes || [];
  var la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity, i, j, d;
  ring.forEach(function (p) { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); });
  var k = Math.cos((la0 + la1) / 2 * D2R), F = flatRing(ring, k), HF = holes.map(function (r) { return flatRing(r, k); });
  var hb = HF.map(function (f) { var b = [Infinity, -Infinity, Infinity, -Infinity]; for (var q = 0; q < f.n; q++) { b[0] = Math.min(b[0], f.x[q]); b[1] = Math.max(b[1], f.x[q]); b[2] = Math.min(b[2], f.y[q]); b[3] = Math.max(b[3], f.y[q]); } return b; });
  function depth(x, y) {
    if (!inFlat(x, y, F)) return -1;
    var m = distFlat(x, y, F);
    for (var h = 0; h < HF.length; h++) {
      var b = hb[h]; if (x < b[0] - m || x > b[1] + m || y < b[2] - m || y > b[3] + m) continue;   // lubang di luar jangkauan: tak memuat titik ini, tak lebih dekat dari tepi terdekat
      if (inFlat(x, y, HF[h])) return -1; m = Math.min(m, distFlat(x, y, HF[h]));
    }
    return m;
  }
  var N = 20, x0 = lo0 * k, y0 = la0, sx = (lo1 * k - x0) / N, sy = (la1 - y0) / N, best = { x: x0 + sx * N / 2, y: y0 + sy * N / 2, d: -1 };
  for (i = 0; i <= N; i++) for (j = 0; j <= N; j++) { d = depth(x0 + i * sx, y0 + j * sy); if (d > best.d) best = { x: x0 + i * sx, y: y0 + j * sy, d: d }; }
  var half = Math.max(sx, sy);
  for (var it = 0; it < 6; it++) {   // penghalusan: kisi 5 × 5 di sekitar yang terbaik, jendela dan langkah dipangkas dua tiap putaran
    var cx = best.x, cy = best.y, st = half / 2;
    for (i = -2; i <= 2; i++) for (j = -2; j <= 2; j++) { d = depth(cx + i * st, cy + j * st); if (d > best.d) best = { x: cx + i * st, y: cy + j * st, d: d }; }
    half = st;
  }
  // lebar bebas horizontal di garis lintang titik label: persimpangan garis itu dengan tepi poligon dan lubang; ambil yang terdekat di kiri dan kanan titik
  var xl = -Infinity, xr = Infinity;
  [F].concat(HF).forEach(function (f) {
    for (var a = 0, b = f.n - 1; a < f.n; b = a++) {
      if ((f.y[a] > best.y) !== (f.y[b] > best.y)) { var x = (f.x[b] - f.x[a]) * (best.y - f.y[a]) / (f.y[b] - f.y[a]) + f.x[a]; if (x <= best.x && x > xl) xl = x; if (x > best.x && x < xr) xr = x; }
    }
  });
  return { lat: best.y, lon: best.x / k, depth: best.d, room: isFinite(xl) && isFinite(xr) ? (xr - xl) / k : 0 };
};
/** Jenis polity dari teks jenis faksi: k kerajaan, a wilayah adat, c kota merdeka, m mikro-polity. */
function polityType(kind) { kind = String(kind || ''); return /wilayah adat/i.test(kind) ? 'a' : /kota/i.test(kind) ? 'c' : /mikro/i.test(kind) ? 'm' : 'k'; }
/** Jenjang ukuran label menurut luas (piksel grid 12,7 km, tanpa kantong): 1 besar … 4 terkecil. Hanya menentukan ukuran huruf (CSS); kapan sebuah label tampil diputuskan aturan muat di `C.declutterPolity`, bukan jenjang. */
C.POLITY_TIER = [2000, 600, 250];
function polityTier(px) { var t = 1; C.POLITY_TIER.forEach(function (lim) { if (px < lim) t++; }); return t; }
/**
 * Label nama polity Interregna (ir_*) sebagai objek mirip-tempat, TANPA masuk DATA.places (tidak ikut pencarian, hitungan entri, atau kartu tempat).
 * SATU LABEL PER BAGIAN: tiap cincin `t.rings` adalah bagian terpisah dari polity (ir_* tidak punya lubang sendiri; tes unit menjaga asumsi itu), misalnya eksklave Akṣata
 * di dalam Novalia. Setiap bagian diberi nama di titiknya sendiri, jadi bentuk yang berdiri sendiri tidak pernah tampil tanpa nama (v2.0.2). Bagian terbesar lebih dulu
 * (part 0, key = id), lalu yang lebih kecil (part 1…, key = id#2, …); polity berbagian satu tidak berubah.
 * Setiap objek: {id (polity), key (unik per label), part, fid (faksi untuk kartu), name, cat:'polity', label_only, polity, tg (kelompok layer wilayahnya), epi, proposal, ptype,
 * tier, px, lat, lon, room, depth}. `px` dan `tier` mengikuti luas BAGIAN itu (px polity × porsi luas cincin, berbobot cos lintang): ukuran huruf dan prioritas label
 * mengikuti poligon yang ditempatinya.
 * `proposal` mengikuti teks jenis faksi ("nama usulan (Draft)"): bila nama kelak dikunci, garis bawah putus-putus hilang sendiri.
 * Lubang = polity yang digambar sesudahnya (urutan C.terrOrder) dan berada di dalam bagian itu, supaya label induk tidak jatuh di atas enklaf.
 */
C.polityLabels = function (DATA) {
  if (C._pl && C._pl.src === DATA) return C._pl.out;   // satu kali hitung untuk peta datar, globe, dan cakram (hasil tidak boleh diubah pemanggil)
  var FAC = DATA.factions || {}, ord = C.terrOrder(DATA.territories || []), out = [];
  function bbox(r) { var b = [Infinity, -Infinity, Infinity, -Infinity]; r.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.max(b[1], p[0]); b[2] = Math.min(b[2], p[1]); b[3] = Math.max(b[3], p[1]); }); return b; }
  ord.forEach(function (t, idx) {
    if (t.of || t.id.indexOf('ir_') !== 0 || !FAC[t.id]) return;
    var f = FAC[t.id];
    var parts = t.rings.map(function (r) { return { r: r, a: ringArea(r) * Math.cos(r[0][0] * D2R) }; }).sort(function (a, b) { return b.a - a.a; });
    var tot = parts.reduce(function (s, q) { return s + q.a; }, 0);
    parts.forEach(function (pt, pi) {
      var main = pt.r, k = Math.cos(main[0][0] * D2R), mb = bbox(main), holes = [];
      ord.slice(idx + 1).forEach(function (u) {
        if (C.tgroupOf(u) !== 'int') return;
        u.rings.forEach(function (r) {
          var b = bbox(r); if (b[0] > mb[1] || b[1] < mb[0] || b[2] > mb[3] || b[3] < mb[2]) return;
          var n = 0; r.forEach(function (p) { if (inRingK(p[1] * k, p[0], main, k)) n++; });
          if (n >= 0.6 * r.length) holes.push(r);   // mayoritas titiknya di dalam = kantong yang digambar di atas induknya; tetangga yang cuma bersentuhan tidak ikut
        });
      });
      var lp = C.labelPoint(main, holes), px = parts.length === 1 || !(tot > 0) ? (t.px || 0) : Math.round((t.px || 0) * pt.a / tot);
      out.push({ id: t.id, key: pi ? t.id + '#' + (pi + 1) : t.id, part: pi, fid: t.id, name: f.name, cat: 'polity', label_only: true, polity: true, tg: C.tgroupOf(t), epi: f.epi || 'inferensi',
        proposal: /usulan|draft/i.test(f.kind || ''), ptype: polityType(f.kind), tier: polityTier(px), px: px, lat: lp.lat, lon: lp.lon, room: lp.room > 0 ? lp.room : null, depth: lp.depth });
    });
  });
  C._pl = { src: DATA, out: out };
  return out;
};

/* Gaya per kunci `style` di faksi (data.json). Tanpa `style` = tampilan lama (isian rata 26 % atau arsir 9 px). `tiers` = jenjang kepadatan pola titik
   (rekaman wilayah dengan `tier` n memakai baris n; wilayah induk jenjang 0). Pola: {k:'hatch', a1, a2, g, b, rot} garis miring; {k:'dots', a, g, r}
   bintik selang-seling berjarak g piksel layar — kepadatan konstan di layar, tidak ikut zoom. `stroke:null` = tanpa garis tepi (zona difus). */
var HATCH = { k: 'hatch', a1: 0.16, a2: 0.55, g: 9, b: 2.6, rot: 40 };
var TSTYLE = {
  ic:        { fill: { k: 'flat', a: 0.07 }, stroke: { a: 0.9, k: 1.5, dash: '9 5' } },
  marka:     { fill: { k: 'hatch', a1: 0.2, a2: 0.6, g: 8, b: 2.4, rot: 40 }, stroke: { a: 0.85, k: 1 } },
  belt0:     { col: '#ee7d86', fill: { k: 'flat', a: 0.34 }, stroke: null },
  belt1:     { col: '#c0394b', fill: { k: 'flat', a: 0.36 }, stroke: null },
  belt2:     { col: '#6f1d33', fill: { k: 'flat', a: 0.55 }, stroke: null },
  foe_claim: { fill: { k: 'hatch', a1: 0.06, a2: 0.34, g: 13, b: 2, rot: 40 }, stroke: { a: 0.8, k: 1 } },
  foe_core:  { fill: { k: 'flat', a: 0.55 }, stroke: null },
  klo_claim: { fill: { k: 'flat', a: 0.05 }, stroke: { a: 0.85, k: 0.85, dash: '3 4' } },
  klo_zone:  { tiers: [{ k: 'dots', a: 0.7, g: 12, r: 1.15 }, { k: 'dots', a: 0.75, g: 8, r: 1.2 }, { k: 'dots', a: 0.8, g: 5.5, r: 1.2 }], stroke: null },
  sat:       { tiers: [{ k: 'dots', a: 0.55, g: 20, r: 1.1 }, { k: 'dots', a: 0.6, g: 13, r: 1.15 }, { k: 'dots', a: 0.65, g: 8.5, r: 1.2 }], stroke: null }
};
function withCol(p, col) { var o = { col: col }; Object.keys(p).forEach(function (k) { o[k] = p[k]; }); return o; }
/** Gaya gambar sebuah wilayah: {fill:{k:'flat'|'hatch'|'dots', col, …}, stroke:{col, a, k (pengali tebal garis), dash}|null}. f = faksi (data.json), t = rekaman wilayah. */
C.terrStyle = function (f, t) {
  var s = f && f.style ? TSTYLE[f.style] : null, col = (s && s.col) || (f && f.color) || '#cccccc';
  if (!s) return { fill: f && f.hatch ? withCol(HATCH, col) : { k: 'flat', col: col, a: 0.26 }, stroke: { col: col, a: 0.8, k: 1, dash: f && f.dashed ? '5 4' : null } };
  var tier = (t && t.tier) || 0, fl = s.tiers ? s.tiers[Math.min(tier, s.tiers.length - 1)] : s.fill;
  return { fill: withCol(fl, col), stroke: s.stroke ? { col: col, a: s.stroke.a, k: s.stroke.k, dash: s.stroke.dash || null } : null };
};
/** Kunci pola untuk isian bukan-rata (hatch/dots); null untuk isian rata. Dipakai sebagai id SVG di peta datar dan kunci cache kanvas di globe dan cakram. */
C.patKey = function (p) {
  if (!p || p.k === 'flat') return null;
  return p.k + '-' + String(p.col).replace('#', '') + '-' + [p.a1, p.a2, p.a, p.g, p.b, p.r, p.rot].filter(function (x) { return x != null; }).join('_').replace(/\./g, 'p');
};
/** Markup <pattern> SVG (peta datar dan swatch legenda) untuk pola p dengan id tertentu. */
C.patSVG = function (p, id) {
  var c = p.col;
  if (p.k === 'dots') return '<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="' + p.g + '" height="' + p.g + '"><circle cx="' + p.g * 0.25 + '" cy="' + p.g * 0.25 + '" r="' + p.r + '" fill="' + c + '" fill-opacity="' + p.a + '"/><circle cx="' + p.g * 0.75 + '" cy="' + p.g * 0.75 + '" r="' + p.r + '" fill="' + c + '" fill-opacity="' + p.a + '"/></pattern>';
  return '<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="' + p.g + '" height="' + p.g + '" patternTransform="rotate(' + p.rot + ')"><rect width="' + p.g + '" height="' + p.g + '" fill="' + c + '" fill-opacity="' + p.a1 + '"/><rect width="' + p.b + '" height="' + p.g + '" fill="' + c + '" fill-opacity="' + p.a2 + '"/></pattern>';
};
/** Ubin pola untuk kanvas (globe, cakram): {w, h, rot, draw(q)} — gambar yang sama dengan patSVG. */
C.patTile = function (p) {
  if (p.k === 'dots') return { w: p.g, h: p.g, rot: 0, draw: function (q) { q.fillStyle = p.col; q.globalAlpha = p.a; [0.25, 0.75].forEach(function (u) { q.beginPath(); q.arc(p.g * u, p.g * u, p.r, 0, 2 * Math.PI); q.fill(); }); q.globalAlpha = 1; } };
  return { w: p.g, h: p.g, rot: p.rot, draw: function (q) { q.fillStyle = p.col; q.globalAlpha = p.a1; q.fillRect(0, 0, p.g, p.g); q.globalAlpha = p.a2; q.fillRect(0, 0, p.b, p.g); q.globalAlpha = 1; } };
};

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

/**
 * Penyaring nama polity Interregna (v2.0.1), dipakai peta datar, globe, dan cakram. Prioritas terendah di antara semua tulisan.
 * Sebuah nama disembunyikan bila (1) tak muat di dalam poligonnya: lebar tulisan > lebar bebas poligon di titik label (`fit`, piksel) × 1,12 — nama baru muncul ketika zoom
 * cukup dekat, jadi tak pernah tumpah ke poligon tetangga; (2) menimpa penghalang (ikon dan nama marker, label wilayah, anotasi); atau (3) menimpa nama polity lain yang
 * lebih luas. Yang disembunyikan tidak memblokir apa pun.
 * items: [{rc: [x0, y0, x1, y1] (piksel layar), px (luas polity), fit (piksel, atau null = tanpa uji muat), hide: function (bool)}]; blockers: [[x0, y0, x1, y1, …]].
 */
C.POLITY_FIT = 1.12;
C.declutterPolity = function (items, blockers) {
  function ov(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
  var placed = [];
  items.slice().sort(function (a, b) { return b.px - a.px; }).forEach(function (it) {
    var r = [it.rc[0] - 2, it.rc[1] - 1, it.rc[2] + 2, it.rc[3] + 1];
    var bad = it.fit != null && (it.rc[2] - it.rc[0]) > it.fit * C.POLITY_FIT;
    if (!bad) bad = blockers.some(function (q) { return ov(r, q); }) || placed.some(function (q) { return ov(r, q); });
    it.hide(bad); if (!bad) placed.push(r);
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
