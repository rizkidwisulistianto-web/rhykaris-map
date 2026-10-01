/* Master Map Rhykaris — tampilan "Peta kerja" dual-disk Lambert azimuthal equal-area (Stage 2, fase 3). Status epistemik proyeksi: TURUNAN.
   Tanpa three.js dan tanpa WebGL: murni Canvas 2D, dimuat malas saat dibuka.

   Dua cakram yang saling melengkapi dengan THE SCAR sebagai batas bersama, SATU skala Rs (luas sebanding):
     • Cakram Rhykar : pusat C  = (−55,5°, 0°)   — jarak sudut θ  = 0 … 72,5°    ρ = 2·Rs·sin(θ/2),  rim (Scar) ρ ≈ 1,1826·Rs
     • Cakram Aëris  : pusat C′ = (+55,5°, 180°) — jarak sudut θ′ = 0 … 107,5°   ρ = 2·Rs·sin(θ′/2), rim (Scar) ρ ≈ 1,6128·Rs
   Luas: π·ρ² → 34,964 % : 65,036 % dan jumlah ρ² = 4·Rs² (luas bola). Skala radial = cos(θ/2): ≈ 0,59 di rim Aëris (107,5°) — bentuk
   terdistorsi di dekat rim, luas tetap benar.

   Orientasi: sudut polar = azimut α di sekeliling sumbu C–C′, diukur dari pusat Rhykar (α = 0 → puncak Scar +17° di bujur 0°,
   +90 → lereng timur, ±180 → palung; sama dengan konstanta SC / circlePt di app.js):
        P(θ, α) = cosθ·a + sinθ·(cosα·u0 + sinα·u90),   a = vektor C, u0 = utara lokal di C, u90 = u0 × a (timur lokal di C).
   Cakram Aëris dilihat dari SISI SEBERANG (seperti sisi belakang globe): untuk α yang sama, arahnya CERMIN terhadap cakram Rhykar.
   Konvensi yang dipilih (dan didokumentasikan di docs/STAGE2_NOTES.md): kedua cakram menaruh puncak (α = 0) di atas; Rhykar di kiri,
   Aëris di kanan — maka titik Scar ber-azimut sama (mis. lereng timur α = +90: di tepi kanan Rhykar dan tepi kiri Aëris) tampak
   BERHADAPAN di celah antar-cakram, seperti globe yang dibuka pada engsel vertikal. Di layar tegak (ponsel) keduanya diputar 90° dan
   ditumpuk: Rhykar di atas, Aëris di bawah, lereng timur saling berhadapan. */
(function (root) {
'use strict';
var RH = root.RH = root.RH || {};
var D2R = Math.PI / 180, R2D = 180 / Math.PI;
var DK = RH.disk = {};
var M = DK.math = {};

// ------------------------------------------------------------------ matematika murni (satuan Rs = 1, bola satuan; diuji di Node)
M.CENTER = { lat: -55.5, lon: 0 };            // C — pusat cakram Rhykar (= konstanta SC)
M.ANTIPODE = { lat: 55.5, lon: 180 };         // C′ — pusat cakram Aëris
M.RIM_R = 72.5;                               // rim cakram Rhykar (jarak sudut dari C)
M.RIM_A = 180 - 72.5;                         // rim cakram Aëris (jarak sudut dari C′) = 107,5°
M.MARGIN = 4;                                 // derajat melewati rim yang digambar memudar (konteks)
M.GAP = 0.14;                                 // celah antar-cakram (Rs)
(function () {
  var la = M.CENTER.lat * D2R, lo = M.CENTER.lon * D2R;
  var a = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  var u0 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  var u90 = [u0[1] * a[2] - u0[2] * a[1], u0[2] * a[0] - u0[0] * a[2], u0[0] * a[1] - u0[1] * a[0]];   // u0 × a
  M.a = a; M.u0 = u0; M.u90 = u90;
})();
M.rho = function (thetaDeg) { return 2 * Math.sin(thetaDeg * D2R / 2); };
M.theta = function (rho) { return 2 * Math.asin(Math.min(1, rho / 2)) * R2D; };
M.radialScale = function (thetaDeg) { return Math.cos(thetaDeg * D2R / 2); };       // skala sepanjang radius
M.tangentialScale = function (thetaDeg) { return 1 / Math.cos(thetaDeg * D2R / 2); }; // skala sepanjang keliling (hasil kali = 1: luas benar)
function vec(lat, lon) { var la = lat * D2R, lo = lon * D2R; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; }
function dot(p, q) { return p[0] * q[0] + p[1] * q[1] + p[2] * q[2]; }
/** (lat, lon) → {theta, alpha}: jarak sudut dari C dan azimut di sekeliling sumbu C–C′ (derajat; alpha dalam −180…180). */
M.polar = function (lat, lon) {
  var p = vec(lat, lon), c = dot(p, M.a), q = [p[0] - c * M.a[0], p[1] - c * M.a[1], p[2] - c * M.a[2]];
  return { theta: Math.atan2(Math.sqrt(dot(q, q)), c) * R2D, alpha: Math.atan2(dot(p, M.u90), dot(p, M.u0)) * R2D };
};
/** {theta, alpha} → [lat, lon]. */
M.fromPolar = function (thetaDeg, alphaDeg) {
  var t = thetaDeg * D2R, al = alphaDeg * D2R, ct = Math.cos(t), st = Math.sin(t), ca = Math.cos(al), sa = Math.sin(al);
  var p = [ct * M.a[0] + st * (ca * M.u0[0] + sa * M.u90[0]), ct * M.a[1] + st * (ca * M.u0[1] + sa * M.u90[1]), ct * M.a[2] + st * (ca * M.u0[2] + sa * M.u90[2])];
  return [Math.asin(Math.max(-1, Math.min(1, p[2]))) * R2D, Math.atan2(p[1], p[0]) * R2D];
};
/** Rotasi layar (derajat searah jarum jam) untuk orientasi: 'h' (lanskap) = 0, 'v' (potret) = 90. */
M.rotOf = function (orient) { return orient === 'v' ? 90 : 0; };
/** Koordinat bidang lokal pusat cakram (x ke kanan, y ke bawah, satuan Rs) untuk titik (theta, alpha) di cakram `which` ('R' | 'A'). */
M.diskXY = function (which, thetaDeg, alphaDeg, orient) {
  var rot = M.rotOf(orient), r, ang;
  if (which === 'R') { r = M.rho(thetaDeg); ang = alphaDeg + rot; }
  else { r = M.rho(180 - thetaDeg); ang = -alphaDeg + rot; }            // sisi seberang: cermin
  return { x: r * Math.sin(ang * D2R), y: -r * Math.cos(ang * D2R), r: r };
};
/** Kebalikan dari diskXY: (x, y) lokal → {lat, lon, theta, alpha, rho} atau null bila di luar radius rhoMax. */
M.diskInverse = function (which, x, y, orient, rhoMax) {
  var r = Math.sqrt(x * x + y * y); if (rhoMax != null && r > rhoMax) return null; if (r > 2) return null;
  var rot = M.rotOf(orient), ang = Math.atan2(x, -y) * R2D, thD = M.theta(r), theta, alpha;
  if (which === 'R') { theta = thD; alpha = ang - rot; } else { theta = 180 - thD; alpha = rot - ang; }
  alpha = ((alpha + 540) % 360) - 180; var ll = M.fromPolar(theta, alpha);
  return { lat: ll[0], lon: ll[1], theta: theta, alpha: alpha, rho: r };
};
/** Tata letak lembar: pusat kedua cakram dalam satuan Rs, dengan (0,0) di tengah lembar. */
M.layout = function (orient) {
  var rR = M.rho(M.RIM_R + M.MARGIN), rA = M.rho(M.RIM_A + M.MARGIN), g = M.GAP, L = { orient: orient, rhoMaxR: rR, rhoMaxA: rA, gap: g };
  if (orient === 'v') { var H = 2 * rR + g + 2 * rA, W = 2 * rA; L.W = W; L.H = H; L.R = { cx: 0, cy: -H / 2 + rR }; L.A = { cx: 0, cy: -H / 2 + 2 * rR + g + rA }; }
  else { var W2 = 2 * rR + g + 2 * rA, H2 = 2 * rA; L.W = W2; L.H = H2; L.R = { cx: -W2 / 2 + rR, cy: 0 }; L.A = { cx: -W2 / 2 + 2 * rR + g + rA, cy: 0 }; }
  return L;
};
/** Titik (lat, lon) pada lembar: daftar {disk, x, y} (x, y dalam satuan Rs relatif ke pusat lembar). Titik di strip margin tampil di kedua cakram. */
M.project = function (lat, lon, L) {
  var pp = M.polar(lat, lon), out = [];
  if (pp.theta <= M.RIM_R + M.MARGIN) { var r = M.diskXY('R', pp.theta, pp.alpha, L.orient); out.push({ disk: 'R', x: L.R.cx + r.x, y: L.R.cy + r.y, theta: pp.theta, alpha: pp.alpha }); }
  if (180 - pp.theta <= M.RIM_A + M.MARGIN) { var q = M.diskXY('A', pp.theta, pp.alpha, L.orient); out.push({ disk: 'A', x: L.A.cx + q.x, y: L.A.cy + q.y, theta: pp.theta, alpha: pp.alpha }); }
  return out;
};
/** Titik lembar (x, y) → {disk, lat, lon, ...} atau null (di celah / di luar cakram). */
M.unproject = function (x, y, L) {
  var r = M.diskInverse('R', x - L.R.cx, y - L.R.cy, L.orient, L.rhoMaxR); if (r) { r.disk = 'R'; return r; }
  r = M.diskInverse('A', x - L.A.cx, y - L.A.cy, L.orient, L.rhoMaxA); if (r) { r.disk = 'A'; return r; }
  return null;
};
/**
 * Reproyeksi tekstur ekuirektangular (RGBA, tw × th) ke lembar dual-disk. Menulis ke `out` (Uint8ClampedArray, sw × sh × 4) dan memanggil
 * onRow(y) tiap baris. Invers Lambert → (lat, lon) → sampling bilinear (bujur membungkus). Alfa 255 sampai rim, memudar linear melewati rim
 * sejauh M.MARGIN. Mengembalikan jumlah piksel penuh (alfa 255) per cakram {R, A} — untuk uji rasio luas.
 */
M.reproject = function (tex, tw, th, L, RsPx, out, sw, sh, rowFrom, rowTo, counts) {
  var a = M.a, u0 = M.u0, u90 = M.u90, rot = M.rotOf(L.orient) * D2R, x0 = -L.W / 2, y0 = -L.H / 2, rimR = M.RIM_R, rimA = M.RIM_A, mg = M.MARGIN;
  counts = counts || { R: 0, A: 0 };
  var pre = tex._rhPre || (tex._rhPre = { rows: {} }), texelDeg = 360 / tw, pxDeg = R2D / RsPx * 1.5;   // pxDeg: arco per piksel keluaran (konservatif)
  // Dekat kutub, satu piksel keluaran menutup ratusan teksel bujur → tanpa pra-penyaringan hasilnya derau (aliasing). Baris lintang dirata-rata
  // 2^k teksel secara horizontal (k dipilih dari cos(lintang)) sebelum disampel; baris dibuat sekali dan disimpan.
  function preRow(k, y) {
    var key = k * 100000 + y, r = pre.rows[key]; if (r) return r;
    var n = 1 << k, w = tw >> k; r = new Float32Array(w * 3); var base = y * tw * 4;
    for (var i = 0; i < w; i++) { var sr = 0, sg = 0, sb = 0; for (var j = 0; j < n; j++) { var o = base + (i * n + j) * 4; sr += tex[o]; sg += tex[o + 1]; sb += tex[o + 2]; } r[i * 3] = sr / n; r[i * 3 + 1] = sg / n; r[i * 3 + 2] = sb / n; }
    return (pre.rows[key] = r);
  }
  for (var py = rowFrom; py < rowTo; py++) {
    var uy = y0 + (py + 0.5) / RsPx;
    for (var px = 0; px < sw; px++) {
      var ux = x0 + (px + 0.5) / RsPx, which, dx, dy, thD, rimD;
      dx = ux - L.R.cx; dy = uy - L.R.cy; var rr = Math.sqrt(dx * dx + dy * dy);
      if (rr <= L.rhoMaxR) { which = 0; }
      else { dx = ux - L.A.cx; dy = uy - L.A.cy; rr = Math.sqrt(dx * dx + dy * dy); if (rr <= L.rhoMaxA) which = 1; else continue; }
      thD = 2 * Math.asin(Math.min(1, rr / 2)) * R2D;                      // θ (Rhykar) atau θ′ (Aëris), derajat
      rimD = which === 0 ? rimR : rimA;
      var ang = Math.atan2(dx, -dy), alpha, theta;
      if (which === 0) { alpha = ang - rot; theta = thD * D2R; } else { alpha = rot - ang; theta = Math.PI - thD * D2R; }
      var ct = Math.cos(theta), st = Math.sin(theta), ca = Math.cos(alpha), sa = Math.sin(alpha);
      var vx = ct * a[0] + st * ca * u0[0], vy = st * sa, vz = ct * a[2] + st * ca * u0[2];      // a[1] = u0[1] = 0 (C di bujur 0°)
      var lat = Math.asin(vz > 1 ? 1 : vz < -1 ? -1 : vz), lon = Math.atan2(vy, vx);
      var fy = (90 - lat * R2D) / 180 * th - 0.5, iy = Math.floor(fy), ty = fy - iy, o = (py * sw + px) * 4;
      var y1 = iy < 0 ? 0 : (iy >= th ? th - 1 : iy), y2 = iy + 1 >= th ? th - 1 : (iy + 1 < 0 ? 0 : iy + 1);
      var foot = pxDeg / (Math.max(Math.cos(lat), 0.01) * texelDeg), kk = foot < 2 ? 0 : Math.min(7, Math.floor(Math.log(foot) / Math.LN2));
      if (kk === 0) {
        var fx = (lon * R2D + 180) / 360 * tw - 0.5, ix = Math.floor(fx), tx = fx - ix, x1 = ((ix % tw) + tw) % tw, x2 = (x1 + 1) % tw;
        var i11 = (y1 * tw + x1) * 4, i21 = (y1 * tw + x2) * 4, i12 = (y2 * tw + x1) * 4, i22 = (y2 * tw + x2) * 4;
        var w11 = (1 - tx) * (1 - ty), w21 = tx * (1 - ty), w12 = (1 - tx) * ty, w22 = tx * ty;
        out[o] = tex[i11] * w11 + tex[i21] * w21 + tex[i12] * w12 + tex[i22] * w22;
        out[o + 1] = tex[i11 + 1] * w11 + tex[i21 + 1] * w21 + tex[i12 + 1] * w12 + tex[i22 + 1] * w22;
        out[o + 2] = tex[i11 + 2] * w11 + tex[i21 + 2] * w21 + tex[i12 + 2] * w12 + tex[i22 + 2] * w22;
      } else {
        var wk = tw >> kk, fxk = (lon * R2D + 180) / 360 * wk - 0.5, ixk = Math.floor(fxk), txk = fxk - ixk, xa = ((ixk % wk) + wk) % wk, xb = (xa + 1) % wk, ra = preRow(kk, y1), rb = preRow(kk, y2);
        var m11 = (1 - txk) * (1 - ty), m21 = txk * (1 - ty), m12 = (1 - txk) * ty, m22 = txk * ty;
        for (var ch = 0; ch < 3; ch++) out[o + ch] = ra[xa * 3 + ch] * m11 + ra[xb * 3 + ch] * m21 + rb[xa * 3 + ch] * m12 + rb[xb * 3 + ch] * m22;
      }
      var over = thD - rimD;
      if (over <= 0) { out[o + 3] = 255; if (which === 0) counts.R++; else counts.A++; } else out[o + 3] = Math.max(0, 255 * (1 - over / mg));
    }
  }
  return counts;
};

// ------------------------------------------------------------------ tampilan (DOM)
DK.init = function (ctx) {
  var C = ctx.C, LS = ctx.LS, LAY = ctx.LAYERS, REDUCED = ctx.REDUCED;
  var app = document.getElementById('app'), clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var root = document.createElement('div'); root.id = 'disk'; root.className = 'v2-chrome'; root.hidden = true; root.setAttribute('data-z', '2'); app.insertBefore(root, document.getElementById('map').nextSibling);
  var cv = document.createElement('canvas'); cv.className = 'd-canvas'; cv.tabIndex = 0; cv.setAttribute('role', 'application');
  cv.setAttribute('aria-label', 'Peta kerja dual-disk Lambert: cakram Rhykar dan cakram Aëris dengan The Scar sebagai batas bersama. Seret untuk menggeser, gulir atau cubit untuk memperbesar, tombol panah menggeser.');
  root.appendChild(cv); var g = cv.getContext('2d');
  var pinsEl = document.createElement('div'); pinsEl.className = 'g-labels'; root.appendChild(pinsEl);
  var tipEl = document.createElement('div'); tipEl.className = 'g-tip'; tipEl.hidden = true; root.appendChild(tipEl);
  var noteEl = document.createElement('div'); noteEl.className = 'g-epi d-note'; root.appendChild(noteEl);
  var busyEl = document.createElement('div'); busyEl.className = 'd-busy'; busyEl.hidden = true; root.appendChild(busyEl);
  var dockEl = document.createElement('div'); dockEl.id = 'd-dock'; dockEl.className = 'v2-chrome'; dockEl.hidden = true; dockEl.setAttribute('role', 'group'); dockEl.setAttribute('aria-label', 'Kontrol peta kerja'); app.appendChild(dockEl);
  noteEl.innerHTML = '<span>Lambert azimuthal equal-area · luas benar · bentuk terdistorsi di dekat rim ' + C.chip('turunan') + '</span><span>Peta fisik v4 ' + C.chip('kanon') + '</span>' +
    '<span>Rim cakram Aëris: skala radial ' + C.fmt(M.radialScale(M.RIM_A), 2) + ' (107,5°)</span><span>Cincin dari kurva Scar: Within ≤ 6,5° · Adjacent ≤ 19,5° · Peripheral ≤ 32,5°</span>';

  var DPR = 1, W = 1, H = 1, orient = 'h', orientPref = LS.get('rh-d-orient', 'auto'), L = M.layout('h');
  var st = { shown: false, cx: 0, cy: 0, scale: 100, hover: null, hoverPx: null, meas: false }, meas = null;   // meas (state): mode ukur aktif; meas (var): hasil ukur yang digambar   // (cx, cy): titik lembar (Rs) di pusat area bebas; scale: px per Rs
  var sheets = {}, texData = null, texW = 0, texH = 0, sheetBuilding = null, RS_PX = 500;
  var tipTxt = '';

  // ---------------------------------------------------------------- lembar hasil reproyeksi
  function loadTex() {
    if (texData) return Promise.resolve();
    return new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () { var c = document.createElement('canvas'); c.width = texW = im.width; c.height = texH = im.height; var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0); texData = x.getImageData(0, 0, texW, texH).data; res(); };
      im.onerror = function () { rej(new Error('tekstur peta fisik gagal dimuat')); }; im.src = ctx.BASE;
    });
  }
  function buildSheet(or) {
    if (sheets[or]) return Promise.resolve(sheets[or]);
    if (sheetBuilding && sheetBuilding.or === or) return sheetBuilding.p;
    var lay = M.layout(or), RsPx = RS_PX, sw = Math.ceil(lay.W * RsPx), sh = Math.ceil(lay.H * RsPx);
    var p = loadTex().then(function () {
      return new Promise(function (res) {
        var out = new Uint8ClampedArray(sw * sh * 4), row = 0, counts = { R: 0, A: 0 }, t0 = performance.now();
        busyEl.hidden = false;
        (function step() {
          var t = performance.now(), to = Math.min(sh, row + 40);
          M.reproject(texData, texW, texH, lay, RsPx, out, sw, sh, row, to, counts); row = to;
          while (row < sh && performance.now() - t < 14) { to = Math.min(sh, row + 20); M.reproject(texData, texW, texH, lay, RsPx, out, sw, sh, row, to, counts); row = to; }
          busyEl.textContent = 'menyusun peta kerja… ' + Math.round(row / sh * 100) + ' %';
          if (row < sh) { setTimeout(step, 0); return; }
          var c = document.createElement('canvas'); c.width = sw; c.height = sh; c.getContext('2d').putImageData(new ImageData(out, sw, sh), 0, 0);
          busyEl.hidden = true; var sheet = { cv: c, w: sw, h: sh, RsPx: RsPx, L: lay, counts: counts, ms: Math.round(performance.now() - t0) }; sheets[or] = sheet; sheetBuilding = null; res(sheet);
        })();
      });
    });
    sheetBuilding = { or: or, p: p }; return p;
  }

  // ---------------------------------------------------------------- tampilan, koordinat, resize
  // area bebas: di luar panel kiri / lembar bawah; t = tinggi header (judul, perkakas, readout di ponsel) yang tidak boleh tertutup
  function freeBox() { var ins = ctx.insets ? ctx.insets() : { l: 0, b: 0 }, ti = window.innerWidth <= 760 ? 112 : 64; return { l: ins.l || 0, b: ins.b || 0, t: ti, w: Math.max(120, W - (ins.l || 0)), h: Math.max(120, H - (ins.b || 0)) }; }
  function fitFor(or) { var f = freeBox(), l = M.layout(or); return Math.min((f.w - 56) / l.W, (f.h - f.t - 90) / l.H); }
  function pickOrient() { if (orientPref !== 'auto') return orientPref; return fitFor('h') >= fitFor('v') ? 'h' : 'v'; }   // a larger map wins
  function fitScale() { return fitFor(orient); }
  function toScreen(x, y) { var f = freeBox(); return { x: f.l + f.w / 2 + (x - st.cx) * st.scale, y: f.t + (f.h - f.t) / 2 + (y - st.cy) * st.scale }; }
  function toSheet(px, py) { var f = freeBox(); return { x: st.cx + (px - f.l - f.w / 2) / st.scale, y: st.cy + (py - f.t - (f.h - f.t) / 2) / st.scale }; }
  function limitView() { var fs = fitScale(); st.scale = clamp(st.scale, fs * 0.55, fs * 14); st.cx = clamp(st.cx, -L.W / 2 - 0.3, L.W / 2 + 0.3); st.cy = clamp(st.cy, -L.H / 2 - 0.3, L.H / 2 + 0.3); }
  function fitAll() { st.cx = 0; st.cy = 0; st.scale = fitScale(); }
  function resize() {
    var r = root.getBoundingClientRect(); if (!r.width || !r.height) return;
    W = Math.round(r.width); H = Math.round(r.height); DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    var no = pickOrient(); if (no !== orient) { var fo = focus(); orient = no; L = M.layout(orient); relocate(fo); buildSheet(orient).then(draw); } else { if (st.shown) limitView(); }
    draw();
  }
  function relocate(f) { if (!f) { fitAll(); return; } var pr = M.project(f.lat, f.lon, L)[0]; if (pr) { st.cx = pr.x; st.cy = pr.y; } else fitAll(); }
  function focus() { var f = freeBox(), p = toSheet(f.l + f.w / 2, f.t + (f.h - f.t) / 2), u = M.unproject(p.x, p.y, L); if (u) return { lat: u.lat, lon: u.lon }; var dR = Math.hypot(p.x - L.R.cx, p.y - L.R.cy), dA = Math.hypot(p.x - L.A.cx, p.y - L.A.cy); return dR - L.rhoMaxR < dA - L.rhoMaxA ? { lat: M.CENTER.lat, lon: M.CENTER.lon } : { lat: M.ANTIPODE.lat, lon: M.ANTIPODE.lon }; }

  // ---------------------------------------------------------------- marker (DOM) dan anomali
  var pins = [], zonePlace = ctx.DATA.places.filter(function (p) { return p.zone_r; })[0];
  ctx.DATA.places.forEach(function (p) {
    if (p.label_only) return;
    var sz = p.cat === 'capital' ? 26 : (p.cat === 'town' ? 20 : 23), w = document.createElement('div'); w.className = 'g-pin'; w.style.display = 'none';
    var el = document.createElement('div'); el.innerHTML = ctx.markerHTML(p, sz); var mk = el.firstChild;
    mk.setAttribute('role', 'button'); mk.tabIndex = 0; mk.setAttribute('aria-label', p.name + (p.proposal ? ' (usulan)' : '') + ', status koordinat ' + C.EPI[p.epi]); mk.title = p.name;
    mk.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (st.meas) ctx.measureAt(p.lat, p.lon); else openPlace(p.id); } });
    w.appendChild(el); pinsEl.appendChild(w); pins.push({ p: p, wrap: w, nm: mk.querySelector('.mk-name'), size: sz, shown: false, sx: 0, sy: 0, copies: [] });
  });
  var anoms = ctx.DATA.anomalies.map(function (a) { var w = document.createElement('div'); w.className = 'g-anom'; w.style.display = 'none'; w.innerHTML = '<b></b><i></i>'; pinsEl.appendChild(w); return { a: a, wrap: w, shown: false, sx: 0, sy: 0 }; });
  function on(k) { return LAY[k] && LAY[k].on; }

  // ---------------------------------------------------------------- gambar
  var raf = 0; function draw() { if (!st.shown) return; if (!raf) raf = requestAnimationFrame(function () { raf = 0; render(); }); }
  var TXT_HALO = 'rgba(8,12,16,.92)', INK = '#f4eee1';
  function text(s, x, y, o) {
    o = o || {}; g.font = o.font || '600 12px "IBM Plex Sans", system-ui, sans-serif'; g.textAlign = o.align || 'center'; g.textBaseline = o.base || 'middle';
    g.lineWidth = 4; g.strokeStyle = TXT_HALO; g.lineJoin = 'round'; g.strokeText(s, x, y); g.fillStyle = o.color || INK; g.fillText(s, x, y);
  }
  function circle(cx, cy, r) { g.beginPath(); g.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2); }
  function diskScreen(which) { var d = which === 'R' ? L.R : L.A, c = toScreen(d.cx, d.cy); return { x: c.x, y: c.y, k: st.scale }; }
  function render() {
    var sheet = sheets[orient], f = freeBox();
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
    if (sheet) { var tl = toScreen(-L.W / 2, -L.H / 2), k = st.scale / sheet.RsPx; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(sheet.cv, tl.x, tl.y, sheet.w * k, sheet.h * k); }
    var A = diskScreen('A'), R = diskScreen('R'), S = st.scale;
    [['R', R], ['A', A]].forEach(function (q) {
      var which = q[0], c = q[1], rim = which === 'R' ? M.RIM_R : M.RIM_A, rimPx = M.rho(rim) * S, band = M.RIM_R;
      // proximity rings (θ relatif ke rim: ±6,5° / ±19,5° / ±32,5°) — Within / Adjacent / Peripheral
      if (on('d_rings')) {
        var TH = ctx.DATA.thresholds, inside = which === 'R' ? [TH.within, TH.adjacent, TH.peripheral] : [TH.within, TH.adjacent, TH.peripheral];
        inside.forEach(function (d, i) { var th = rim - d; if (th <= 0) return; g.beginPath(); g.arc(c.x, c.y, M.rho(th) * S, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,214,170,' + (i === 0 ? 0.5 : 0.34) + ')'; g.lineWidth = 1; g.setLineDash([4, 5]); g.stroke(); });
        g.setLineDash([]);
      }
      // pita Scar ±6,5° (annulus) di sekitar rim
      if (on('band')) {
        var inner = M.rho(rim - ctx.DATA.thresholds.within) * S, outer = M.rho(Math.min(rim + ctx.DATA.thresholds.within, 179.9)) * S, maxR = (which === 'R' ? L.rhoMaxR : L.rhoMaxA) * S;
        g.save(); circle(c.x, c.y, Math.min(outer, maxR)); g.arc(c.x, c.y, inner, 0, Math.PI * 2, true); g.fillStyle = 'rgba(255,90,36,.16)'; g.fill('evenodd'); g.restore();
      }
      // kurva Scar = lingkaran sempurna
      if (on('curve')) {
        circle(c.x, c.y, rimPx); g.strokeStyle = 'rgba(255,90,36,.2)'; g.lineWidth = 7; g.stroke();
        g.save(); g.shadowColor = 'rgba(255,110,50,.9)'; g.shadowBlur = 6; circle(c.x, c.y, rimPx); g.strokeStyle = '#ff7a3d'; g.lineWidth = 2.2; g.stroke(); g.restore();
      }
      // anotasi azimut Scar di rim (label di DALAM rim supaya tidak bertabrakan dengan cakram lawan di celah): puncak (0), lereng timur (+90), lereng barat (−90), palung (±180)
      if (on('d_azi')) {
        [[0, 'puncak +17°'], [90, 'lereng timur +90°'], [-90, 'lereng barat −90°'], [180, 'palung ±180°']].forEach(function (an) {
          var p = M.diskXY(which, which === 'R' ? M.RIM_R : 180 - M.RIM_A, an[0], orient), px = c.x + p.x * S, py = c.y + p.y * S, dxn = p.x / (p.r || 1), dyn = p.y / (p.r || 1);
          g.beginPath(); g.moveTo(px - dxn * 9, py - dyn * 9); g.lineTo(px + dxn * 7, py + dyn * 7); g.strokeStyle = '#ffc39a'; g.lineWidth = 1.8; g.stroke();
          text(an[1], px - dxn * 15, py - dyn * 15, { font: '600 10.5px "IBM Plex Mono", monospace', color: '#ffc39a', align: dxn > 0.5 ? 'right' : dxn < -0.5 ? 'left' : 'center', base: dyn > 0.5 ? 'bottom' : dyn < -0.5 ? 'top' : 'middle' });
        });
      }
      // judul cakram: di atas cakram (peta datar-lebar) atau di bawah tanda pusat (peta tegak)
      var cr = which === 'R' ? 'Cakram Rhykar · θ ≤ 72,5° · 34,96 % luas' : 'Cakram Aëris · θ′ ≤ 107,5° · 65,04 % luas', sub = which === 'R' ? 'pusat −55,5° / 0°' : 'pusat +55,5° / 180° (antipode · Libbāl)';
      if (orient === 'h') { var topY = Math.max(c.y - (which === 'R' ? L.rhoMaxR : L.rhoMaxA) * S - 14, 80); text(cr, c.x, topY, { font: '600 12px "Cinzel", serif', color: '#e8e3d7' }); text(sub, c.x, topY + 15, { font: '500 10.5px "IBM Plex Mono", monospace', color: '#cfd8dc' }); }
      else { var ty = c.y + rimPx * 0.52; text(cr, c.x, ty, { font: '600 10.5px "Cinzel", serif', color: '#e8e3d7' }); text(sub, c.x, ty + 14, { font: '500 10px "IBM Plex Mono", monospace', color: '#cfd8dc' }); }
      g.beginPath(); g.moveTo(c.x - 5, c.y); g.lineTo(c.x + 5, c.y); g.moveTo(c.x, c.y - 5); g.lineTo(c.x, c.y + 5); g.strokeStyle = 'rgba(244,238,225,.55)'; g.lineWidth = 1; g.stroke();
    });
    // zona Castra Birath (cincin memudar, bukan titik presisi)
    if (zonePlace && on('zone')) {
      [1, 0.72, 0.46, 0.24].forEach(function (k, i) {
        M.project(zonePlace.lat, zonePlace.lon, L).forEach(function (pr) {
          var d = pr.disk === 'R' ? L.R : L.A; g.beginPath();
          for (var b = 0; b <= 60; b++) { var q = C.destination(zonePlace.lat, zonePlace.lon, b * 6, zonePlace.zone_r * k), pp = M.polar(q[0], q[1]), xy = M.diskXY(pr.disk, pp.theta, pp.alpha, orient), s = toScreen(d.cx + xy.x, d.cy + xy.y); if (b) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y); }
          g.closePath(); g.fillStyle = 'rgba(255,106,43,.09)'; g.fill(); if (i === 0) { g.setLineDash([3, 4]); g.strokeStyle = '#ffb08a'; g.lineWidth = 1.2; g.stroke(); g.setLineDash([]); }
        });
      });
    }
    // graticule 15° dan tiga meridian (garis lengkung pada proyeksi)
    if (on('grat') || on('mer')) { drawGrat(); }
    if (meas) drawMeas();
    placePins();
    root.setAttribute('data-z', String(clamp(Math.floor(2 + 2.2 * Math.log(st.scale / fitScale()) / Math.LN2), 0, 7)));
    updateCompass();
  }
  function polyline(pts) {   // pts: [lat, lon] padat; gambar per cakram, memutus garis di luar cakram
    ['R', 'A'].forEach(function (which) {
      var d = which === 'R' ? L.R : L.A, mx = which === 'R' ? M.RIM_R + M.MARGIN : M.RIM_A + M.MARGIN, open = false; g.beginPath();
      pts.forEach(function (q) {
        var pp = M.polar(q[0], q[1]), th = which === 'R' ? pp.theta : 180 - pp.theta;
        if (th > mx) { open = false; return; }
        var xy = M.diskXY(which, pp.theta, pp.alpha, orient), s = toScreen(d.cx + xy.x, d.cy + xy.y);
        if (open) g.lineTo(s.x, s.y); else { g.moveTo(s.x, s.y); open = true; }
      });
      g.stroke();
    });
  }
  // hasil ukur: busur besar (putus di luar cakram), titik awal dan tujuan di setiap cakram yang memuatnya, serta jarak di titik tujuan
  function drawMeas() {
    if (meas.pts) {
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([]); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 5; polyline(meas.pts);
      g.setLineDash([6, 5]); g.strokeStyle = '#fff3d6'; g.lineWidth = 2.2; polyline(meas.pts); g.restore();
    }
    [meas.a, meas.b].forEach(function (q, i) {
      if (!q) return;
      M.project(q[0], q[1], L).forEach(function (pr) {
        var s = toScreen(pr.x, pr.y); g.beginPath(); g.arc(s.x, s.y, 5.5, 0, Math.PI * 2); g.fillStyle = '#ff7a3d'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
        if (i === 1 && meas.label) text(meas.label, s.x + 12, s.y - 12, { align: 'left', font: '600 12px "IBM Plex Sans", system-ui, sans-serif', color: '#fff3d6' });
      });
    });
  }
  function dense(a, b, step) { var n = Math.max(2, Math.ceil(Math.abs(b[0] - a[0] || b[1] - a[1]) / step)), out = []; for (var i = 0; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]); return out; }
  function drawGrat() {
    g.lineWidth = 1;
    if (on('grat')) {
      for (var lo = -180; lo < 180; lo += 15) { if (lo % 180 === 0 && lo !== 0) continue; g.strokeStyle = 'rgba(241,234,216,' + (lo % 30 === 0 ? 0.24 : 0.12) + ')'; polyline(dense([-89.5, lo], [89.5, lo], 1.5)); }
      for (var la = -75; la <= 75; la += 15) { g.strokeStyle = 'rgba(241,234,216,' + (la === 0 ? 0.34 : (la % 30 === 0 ? 0.24 : 0.12)) + ')'; polyline(dense([la, -180], [la, 180], 1.5)); }
    }
    if (on('mer')) ctx.styles.MER.forEach(function (m) { g.strokeStyle = m.col; g.globalAlpha = 0.6; g.lineWidth = 1.3; g.setLineDash([7, 6]); [m.lon, m.lon + 360, m.lon - 360].forEach(function (x) { if (x >= -180 && x <= 180) polyline(dense([-89.5, x], [89.5, x], 1.5)); }); g.setLineDash([]); g.globalAlpha = 1; });
  }
  var tmpPins = [];
  function placePins() {
    var vis = function (p) { return ctx.visible(p); }, mk = on('markers'), an = on('anom'), obst = [], items = [];
    pins.forEach(function (n) {
      var show = mk && vis(n.p), best = null;
      if (show) { var prs = M.project(n.p.lat, n.p.lon, L); if (prs.length) { best = prs[0]; if (prs.length > 1) best = prs[0].theta <= M.RIM_R ? prs[0] : prs[1]; } }
      if (!best) { if (n.shown) { n.wrap.style.display = 'none'; n.shown = false; } return; }
      var d = best.disk === 'R' ? L.R : L.A, s = toScreen(d.cx + (best.x - d.cx), d.cy + (best.y - d.cy));
      var f = freeBox(); if (s.x < f.l - 30 || s.x > W + 30 || s.y < -30 || s.y > f.h + 30) { if (n.shown) { n.wrap.style.display = 'none'; n.shown = false; } return; }
      var sp = toScreen(best.x, best.y); n.sx = sp.x; n.sy = sp.y;
      n.wrap.style.transform = 'translate(' + (sp.x - n.size / 2).toFixed(1) + 'px,' + (sp.y - n.size / 2).toFixed(1) + 'px)';
      if (!n.shown) { n.wrap.style.display = ''; n.shown = true; }
      obst.push([sp.x - n.size / 2, sp.y - n.size / 2, sp.x + n.size / 2, sp.y + n.size / 2, n]); if (n.nm) { n.nm.classList.remove('hide'); items.push({ sx: sp.x, sy: sp.y, size: n.size, nm: n.nm, p: n.p, ref: n }); }
    });
    anoms.forEach(function (n) {
      var prs = an ? M.project(n.a.lat, n.a.lon, L) : []; if (!prs.length) { if (n.shown) { n.wrap.style.display = 'none'; n.shown = false; } return; }
      var best = prs[0].theta <= M.RIM_R ? prs[0] : prs[prs.length - 1], sp = toScreen(best.x, best.y); n.sx = sp.x; n.sy = sp.y;
      n.wrap.style.transform = 'translate(' + sp.x.toFixed(1) + 'px,' + sp.y.toFixed(1) + 'px)'; if (!n.shown) { n.wrap.style.display = ''; n.shown = true; }
    });
    C.declutterNames(items, obst, ctx.DECL);
  }

  // ---------------------------------------------------------------- hover / klik / kompas
  function pointToLatLon(px, py) { var p = toSheet(px, py), u = M.unproject(p.x, p.y, L); return u; }
  function pinAt(px, py, mult) {
    mult = mult || 1; var best = null, bd = 1e9;
    pins.forEach(function (n) { if (!n.shown) return; var d = Math.hypot(n.sx - px, n.sy - py); if (d <= (n.size / 2 + 4) * mult && d < bd) { bd = d; best = { id: n.p.id, name: n.p.name }; } });
    if (best) return best;
    anoms.forEach(function (n) { if (!n.shown) return; var d = Math.hypot(n.sx - px, n.sy - py); if (d <= 18 * mult && d < bd) { bd = d; best = { id: n.a.id, name: n.a.name }; } });
    return best;
  }
  function refPoint() { if (st.hover) return { lat: st.hover.lat, lon: st.hover.lon, src: 'kursor' }; var f = focus(); return { lat: f.lat, lon: f.lon, src: 'pusat' }; }
  function screenAngle(lat, lon, brg) {
    var a = M.project(lat, lon, L), q = C.destination(lat, lon, brg, 0.5), b = M.project(q[0], q[1], L); if (!a.length || !b.length) return 0;
    var pa = a[0], pb = b.filter(function (x) { return x.disk === pa.disk; })[0] || b[0]; var dx = pb.x - pa.x, dy = pb.y - pa.y; return Math.atan2(dx, -dy) * R2D;
  }
  var lastRef = 0;
  function updateCompass() {
    var now = performance.now(); if (now - lastRef < 50) return; lastRef = now;
    var r = refPoint(), sc = C.scarCompass(r.lat, r.lon);
    if (r.src === 'pusat') ctx.readout({ lat: r.lat, lng: r.lon });
    ctx.compass.update({ lat: r.lat, lon: r.lon, source: r.src, northDeg: screenAngle(r.lat, r.lon, 0), scarDeg: sc.singular ? 0 : screenAngle(r.lat, r.lon, sc.bearing), behind: false });
  }
  function hoverMove(e) {
    var r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top; st.hoverPx = { x: px, y: py };
    var u = pointToLatLon(px, py); st.hover = u ? { lat: u.lat, lon: u.lon, disk: u.disk, theta: u.theta, alpha: u.alpha } : null; if (u) ctx.readout({ lat: u.lat, lng: u.lon });
    var h = pinAt(px, py); if (h) { tipEl.textContent = h.name; tipEl.hidden = false; tipEl.style.transform = 'translate(' + Math.round(px + 14) + 'px,' + Math.round(py + 14) + 'px)'; root.classList.add('pick'); } else { tipEl.hidden = true; root.classList.remove('pick'); }
    lastRef = 0; updateCompass();
  }
  function openPlace(id) { var p = ctx.placeById[id]; if (!p) return; ctx.card.open(ctx.cards.place(p), 'place:' + id, id); }
  function closeCard() { ctx.card.close(); }

  // ---------------------------------------------------------------- kontrol: geser, zoom (roda / cubit / keyboard)
  var ptrs = {}, nPtr = 0, g0 = null, pinch = null;
  cv.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return; try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; nPtr++;
    if (nPtr === 1) { g0 = { x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, t0: performance.now(), moved: false }; pinch = null; }
    else if (nPtr === 2) { var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: st.scale }; g0 = null; }
  });
  cv.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) { if (e.pointerType !== 'touch') hoverMove(e); return; }
    ptrs[e.pointerId].x = e.clientX; ptrs[e.pointerId].y = e.clientY;
    if (nPtr === 2 && pinch) { var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]]; st.scale = pinch.s0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0; limitView(); draw(); return; }
    if (nPtr === 1 && g0) {
      if (!g0.moved && Math.hypot(e.clientX - g0.x0, e.clientY - g0.y0) > 4) { g0.moved = true; root.classList.add('dragging'); tipEl.hidden = true; }
      if (g0.moved) { st.cx -= (e.clientX - g0.lx) / st.scale; st.cy -= (e.clientY - g0.ly) / st.scale; g0.lx = e.clientX; g0.ly = e.clientY; limitView(); draw(); }
    }
  });
  function up(e) {
    if (!ptrs[e.pointerId]) return; delete ptrs[e.pointerId]; nPtr = Math.max(0, nPtr - 1); try { cv.releasePointerCapture(e.pointerId); } catch (x) {}
    if (g0 && nPtr === 0) {
      root.classList.remove('dragging');
      if (e.type === 'pointerup' && !g0.moved && performance.now() - g0.t0 < 700) click(e);
      g0 = null;
    }
    if (nPtr < 2) pinch = null;
    if (nPtr === 1) { var k = Object.keys(ptrs)[0], p = ptrs[k]; g0 = { x0: p.x, y0: p.y, lx: p.x, ly: p.y, t0: performance.now(), moved: true }; }
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', function (e) { if (!ptrs[e.pointerId]) { st.hover = null; st.hoverPx = null; tipEl.hidden = true; root.classList.remove('pick'); lastRef = 0; updateCompass(); } });
  function zoomAt(px, py, f) { var before = toSheet(px, py), fs = fitScale(); st.scale = clamp(st.scale * f, fs * 0.55, fs * 14); var after = toSheet(px, py); st.cx += before.x - after.x; st.cy += before.y - after.y; limitView(); draw(); }
  cv.addEventListener('wheel', function (e) { e.preventDefault(); var r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.0015))); }, { passive: false });
  cv.addEventListener('dblclick', function (e) { var r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 1.8); });
  cv.addEventListener('keydown', function (e) {
    var step = 60 / st.scale * (e.shiftKey ? 3 : 1), h = true;
    if (e.key === 'ArrowLeft') st.cx -= step; else if (e.key === 'ArrowRight') st.cx += step; else if (e.key === 'ArrowUp') st.cy -= step; else if (e.key === 'ArrowDown') st.cy += step;
    else if (e.key === '+' || e.key === '=') { var f = freeBox(); zoomAt(f.l + f.w / 2, f.t + (f.h - f.t) / 2, 1.25); return e.preventDefault(); } else if (e.key === '-' || e.key === '_') { var f2 = freeBox(); zoomAt(f2.l + f2.w / 2, f2.t + (f2.h - f2.t) / 2, 0.8); return e.preventDefault(); }
    else if (e.key === '0') { fitAll(); } else h = false;
    if (h) { e.preventDefault(); limitView(); draw(); }
  });
  function click(e) {
    var r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, h = pinAt(px, py, e.pointerType === 'touch' ? 1.9 : 1);
    if (st.meas) { var mpl = h && ctx.placeById[h.id], mu = pointToLatLon(px, py); if (mpl && !mpl.label_only) ctx.measureAt(mpl.lat, mpl.lon); else if (mu) ctx.measureAt(mu.lat, mu.lon); return; }   // mode ukur: marker = titik tepat, selain itu titik di cakram
    if (h) { openPlace(h.id); return; }
    var u = pointToLatLon(px, py); if (u) { ctx.readout({ lat: u.lat, lng: u.lon }); st.hover = { lat: u.lat, lon: u.lon }; }
    closeCard();
  }

  // ---------------------------------------------------------------- dock dan pengendali
  function btn(id, label, title, fn, icon) { var b = document.createElement('button'); b.type = 'button'; b.className = 'tbtn'; b.id = id; b.title = title; b.setAttribute('aria-label', title); b.innerHTML = (icon || '') + '<span class="lbl">' + label + '</span>'; b.addEventListener('click', fn); dockEl.appendChild(b); return b; }
  var IC = function (p) { return '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' + p + '</svg>'; };
  btn('d-fit', 'Pas layar', 'Pas layar: tampilkan kedua cakram', function () { fitAll(); draw(); }, IC('<rect x="2.5" y="4" width="11" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/>'));
  btn('d-r', 'Rhykar', 'Fokus cakram Rhykar', function () { focusDisk('R'); }, IC('<circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/>'));
  btn('d-a', 'Aëris', 'Fokus cakram Aëris', function () { focusDisk('A'); }, IC('<circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/>'));
  var bOr = btn('d-or', 'Orientasi', 'Ganti orientasi: otomatis → datar → tegak', function () { orientPref = orientPref === 'auto' ? 'h' : orientPref === 'h' ? 'v' : 'auto'; LS.set('rh-d-orient', orientPref); bOr.title = 'Orientasi: ' + (orientPref === 'auto' ? 'otomatis' : orientPref === 'h' ? 'datar' : 'tegak'); resize(); }, IC('<path d="M3 5h10M3 8h6M3 11h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'));
  function focusDisk(which) { var d = which === 'R' ? L.R : L.A, rm = which === 'R' ? L.rhoMaxR : L.rhoMaxA, f = freeBox(); st.cx = d.cx; st.cy = d.cy; st.scale = Math.min(f.w, f.h) * 0.46 / rm; limitView(); draw(); }
  var ctl = {
    isShown: function () { return st.shown; },
    show: function (focus0, o) {
      root.hidden = false; dockEl.hidden = false; st.shown = true; resize(); orient = pickOrient(); L = M.layout(orient);
      fitAll(); var z = focus0 && focus0.zoom != null ? focus0.zoom : 2;
      if (focus0 && z >= 3) { var pr = M.project(focus0.lat, focus0.lon, L)[0]; if (pr) { st.cx = pr.x; st.cy = pr.y; st.scale = fitScale() * Math.min(5, Math.pow(2, (z - 2) / 1.6)); limitView(); } }
      return buildSheet(orient).then(function () { draw(); ctx.syncLayerUI(); });
    },
    hide: function () { st.shown = false; st.meas = false; root.classList.remove('meas'); root.hidden = true; dockEl.hidden = true; closeCard(); busyEl.hidden = true; tipEl.hidden = true; },
    getFocus: function () { var f = focus(), z = clamp(2 + 1.6 * Math.log(st.scale / fitScale()) / Math.LN2, 0.5, 6); return { lat: clamp(f.lat, -85, 85), lon: C.lonN(f.lon), zoom: z }; },
    goPlace: function (p) { var pr = M.project(p.lat, p.lon, L); if (!pr.length) return; var b = pr[0].theta <= M.RIM_R || pr.length === 1 ? pr[0] : pr[1]; st.cx = b.x; st.cy = b.y; st.scale = Math.max(st.scale, fitScale() * (p.label_only ? 1.6 : 2.6)); limitView(); draw(); setTimeout(function () { if (!st.meas) openPlace(p.id); }, REDUCED ? 0 : 80); },
    goFaction: function (id, pts) { var la = 0, lo = [0, 0]; pts.forEach(function (q) { la += q[0]; var a = q[1] * D2R; lo[0] += Math.cos(a); lo[1] += Math.sin(a); }); var cLat = la / pts.length, cLon = Math.atan2(lo[1], lo[0]) * R2D, pr = M.project(cLat, cLon, L); if (!pr.length) return; st.cx = pr[0].x; st.cy = pr[0].y; st.scale = Math.max(st.scale, fitScale() * 2); limitView(); draw(); ctl.openFaction(id); },
    openFaction: function (id) { ctx.card.open(id === 'anusarri' ? ctx.cards.mandala(0) : ctx.cards.faction(id), 'fac:' + id); },
    /** Ukur jarak: app.js memegang keadaan; modul ini menangkap ketukan dan menggambar garis, titik, dan jarak. */
    setMeasure: function (m) { meas = m && m.a ? m : null; draw(); },
    _measure: function () { return meas; },
    setMeasureMode: function (on) { st.meas = !!on; root.classList.toggle('meas', st.meas); if (st.meas) { tipEl.hidden = true; root.classList.remove('pick'); } },
    closeCard: closeCard, relayout: function () { if (st.shown) resize(); },
    layerStatus: function () { var o = {}; Object.keys(LAY).forEach(function (k) { o[k] = { on: LAY[k].on, adapterDisk: !!LAY[k].adapterDisk, reason: LAY[k].reasonDisk || null }; }); return o; },
    info: function () { var s = sheets[orient]; return { orient: orient, scale: st.scale, fit: fitScale(), cx: st.cx, cy: st.cy, sheet: s ? { w: s.w, h: s.h, RsPx: s.RsPx, counts: s.counts, ms: s.ms } : null, layout: L, W: W, H: H, hover: st.hover, pins: pins.filter(function (n) { return n.shown; }).length }; },
    _project: function (lat, lon) { return M.project(lat, lon, L).map(function (p) { var s = toScreen(p.x, p.y); return { disk: p.disk, x: s.x, y: s.y }; }); },
    _unproject: function (px, py) { return pointToLatLon(px, py); }, _sheet: function () { return sheets[orient]; }, _state: st, _ctx: ctx
  };
  // adapterDisk: layer yang punya padanan di peta kerja (sisanya nonaktif dengan alasan)
  var DISK_OK = { grat: 1, mer: 1, band: 1, curve: 1, arcs: 1, markers: 1, anom: 1, zone: 1, d_rings: 1, d_azi: 1 };
  Object.keys(LAY).forEach(function (k) { if (DISK_OK[k]) LAY[k].adapterDisk = { draw: true }; else if (!LAY[k].only3D) LAY[k].reasonDisk = 'Peta kerja dual-disk sengaja minimal (Scar, cincin Scar Proximity, graticule, marker); lapisan ini tersedia di peta datar 2D dan globe 3D.'; });
  ctx.onEvent(function (type) { if (!st.shown) return; if (type === 'layer' || type === 'filters') draw(); else if (type === 'layout') ctl.relayout(); });
  window.__rhDisk = ctl;
  if (window.ResizeObserver) new ResizeObserver(function () { if (st.shown) resize(); }).observe(root); else window.addEventListener('resize', function () { if (st.shown) resize(); });
  return Promise.resolve(ctl);
};
})(typeof window !== 'undefined' ? window : globalThis);
