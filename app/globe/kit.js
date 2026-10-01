/* Master Map Rhykaris — globe 3D (v1.5): namespace bersama dan util kecil.
   Berkas app/globe/*.js digabung menjadi satu skrip yang HANYA dievaluasi saat pengguna pertama kali masuk 3D.
   Kerangka adegan: planet berjari-jari 1; y = utara, z → bujur 0°, x → bujur 90° BT (timur ke kanan dari kamera di +Z). */
(function (root) {
'use strict';
var RH = root.RH = root.RH || {};
var G = RH.G = {};
var D2R = Math.PI / 180, R2D = 180 / Math.PI;
G.D2R = D2R; G.R2D = R2D;
/** lat/lon (derajat) → vektor adegan [x, y, z] dengan jari-jari r. Sama dengan RH.moons: (y_P, z_P, x_P). */
G.vec = function (lat, lon, r) { var la = lat * D2R, lo = lon * D2R, c = Math.cos(la); r = r == null ? 1 : r; return [r * c * Math.sin(lo), r * Math.sin(la), r * c * Math.cos(lo)]; };
G.latlon = function (x, y, z) { var r = Math.sqrt(x * x + y * y + z * z) || 1; return { lat: Math.asin(Math.max(-1, Math.min(1, y / r))) * R2D, lon: Math.atan2(x, z) * R2D }; };
G.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
G.ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
G.el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
G.hex = function (h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
/** sudut sudut-layar → derajat searah jarum jam dari atas (dx ke kanan, dy ke bawah). */
G.screenAngle = function (dx, dy) { return Math.atan2(dx, -dy) * R2D; };
})(typeof window !== 'undefined' ? window : globalThis);
