/* Master Map Rhykaris — kompas fungsional (2D dan 3D). Jarum utara + jarum kedua yang menunjuk ke TITIK TERDEKAT
   pada kurva The Scar dari titik acuan (kursor, atau pusat tampilan bila tidak ada kursor).
   Matematikanya ada di RH.core.scarCompass; modul ini hanya menggambar. Sudut layar dihitung oleh pemanggil
   (2D: RH.core.screenDir2D · 3D: proyeksi kamera), supaya satu widget melayani kedua tampilan. */
(function (root) {
'use strict';
var RH = root.RH = root.RH || {};
var C = RH.core;
var NS = 'http://www.w3.org/2000/svg';

RH.compass = {
  /** Buat widget di dalam `parent` dan kembalikan {el, update(state)}. */
  create: function (parent) {
    var el = document.createElement('div');
    el.id = 'compass'; el.className = 'v2-chrome'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Kompas: arah utara dan arah ke kurva The Scar');
    var ticks = '';
    for (var i = 0; i < 24; i++) { var a = i * 15, long = i % 6 === 0, r1 = 52, r2 = long ? 45 : 48.5, rad = a * Math.PI / 180;
      ticks += '<line x1="' + (60 + r1 * Math.sin(rad)).toFixed(2) + '" y1="' + (60 - r1 * Math.cos(rad)).toFixed(2) + '" x2="' + (60 + r2 * Math.sin(rad)).toFixed(2) + '" y2="' + (60 - r2 * Math.cos(rad)).toFixed(2) + '" stroke="currentColor" stroke-opacity="' + (long ? '.55' : '.28') + '" stroke-width="' + (long ? 1.4 : 1) + '"/>'; }
    el.innerHTML =
      '<svg class="cp-dial" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
        '<circle cx="60" cy="60" r="56" fill="var(--panel-2)" stroke="var(--line-2)"/>' + ticks +
        '<g class="cp-needle cp-n"><path d="M60 14L64.6 60H55.4z" fill="var(--ink)" fill-opacity=".92"/><path d="M60 106L64.6 60H55.4z" fill="var(--ink-3)" fill-opacity=".5"/>' +
          '<text x="60" y="11.5" text-anchor="middle" font-size="9" font-family="var(--f-ui)" font-weight="700" fill="var(--ink)">U</text></g>' +
        '<g class="cp-needle cp-s"><path d="M60 22L63.6 60H56.4z" fill="var(--scar)"/><circle cx="60" cy="22" r="3.4" fill="var(--scar-2)" stroke="var(--scar)" stroke-width="1"/></g>' +
        '<circle cx="60" cy="60" r="4" fill="var(--bg)" stroke="var(--ink-2)" stroke-width="1.4"/>' +
      '</svg>' +
      '<div class="cp-txt" aria-live="off"><div class="cp-key"><span class="cp-dot n"></span>utara <span class="cp-dot s"></span>kurva Scar</div>' +
        '<div class="cp-l1">—</div><div class="cp-l2"></div><div class="cp-l3"></div></div>';
    parent.appendChild(el);
    var nN = el.querySelector('.cp-n'), nS = el.querySelector('.cp-s'), l1 = el.querySelector('.cp-l1'), l2 = el.querySelector('.cp-l2'), l3 = el.querySelector('.cp-l3');
    var api = { el: el, last: null };
    /**
     * state: { lat, lon, northDeg, scarDeg (sudut LAYAR searah jarum jam dari atas), behind (3D: titik di sisi belakang globe), source ('kursor'|'pusat') }
     * Nilai jarak, cincin dan sisi dihitung di sini dari RH.core.scarCompass(lat, lon) — sama persis dengan readout.
     */
    api.update = function (st) {
      api.last = st;
      if (!st || st.lat == null) { el.classList.add('idle'); l1.textContent = '—'; l2.textContent = ''; l3.textContent = ''; return; }
      var r = C.scarCompass(st.lat, st.lon);
      api.solve = r;
      el.classList.remove('idle'); el.classList.toggle('behind', !!st.behind);
      nN.style.transform = 'rotate(' + (st.behind ? 0 : (st.northDeg || 0)) + 'deg)';
      if (r.singular) {
        nS.style.opacity = '0';
        l1.textContent = 'Scar: —'; l2.textContent = 'arah tak terdefinisi';
        l3.textContent = r.centerDeg < 90 ? '(tepat di pusat lingkaran Scar)' : '(tepat di antipode pusat Scar)';
      } else {
        nS.style.opacity = st.behind ? '.35' : '1';
        nS.style.transform = 'rotate(' + (st.scarDeg || 0) + 'deg)';
        l1.textContent = 'Scar ' + C.fint(r.distKm) + ' km · ' + C.fmt(r.distDeg, 1) + '°';
        l2.textContent = 'azimut ' + C.fmt(r.bearing, 0) + '° ' + C.cardinal(r.bearing);
        l3.textContent = C.PROX_ID[r.ring] + ' · sisi ' + r.side;
      }
      if (st.behind) l3.textContent = 'titik acuan di sisi belakang globe';
      el.setAttribute('aria-label', 'Kompas. ' + l1.textContent + '. ' + l2.textContent + '. ' + l3.textContent + (st.source ? '. Acuan: ' + st.source : ''));
    };
    el.classList.add('idle');
    return api;
  }
};
})(typeof window !== 'undefined' ? window : globalThis);
