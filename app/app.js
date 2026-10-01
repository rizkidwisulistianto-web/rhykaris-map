(function () {
'use strict';
var started = false;
function bootErr(msg) {
  var el = document.createElement('div'); el.className = 'boot-err';
  el.innerHTML = '<div><b>Peta tidak bisa dimuat.</b><br>' + msg + '</div>';
  document.getElementById('app').appendChild(el);
}
function boot() {
  if (started) return;
  if (!window.L) return;
  started = true;
  var be = document.querySelector('.boot-err'); if (be) be.parentNode.removeChild(be);
  try { main(); } catch (e) { console.error(e); bootErr('Terjadi galat saat menyusun peta: ' + (e && e.message ? e.message : e)); }
}
window.__rhBoot = boot;
window.__rhFail = function () { if (!started) bootErr('Pustaka Leaflet gagal diunduh dari CDN (cdnjs, unpkg, jsDelivr). Peta ini butuh koneksi internet saat dibuka.'); };
setTimeout(function () { if (!started && !window.L) bootErr('Pustaka Leaflet gagal diunduh dari CDN (cdnjs, unpkg, jsDelivr). Peta ini butuh koneksi internet saat dibuka.'); }, 9000);

function main() {
  // ================================================================ data & util
  var DATA = JSON.parse(document.getElementById('rh-data').textContent);
  var BASE = document.getElementById('rh-base').textContent.trim();
  var GRID = document.getElementById('rh-grid').textContent.trim();
  var C = RH.core; C.configure(DATA.stats, DATA.thresholds);
  var D2R = C.D2R, R2D = C.R2D, R_KM = DATA.stats.radius_km, KM_DEG = C.cfg.KM_DEG;
  var SC = C.SC;
  var TH = DATA.thresholds;
  var OFFS = [-360, 0, 360];
  var AUR = DATA.stats.aurelia_lon;
  var measuring = false, mA = null;
  var placeById = {}; DATA.places.forEach(function (p) { placeById[p.id] = p; });
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LS = C.LS;
  var esc = C.esc, fmt = C.fmt, fint = C.fint, lonN = C.lonN, fLat = C.fLat, fLon = C.fLon, norm = C.norm;
  var scarD = C.scarD, prox = C.prox, PROX_ID = C.PROX_ID, circlePt = C.circlePt, arcPts = C.arcPts, shift = C.shift;
  var EPI = C.EPI, RING = C.RING;

  // ================================================================ tema
  var root = document.documentElement;
  var theme = LS.get('rh-theme', null);
  if (theme) root.setAttribute('data-theme', theme);
  document.getElementById('btn-theme').addEventListener('click', function () {
    var cur = root.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    var nx = cur === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', nx); LS.set('rh-theme', nx);
  });

  // ================================================================ panel samping (diatur sebelum peta agar padding awal tepat)
  var body = document.body;
  var panelOpen = LS.get('rh-panel', window.innerWidth > 760);
  function setPanel(o) { panelOpen = o; body.classList.toggle('panel-closed', !o); document.getElementById('btn-panel').setAttribute('aria-expanded', String(o)); LS.set('rh-panel', o); setTimeout(function () { map.invalidateSize(); }, 50); }
  document.getElementById('btn-panel').addEventListener('click', function () { setPanel(!panelOpen); });
  setPanel(panelOpen);
  function insets() {  // ruang peta yang tertutup panel: {l, b}
    var pr = document.getElementById('panel').getBoundingClientRect(), W = window.innerWidth;
    if (pr.width < W * 0.8) return { l: Math.max(0, pr.right + 8), b: 0 };
    return { l: 0, b: Math.max(0, window.innerHeight - pr.top) };
  }

  // ================================================================ peta
  // Planet itu bola: bujur 180° BT bersambung dengan 180° BB (Ellumāt & Libbāl tepat di garis itu).
  // CRS.Simple dibuat "berbungkus" (wrapLng) supaya geser horizontal berputar mulus tanpa batas (worldCopyJump),
  // bukan tiga salinan dunia yang mentok di ujung.
  var CRS_WRAP = L.extend({}, L.CRS.Simple, { infinite: false, wrapLng: [-180, 180] });
  function minZoomFor() { var w = document.getElementById('map').clientWidth || window.innerWidth;
    return Math.max(-0.5, Math.ceil(Math.log(w / 540) / Math.LN2 * 4) / 4); }   // paling jauh ~1,5 lebar dunia di layar
  var map = L.map('map', { crs: CRS_WRAP, worldCopyJump: true, minZoom: minZoomFor(), maxZoom: 6.5, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110,
    maxBounds: [[-110, -100000], [110, 100000]], maxBoundsViscosity: 0.7, attributionControl: false, zoomControl: false, inertia: true, fadeAnimation: !REDUCED, zoomAnimation: !REDUCED });
  window.addEventListener('resize', function () { map.setMinZoom(minZoomFor()); });
  window.__rhMap = map;
  L.control.zoom({ position: 'topright', zoomInTitle: 'Perbesar', zoomOutTitle: 'Perkecil' }).addTo(map);
  function pane(n, z, pe) { var p = map.createPane(n); p.style.zIndex = z; if (pe === false) p.style.pointerEvents = 'none'; return p; }
  pane('base', 200, false); pane('grat', 320, false); pane('contour', 330, false); pane('region', 360); pane('terr', 390); pane('mandala', 385);
  pane('scar', 420); pane('route', 450); pane('lbl', 580); pane('measure', 690, false);
  OFFS.forEach(function (dx) { L.imageOverlay(BASE, [[-90, -180 + dx], [90, 180 + dx]], { pane: 'base', interactive: false }).addTo(map); });
  var insetEl = document.getElementById('rh-inset');
  if (insetEl && DATA.inset) { var IB = DATA.inset.b, ISRC = insetEl.textContent.trim();
    OFFS.forEach(function (dx) { L.imageOverlay(ISRC, [[IB[0][0], IB[0][1] + dx], [IB[1][0], IB[1][1] + dx]], { pane: 'base', interactive: false }).addTo(map); }); }
  var svgTerr = L.svg({ pane: 'terr', padding: 0.5 }), svgReg = L.svg({ pane: 'region', padding: 0.5 }), svgScar = L.svg({ pane: 'scar', padding: 0.5 }),
      svgRoute = L.svg({ pane: 'route', padding: 0.5 }), svgMand = L.svg({ pane: 'mandala', padding: 0.5 });
  var cvCont = L.canvas({ pane: 'contour', padding: 0.3 }), cvGrat = L.canvas({ pane: 'grat', padding: 0.3 }), svgMeas = L.svg({ pane: 'measure', padding: 0.5 });
  function fitWorld(anim) { var ins = insets(); map.fitBounds([[-78, -182], [84, 182]], { animate: !!anim, paddingTopLeft: [ins.l + 6, 72], paddingBottomRight: [14, ins.b + 40] }); }
  if (window.innerWidth <= 760) map.setView([-4, 4], 2.25, { animate: false }); else fitWorld(false);
  function setZ() { map.getContainer().setAttribute('data-z', String(Math.max(0, Math.floor(map.getZoom() + 0.001)))); }
  map.on('zoomend', setZ); setZ();

  // ================================================================ layer registry
  // Setiap layer = {key, group, adapter2D, adapter3D, on}. State on/off dibagi oleh kedua tampilan: panel Layer yang sama
  // mengendalikan peta datar (adapter2D = grup Leaflet) dan globe (adapter3D didaftarkan modul globe saat 3D dimuat).
  // Layer khusus 3D (bulan, orbit, sumbu, ekliptika) tidak punya adapter2D dan hanya tampil di panel saat mode 3D.
  var LAYERS = {};
  var saved = LS.get('rh-layers-v1', {});
  var layerSubs = [];
  function onLayerEvent(fn) { layerSubs.push(fn); }
  function emitLayer(type, key, on) { layerSubs.forEach(function (fn) { try { fn(type, key, on); } catch (e) { console.error(e); } }); }
  function reg(key, group, def) { var on = key in saved ? saved[key] : def; LAYERS[key] = { key: key, group: group, adapter2D: group, adapter3D: null, only3D: false, on: on }; if (on && group) group.addTo(map); return group; }
  function reg3D(key, def) { var on = key in saved ? saved[key] : def; LAYERS[key] = { key: key, group: null, adapter2D: null, adapter3D: null, only3D: true, on: on }; }
  function setLayer(key, on) { var L0 = LAYERS[key]; if (!L0) return; L0.on = on; if (L0.group) { if (on) L0.group.addTo(map); else map.removeLayer(L0.group); } saved[key] = on; LS.set('rh-layers-v1', saved); refreshLegend(); emitLayer('layer', key, on); }

  // ================================================================ graticule & meridian
  var gGrat = L.layerGroup(), gMer = L.layerGroup(), gGratLbl = L.layerGroup().addTo(map);
  for (var lo = -540; lo <= 540; lo += 15) {
    if (lo % 180 === 0 && lo !== 0 && lo % 360 !== 0) continue;
    gGrat.addLayer(L.polyline([[-90, lo], [90, lo]], { renderer: cvGrat, color: '#f1ead8', weight: lo % 30 === 0 ? 0.9 : 0.5, opacity: lo % 30 === 0 ? 0.22 : 0.12, interactive: false }));
  }
  for (var la = -75; la <= 75; la += 15) gGrat.addLayer(L.polyline([[la, -540], [la, 540]], { renderer: cvGrat, color: '#f1ead8', weight: la === 0 ? 1.2 : (la % 30 === 0 ? 0.9 : 0.5), opacity: la === 0 ? 0.32 : (la % 30 === 0 ? 0.22 : 0.12), interactive: false }));
  var MER = [ { lon: 0, name: '0° historis', col: '#f2cf7a' }, { lon: AUR, name: 'meridian resmi', col: '#ff8a8a' }, { lon: 180, name: 'meridian Elvari', col: '#7fe0d6' } ];
  MER.forEach(function (m) { OFFS.concat([-720, 720]).forEach(function (dx) { var x = m.lon + dx; if (x < -560 || x > 560) return;
    gMer.addLayer(L.polyline([[-90, x], [90, x]], { renderer: cvGrat, color: m.col, weight: 1.3, opacity: 0.6, dashArray: '7 6', interactive: false })); }); });
  reg('grat', gGrat, true); reg('mer', gMer, true);
  function drawGratLabels() {
    gGratLbl.clearLayers(); if (!LAYERS.grat.on && !LAYERS.mer.on) return;
    var b = map.getBounds(), z = map.getZoom(), ppd = Math.pow(2, z), ins = insets();
    var step = 15 * ppd >= 64 ? 15 : (30 * ppd >= 64 ? 30 : 60);
    var cTop = map.containerPointToLatLng([0, 64]).lat, top = Math.min(cTop, 88.5);
    var west = map.containerPointToLatLng([ins.l + 6, 0]).lng;
    if (LAYERS.grat.on) {
      for (var x = Math.ceil(west / step) * step; x <= b.getEast(); x += step) {
        var t = lonN(x) === -180 ? '180°' : fLon(x).replace(',00', '');
        gGratLbl.addLayer(L.marker([top, x], { pane: 'lbl', interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: null, html: '<div class="grat-lbl" style="transform:translate(-50%,0)">' + t + '</div>' }) }));
      }
      var lstep = 15 * ppd >= 26 ? 15 : 30;
      for (var y = Math.ceil(Math.max(-89, b.getSouth()) / lstep) * lstep; y <= Math.min(89, b.getNorth()); y += lstep) {
        var tt = y === 0 ? 'ekuator' : fLat(y).replace(',00', '');
        gGratLbl.addLayer(L.marker([y, west], { pane: 'lbl', interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: null, html: '<div class="grat-lbl" style="transform:translate(0,-125%)">' + tt + '</div>' }) }));
      }
    }
    if (LAYERS.mer.on) MER.forEach(function (m) { [-360, 0, 360].forEach(function (dx) { var x = m.lon + dx; if (x < west || x > b.getEast()) return;
      var yl = map.containerPointToLatLng([0, 96]).lat; yl = Math.min(yl, 80);
      gGratLbl.addLayer(L.marker([yl, x], { pane: 'lbl', interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: null,
        html: '<div class="mer-lbl" style="color:' + m.col + '">' + esc(m.name) + '</div>' }) })); }); });
  }
  map.on('moveend zoomend', drawGratLabels);

  // ================================================================ kontur
  var gCL = L.layerGroup(), gCS = L.layerGroup();
  var CST = { 1000: ['#f3e6c8', 0.28, 0.6], 2500: ['#f3e6c8', 0.38, 0.8], 4500: ['#ffffff', 0.5, 0.9], '-200': ['#bfe6ee', 0.32, 0.6], '-3000': ['#9fd0dc', 0.22, 0.6], '-6000': ['#7fb6c6', 0.28, 0.8] };
  DATA.contours.forEach(function (c) { var st = CST[c.lvl]; OFFS.forEach(function (dx) {
    (c.lvl > 0 ? gCL : gCS).addLayer(L.polyline(shift(c.pts, dx), { renderer: cvCont, color: st[0], opacity: st[1], weight: st[2], interactive: false, smoothFactor: 1 })); }); });
  reg('cland', gCL, false); reg('csea', gCS, false);

  // ================================================================ THE SCAR
  var gBand = L.layerGroup(), gCurve = L.layerGroup(), gArcs = L.layerGroup(), gAnom = L.layerGroup();
  var outer = arcPts(-180, 180, SC.r + SC.half, 1), inner = arcPts(180, -180, SC.r - SC.half, 1);
  // pastikan ujung menyentuh ±180
  function fixEnds(a) { a[0] = [a[0][0], a[0][1] < 0 ? -180 : 180]; a[a.length - 1] = [a[a.length - 1][0], a[a.length - 1][1] < 0 ? -180 : 180]; return a; }
  outer = fixEnds(outer); inner = fixEnds(inner);
  var curve = fixEnds(arcPts(-180, 180, SC.r, 0.5));
  OFFS.forEach(function (dx) {
    gBand.addLayer(L.polygon(shift(outer.concat(inner), dx), { renderer: svgScar, stroke: false, fillColor: '#ff5a24', fillOpacity: 0.14, interactive: false }));
    gBand.addLayer(L.polyline(shift(outer, dx), { renderer: svgScar, color: '#ff9a5c', weight: 1, opacity: 0.55, dashArray: '2 5', interactive: false }));
    gBand.addLayer(L.polyline(shift(inner, dx), { renderer: svgScar, color: '#ff9a5c', weight: 1, opacity: 0.55, dashArray: '2 5', interactive: false }));
    gCurve.addLayer(L.polyline(shift(curve, dx), { renderer: svgScar, color: '#ff5a24', weight: 7, opacity: 0.16, interactive: false }));
    gCurve.addLayer(L.polyline(shift(curve, dx), { renderer: svgScar, color: '#ff7a3d', weight: 2.2, opacity: 0.95, className: 'scar-core', interactive: false }));
  });
  var ARCS = [ { id: 'culmen', a: [[-25, 25]] }, { id: 'latus_orientale', a: [[25, 135]] }, { id: 'ima', a: [[135, 180], [-180, -135]] }, { id: 'latus_occidentale', a: [[-135, -25]] } ];
  ARCS.forEach(function (A) { A.a.forEach(function (rg) {
    var poly = arcPts(rg[0], rg[1], SC.r + SC.half, 0.5).concat(arcPts(rg[1], rg[0], SC.r - SC.half, 0.5));
    OFFS.forEach(function (dx) { var pl = L.polygon(shift(poly, dx), { renderer: svgScar, stroke: false, fillColor: '#ff5a24', fillOpacity: 0.001 });
      pl.on('click', function (e) { openPlace(A.id, e.latlng); }); pl.bindTooltip(placeById[A.id] ? placeById[A.id].name : A.id, { sticky: true, className: 'rt', direction: 'top', offset: [0, -8] }); gArcs.addLayer(pl); });
  }); });
  [-135, -25, 25, 135].forEach(function (a) { var t = [circlePt(a, SC.r - SC.half - 1.5), circlePt(a, SC.r + SC.half + 1.5)];
    OFFS.forEach(function (dx) { gArcs.addLayer(L.polyline(shift(t, dx), { renderer: svgScar, color: '#ffc39a', weight: 1.4, opacity: 0.85, interactive: false })); }); });
  reg('band', gBand, true); reg('curve', gCurve, true); reg('arcs', gArcs, true);

  // ================================================================ ikon marker
  function glyph(cat, ringCol, dash) {
    var F = 'fill="rgba(16,22,28,.92)" stroke="' + ringCol + '" stroke-width="1.7"' + (dash ? ' stroke-dasharray="' + dash + '"' : '');
    var S = 'fill="#f4ecd8"', Ln = 'fill="none" stroke="#f4ecd8" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"';
    switch (cat) {
      case 'capital': return '<circle cx="12" cy="12" r="7.4" ' + F + '/><path d="M12 7.3l1.4 2.85 3.15.46-2.28 2.22.54 3.13L12 14.48l-2.81 1.48.54-3.13-2.28-2.22 3.15-.46z" ' + S + '/>';
      case 'city': return '<circle cx="12" cy="12" r="6" ' + F + '/><circle cx="12" cy="12" r="2.1" ' + S + '/>';
      case 'town': return '<circle cx="12" cy="12" r="4.8" ' + F + '/><circle cx="12" cy="12" r="1.5" ' + S + '/>';
      case 'port': return '<circle cx="12" cy="12" r="7.2" ' + F + '/><path d="M12 7.6v8.2M9.7 9.7h4.6M8.5 12.7a3.5 3.5 0 0 0 7 0" ' + Ln + '/>';
      case 'market': return '<circle cx="12" cy="12" r="7.2" ' + F + '/><path d="M12 7.8v8.4M8.8 10h6.4M8.8 10l-1.3 2.8h2.6zM15.2 10l-1.3 2.8h2.6z" ' + Ln + '/>';
      case 'fortress': return '<path d="M6.3 18.2v-8.4h2.2v1.7h1.6V9.8h3.8v1.7h1.6V9.8h2.2v8.4z" ' + F + '/>';
      case 'kingdom': return '<path d="M8.2 18.6V5.8" stroke="' + ringCol + '" stroke-width="1.7" stroke-linecap="round"/><path d="M8.6 6.3h8.2l-2.1 2.7 2.1 2.7H8.6z" ' + F + '/>';
      case 'ruin': return '<circle cx="12" cy="12" r="6.2" fill="rgba(16,22,28,.92)" stroke="' + ringCol + '" stroke-width="1.7" stroke-dasharray="2.6 1.9"/><path d="M8.6 15.4l6.8-6.8" ' + Ln + '/>';
      case 'hidden': return '<path d="M4.8 12s2.8-4.6 7.2-4.6 7.2 4.6 7.2 4.6-2.8 4.6-7.2 4.6S4.8 12 4.8 12z" ' + F + '/><circle cx="12" cy="12" r="2" ' + S + '/>';
      case 'landmark': return '<path d="M12 4.6l2 5.4 5.4 2-5.4 2-2 5.4-2-5.4-5.4-2 5.4-2z" ' + F + '/>';
      case 'gate': return '<path d="M7.2 18.2v-6.3a4.8 4.8 0 0 1 9.6 0v6.3h-2.7v-5.9a2.1 2.1 0 0 0-4.2 0v5.9z" ' + F + '/>';
      case 'mine': return '<path d="M7.6 9.6l2.2-2.8h4.4l2.2 2.8-4.4 8.1z" ' + F + '/><path d="M7.6 9.6h8.8M9.8 6.8L12 17.7l2.2-10.9" ' + Ln + '/>';
      case 'tribe': return '<path d="M12 6l6.6 11.4H5.4z" ' + F + '/><path d="M12 11.1l-2.3 6.3M12 11.1l2.3 6.3" ' + Ln + '/>';
      case 'oasis': return '<path d="M12 5.8s4.9 5.4 4.9 8.4a4.9 4.9 0 0 1-9.8 0c0-3 4.9-8.4 4.9-8.4z" ' + F + '/>';
      case 'anomaly': return '<circle cx="12" cy="12" r="7.2" ' + F + '/><path d="M12.9 12a.9.9 0 1 1-1.8 0 2.1 2.1 0 1 1 4.2 0 3.3 3.3 0 1 1-6.6 0" ' + Ln + '/>';
      case 'zone': return '<circle cx="12" cy="12" r="7.2" fill="rgba(60,16,6,.85)" stroke="' + ringCol + '" stroke-width="1.7" stroke-dasharray="1.2 1.8"/><path d="M10 10.1a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.3M12 15.8v.1" ' + Ln + '/>';
      default: return '<circle cx="12" cy="12" r="5.2" ' + F + '/>';
    }
  }
  var LBL_SIDE = { litus_primum: 'l', portus: 'l', nundina: 'l' };
  function markerHTML(p, size) {
    var r = RING[p.epi] || RING.inferensi;
    var badge = p.proposal ? '<circle cx="19.6" cy="4.6" r="2.6" fill="#f2b25a" stroke="#1a1208" stroke-width=".8"/>' : '';
    var cls = 'mk' + (p.cat === 'capital' ? ' cap' : '') + (p.proposal ? ' prop' : '');
    return '<div class="' + cls + '"><svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' + glyph(p.cat, r[0], r[1]) + badge + '</svg><span class="mk-name' + (LBL_SIDE[p.id] ? ' ' + LBL_SIDE[p.id] : '') + '">' + esc(p.name) + '</span></div>';
  }

  // ================================================================ lokasi (marker & label)
  var CATGROUP = { capital: 'kota', city: 'kota', town: 'kecil', oasis: 'kecil', port: 'dagang', market: 'dagang', fortress: 'kuasa', kingdom: 'kuasa', tribe: 'kuasa', mine: 'kuasa', ruin: 'kuasa',
                   hidden: 'situs', zone: 'situs', anomaly: 'situs', landmark: 'landmark', gate: 'landmark' };
  function groupOf(p) { return p.label_only ? 'label' : (CATGROUP[p.cat] || 'landmark'); }
  var CATS = [ ['kota', 'Kota & ibukota'], ['kecil', 'Kota kecil & oasis'], ['dagang', 'Pelabuhan & pasar'], ['kuasa', 'Kerajaan, benteng, suku'], ['situs', 'Situs tersembunyi & anomali'], ['landmark', 'Landmark & gerbang'], ['label', 'Wilayah & perairan'] ];
  var fCat = LS.get('rh-fcat', CATS.map(function (c) { return c[0]; })), fEpi = LS.get('rh-fepi', ['kanon', 'turunan', 'inferensi', 'terbuka']), fProp = LS.get('rh-fprop', true);
  var gMarkers = L.layerGroup(), gLabels = L.layerGroup(), gZone = L.layerGroup();
  var entries = {};  // id -> {p, layers:[...]}
  var LBL_BREAK = { silva_nullius: 1, sabuk_pohon: 2 }, LBL_MINOR = { silva_nullius: 1 };
  function breakName(nm, k) { var w = nm.split(' '); return w.slice(0, k).join(' ') + '<br>' + w.slice(k).join(' '); }
  function lblClass(p) {
    var c = p.cat;
    if (c === 'continent') return 'lbl-continent';
    if (c === 'water') return 'lbl-water' + (p.id === 'tamtu' ? ' big' : '');
    if (c === 'arc' || c === 'scar') return 'lbl-arc';
    if (c === 'blank') return 'lbl-blank';
    return 'lbl-region';
  }
  DATA.places.forEach(function (p) {
    var e = { p: p, layers: [] }; entries[p.id] = e;
    OFFS.forEach(function (dx) {
      var m;
      if (p.label_only) {
        var sub = (p.cat === 'continent' || p.cat === 'blank' || p.id === 'mare_internum') && p.aka ? '<small>' + esc(p.aka) + '</small>' : '';
        var nm = LBL_BREAK[p.id] ? breakName(esc(p.name), LBL_BREAK[p.id]) : esc(p.name);
        m = L.marker([p.lat, p.lon + dx], { pane: 'lbl', keyboard: false, icon: L.divIcon({ className: '', iconSize: null,
          html: '<div class="mlbl ' + lblClass(p) + (p.proposal ? ' lbl-proposal' : '') + (LBL_MINOR[p.id] ? ' minor' : '') + '" title="' + esc(p.name) + '">' + nm + sub + '</div>' }) });
        gLabels.addLayer(m);
      } else {
        var sz = p.cat === 'capital' ? 26 : (p.cat === 'town' ? 20 : 23);
        m = L.marker([p.lat, p.lon + dx], { keyboard: dx === 0, title: p.name, riseOnHover: true,
          icon: L.divIcon({ className: '', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2], popupAnchor: [0, -sz / 2], html: markerHTML(p, sz) }) });
        m._rh = p; m._rhs = sz;
        gMarkers.addLayer(m);
      }
      m.on('click', function (ev) { if (measuring) { measureAt(ev.latlng); return; } openPlace(p.id); });
      e.layers.push(m);
    });
    if (p.zone_r) {  // zona ketidakpastian (Castra Birath)
      OFFS.forEach(function (dx) {
        [1, 0.72, 0.46, 0.24].forEach(function (k, i) { gZone.addLayer(L.circle([p.lat, p.lon + dx], { renderer: svgScar, radius: p.zone_r * k, stroke: i === 0, color: '#ffb08a', weight: 1.2, dashArray: '3 4', fillColor: '#ff6a2b', fillOpacity: 0.09, interactive: i === 0 })
          .on('click', function () { openPlace(p.id); })); });
      });
    }
  });
  DATA.anomalies.forEach(function (a) {
    var p = { id: a.id, name: a.name, cat: 'anomaly', epi: a.epi, lat: a.lat, lon: a.lon, isAnomaly: true, note: a.note, d: a.d };
    placeById[a.id] = p; var e = { p: p, layers: [] }; entries[a.id] = e;
    OFFS.forEach(function (dx) {
      var r1 = L.circleMarker([a.lat, a.lon + dx], { renderer: svgScar, radius: 17, color: '#ffb07a', weight: 1.5, dashArray: '2 3', fillColor: '#ff7a3d', fillOpacity: 0.06 });
      var r2 = L.circleMarker([a.lat, a.lon + dx], { renderer: svgScar, radius: 24, color: '#ffb07a', weight: 1, opacity: 0.5, dashArray: '1 4', fill: false, interactive: false });
      r1.bindTooltip(a.name, { direction: 'top', className: 'rt', offset: [0, -14] });
      r1.on('click', function () { openPlace(a.id); });
      gAnom.addLayer(r2); gAnom.addLayer(r1); e.layers.push(r1, r2); });
  });
  reg('markers', gMarkers, true); reg('labels', gLabels, true); reg('zone', gZone, true); reg('anom', gAnom, true);
  function visible(p) {
    if (p.isAnomaly) return true;
    if (fCat.indexOf(groupOf(p)) < 0) return false;
    if (fEpi.indexOf(p.epi) < 0) return false;
    if (p.proposal && !fProp) return false;
    return true;
  }
  function applyFilters() {
    Object.keys(entries).forEach(function (id) { var e = entries[id], v = visible(e.p);
      if (e.p.isAnomaly) return;
      e.layers.forEach(function (m) { var grp = e.p.label_only ? gLabels : gMarkers; if (v && !grp.hasLayer(m)) grp.addLayer(m); if (!v && grp.hasLayer(m)) grp.removeLayer(m); }); });
    renderResults(); if (typeof queueDeclutter === 'function') queueDeclutter(); emitLayer('filters');
  }

  // ================================================================ wilayah (region fisik) & teritori
  var REG_STYLE = {
    silva_nullius: { color: '#9fd07a', fill: 'url(#p-forest)', dash: '4 3', open: 'silva_nullius' },
    interregna: { color: '#f2d27a', fill: 'none', dash: '8 5', w: 1.8, open: 'interregna' },
    zona_ambang: { color: '#6fe0c6', fill: 'none', dash: '5 4', open: 'zona_ambang' },
    pegunungan_sadumat: { color: '#f4ecd8', fill: 'none', dash: '2 4', open: 'peg_sadumat' },
    sabuk_pohon_raksasa: { color: '#8fe09a', fill: 'url(#p-forest)', dash: '2 4', open: 'sabuk_pohon' },
    vastitas: { color: '#cfd2dc', fill: '#cfd2dc', dash: null, open: 'vastitas', nostroke: true },
    sinus_adventus: { color: '#bfe9ee', fill: '#bfe9ee', dash: null, open: 'sinus_adventus', nostroke: true },
    mare_internum: { color: '#f2c27a', fill: '#f2c27a', dash: null, open: 'mare_internum', nostroke: true },
    lobus: { color: '#f2d9a0', fill: 'url(#p-blank)', dash: '6 5', open: 'lobus' },
    corona_glacialis: { color: '#e9f3f7', fill: '#e9f3f7', dash: null, open: 'corona_glacialis', nostroke: true },
    nagu: { color: '#bfe9ee', fill: 'none', dash: '2 6', open: 'nagu', op: 0.5 }, nagu_timur: { color: '#bfe9ee', fill: 'none', dash: '2 6', open: 'nagu', op: 0.5 },
    vasundha: { color: '#d9ad6f', fill: 'none', dash: '3 5', open: 'vasundha' }
  };
  var gRegions = L.layerGroup();
  DATA.regions.forEach(function (r) { var st = REG_STYLE[r.id]; if (!st) return;
    r.rings.forEach(function (ring) { OFFS.forEach(function (dx) {
      var pl = L.polygon(shift(ring, dx), { renderer: svgReg, stroke: !st.nostroke, color: st.color, weight: st.w || 1.3, opacity: st.op || 0.85, dashArray: st.dash, fill: st.fill !== 'none', fillColor: st.fill, fillOpacity: st.nostroke ? 0.001 : 1, smoothFactor: 1.2 });
      pl.on('click', function (e) { openPlace(st.open, e.latlng); });
      var pn = placeById[st.open]; pl.bindTooltip(pn ? pn.name : r.id, { sticky: true, className: 'rt', direction: 'top', offset: [0, -8] });
      gRegions.addLayer(pl); }); }); });
  reg('regions', gRegions, true);

  var FAC = DATA.factions;
  var TGROUP = { hesperia: 'hes', cw_a: 'hes', cw_b: 'hes', cw_c: 'hes', kloaka: 'lain', foedera: 'foe', cassivalla: 'foe', liminara: 'lain', ktonia: 'lain', pylora: 'lain', anabasim: 'ana',
                 emporys: 'lain', perates: 'lain', andura: 'elv', anusarri: 'elv', vasundha: 'lain', nundina: 'int', aventalia: 'int', tarvenna: 'int' };
  var TG = { hes: L.layerGroup(), foe: L.layerGroup(), int: L.layerGroup(), ana: L.layerGroup(), elv: L.layerGroup(), lain: L.layerGroup() };
  var gTerrAll = L.layerGroup();
  var hatchIds = {};
  DATA.territories.forEach(function (t) {
    if (t.id === 'anusarri') return;  // digambar sebagai gradasi mandala
    var f = FAC[t.id] || { name: t.name, color: '#cccccc', kind: '' };
    var gname = TGROUP[t.id] || (t.id.indexOf('ir_') === 0 ? 'int' : 'lain');
    var fillC = f.color;
    if (f.hatch) { hatchIds[t.id] = f.color; fillC = 'url(#h-' + t.id + ')'; }
    t.rings.forEach(function (ring) { OFFS.forEach(function (dx) {
      TG[gname].addLayer(L.polygon(shift(ring, dx), { renderer: svgTerr, color: f.color, weight: 6, opacity: 0.22, fill: false, interactive: false, lineJoin: 'round', smoothFactor: 1 }));
      var pl = L.polygon(shift(ring, dx), { renderer: svgTerr, color: f.color, weight: 1.4, opacity: 0.95, dashArray: f.dashed ? '5 4' : null, fillColor: fillC, fillOpacity: f.hatch ? 1 : 0.26, smoothFactor: 1 });
      pl.on('click', function (e) { openFaction(t.id, e.latlng); });
      pl.on('mouseover', function () { this.setStyle({ weight: 2.6 }); }); pl.on('mouseout', function () { this.setStyle({ weight: 1.4 }); });
      pl.bindTooltip(f.name, { sticky: true, className: 'rt', direction: 'top', offset: [0, -8] });
      TG[gname].addLayer(pl); }); });
  });
  // mandala Elvari: gradasi tanpa tepi
  var gMand = L.layerGroup(); var MOP = [0.46, 0.32, 0.18, 0.07];
  var RINGTXT = ['Ring 0 — Libbāl: kursi Sarum, kuil Lex Aēlis, arsip standar, jangkar meridian Elvari.', 'Ring 1 — dataran inti: kota-kota Sarum/Marum, kanon budaya penuh (entri menyusul).',
                 'Ring 2 — lingkar dagang & pesisir: pelabuhan Marum, gerbang diplomatik manusia; standar melonggar (entri menyusul).', 'Ring 3 — pinggiran; di barat-daya menjadi Zona Ambang (Napûm Berteritori, Andurā), di atas kantong anomali massa #3.'];
  DATA.mandala.forEach(function (m) { m.rings.forEach(function (ring) { OFFS.forEach(function (dx) {
    var pl = L.polygon(shift(ring, dx), { renderer: svgMand, stroke: false, fillColor: FAC.anusarri.color, fillOpacity: MOP[m.ring], smoothFactor: 1.5 });
    pl.bindTooltip('Mandala Kemurnian · Ring ' + m.ring, { sticky: true, className: 'rt', direction: 'top', offset: [0, -8] });
    pl.on('click', function (e) { openMandala(m.ring, e.latlng); }); gMand.addLayer(pl); }); }); });
  Object.keys(TG).forEach(function (k) { reg('t_' + k, TG[k], true); });
  reg('mandala', gMand, true);
  // pola SVG (hatch & hutan) — disuntik ke kontainer renderer setelah ada
  function injectDefs() {
    var list = [[svgTerr, hatchIds], [svgReg, null]];
    list.forEach(function (it) { var r = it[0]; if (!r._container || r._container.querySelector('defs[data-rh]')) return;
      var ns = 'http://www.w3.org/2000/svg', defs = document.createElementNS(ns, 'defs'); defs.setAttribute('data-rh', '1');
      var html = '';
      if (it[1]) Object.keys(it[1]).forEach(function (id) { var c = it[1][id];
        html += '<pattern id="h-' + id + '" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(40)"><rect width="9" height="9" fill="' + c + '" fill-opacity=".16"/><rect width="2.6" height="9" fill="' + c + '" fill-opacity=".55"/></pattern>'; });
      html += '<pattern id="p-forest" patternUnits="userSpaceOnUse" width="12" height="12"><rect width="12" height="12" fill="#6fb46a" fill-opacity=".10"/><path d="M3 9l2-4 2 4zM8.5 5l1.5-3 1.5 3z" fill="#bfe8a8" fill-opacity=".55"/></pattern>';
      html += '<pattern id="p-blank" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(-35)"><rect width="14" height="14" fill="#f2d9a0" fill-opacity=".05"/><rect width="1.2" height="14" fill="#f2d9a0" fill-opacity=".30"/></pattern>';
      defs.innerHTML = html; r._container.insertBefore(defs, r._container.firstChild); });
  }
  map.on('layeradd', injectDefs); injectDefs();

  // ================================================================ rute & front
  var RST = { historic: { color: '#f6e7bd', weight: 2, dash: '8 7' }, land: { color: '#e79a6a', weight: 2.2, dash: '2 6' }, story: { color: '#ffd35c', weight: 2.6, dash: null }, sea: { color: '#7fe0ec', weight: 1.8, dash: '12 5 2 5' } };
  var gRoutes = {}; ['historic', 'land', 'story', 'sea'].forEach(function (k) { gRoutes[k] = L.layerGroup(); });
  function arrowIcon(deg, col) { return L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: '<svg width="14" height="14" viewBox="0 0 14 14" style="transform:rotate(' + deg + 'deg)"><path d="M2 2l10 5-10 5 3-5z" fill="' + col + '" stroke="rgba(0,0,0,.55)" stroke-width=".8"/></svg>' }); }
  function bearingScreen(a, b) { return Math.atan2(-(b[0] - a[0]), b[1] - a[1]) * R2D; }
  DATA.routes.forEach(function (r) {
    var st = RST[r.kind]; var lines = [r.pts].concat(r.pts2 ? [r.pts2] : []);
    lines.forEach(function (pts) { OFFS.forEach(function (dx) {
      var pl = L.polyline(shift(pts, dx), { renderer: svgRoute, color: st.color, weight: st.weight, opacity: 0.95, dashArray: st.dash, lineCap: 'round' });
      pl.bindTooltip(r.name, { sticky: true, className: 'rt' }); pl.on('click', function (e) { openRoute(r, e.latlng); });
      gRoutes[r.kind].addLayer(L.polyline(shift(pts, dx), { renderer: svgRoute, color: '#000', weight: st.weight + 2.5, opacity: 0.28, interactive: false }));
      gRoutes[r.kind].addLayer(pl);
      var n = pts.length, a = pts[n - 2], b = pts[n - 1];
      gRoutes[r.kind].addLayer(L.marker([b[0], b[1] + dx], { pane: 'route', interactive: false, icon: arrowIcon(bearingScreen(a, b), st.color) }));
    }); });
  });
  reg('r_historic', gRoutes.historic, true); reg('r_land', gRoutes.land, true); reg('r_story', gRoutes.story, true); reg('r_sea', gRoutes.sea, true);
  var gFront = L.layerGroup();
  DATA.fronts.forEach(function (f) {
    var col = f.id === 'front_florian' ? '#2aa38a' : '#ff6a2b';
    OFFS.forEach(function (dx) {
      var pl = L.polyline(shift(f.pts, dx), { renderer: svgRoute, color: col, weight: f.id === 'front_florian' ? 3 : 2.4, opacity: 0.95, dashArray: f.id === 'front_florian' ? '1 5' : '6 4', lineCap: 'round' });
      pl.bindTooltip(f.name, { sticky: true, className: 'rt' }); pl.on('click', function (e) { openRoute(f, e.latlng); }); gFront.addLayer(pl);
      var last = f.pts[f.pts.length - 1], tgt = f.arrow_to;
      if (f.id === 'front_florian') { var mid = f.pts[Math.floor(f.pts.length / 2)]; gFront.addLayer(L.polyline([[mid[0], mid[1] + dx], [tgt[0], tgt[1] + dx]], { renderer: svgRoute, color: col, weight: 2, opacity: 0.9, interactive: false }));
        gFront.addLayer(L.marker([tgt[0], tgt[1] + dx], { pane: 'route', interactive: false, icon: arrowIcon(bearingScreen(mid, tgt), col) })); }
      else { gFront.addLayer(L.polyline([[last[0], last[1] + dx], [tgt[0], tgt[1] + dx]], { renderer: svgRoute, color: col, weight: 2.4, opacity: 0.95, dashArray: '6 4', interactive: false }));
        gFront.addLayer(L.marker([tgt[0], tgt[1] + dx], { pane: 'route', interactive: false, icon: arrowIcon(bearingScreen(last, tgt), col) })); }
    });
  });
  reg('fronts', gFront, true);
  var BANK_HTML = '<div class="pp"><h2>Bank samudra</h2><p class="aka">plato bawah laut dangkal</p><div class="pos"><div class="ph">Posisi <span class="epi turunan">Turunan</span></div>Bagian batimetri lapisan fisik Master Map v4 (kanon 29 Sep 2026): bentuk dan posisi keenam plato ikut lapisan fisik. Lingkaran putus-putus hanya penanda tepinya. Yang masih <b>Inferensi AI</b>: sebutan "bank samudra Tehari" — kaitannya dengan komunitas Tehari belum dikunci.</div><p class="nt">Relevan untuk slot ledger "Wilayah komunitas Tehari (Pesisir / Sungai Pedalaman / Laut Dalam)" yang masih Open.</p></div>';
  var gBanks = L.layerGroup();
  DATA.banks.forEach(function (b, i) { OFFS.forEach(function (dx) {
    var c = L.circle([b.lat, b.lon + dx], { renderer: svgReg, radius: b.r, color: '#8fe3e0', weight: 1.2, dashArray: '2 5', fillColor: '#8fe3e0', fillOpacity: 0.05 });
    c.bindTooltip('Bank samudra (lapisan fisik v4)', { sticky: true, className: 'rt' });
    c.on('click', function (e) { if (measuring) return; popup.setLatLng(e.latlng).setContent(BANK_HTML).openOn(map); });
    gBanks.addLayer(c); }); });
  reg('banks', gBanks, false);

  // ================================================================ popup
  var chip = C.chip;
  function nearestX(lon) { var c = map.getCenter().lng; return lon + 360 * Math.round((c - lon) / 360); }
  function placeHTML(p) {
    if (p.isAnomaly) return '<div class="pp"><h2>' + esc(p.name) + '</h2><p class="aka">kantong anomali massa (Model B, PF §4)</p><div class="pos"><div class="ph">Posisi ' + chip(p.epi) + '</div>' + esc(p.note) +
      '</div><p class="nt">Planetary Form §4: 3–5 kantong anomali massa lokal. Tiga yang ditandai di sini (#3 sejak 29 Sep 2026, Canon Index #210); sisa 0–2 <b>[Terbuka]</b> — Development Backlog.</p><div class="acts">' + actCopy(p) + '</div></div>';
    var tags = [];
    tags.push(esc(p.type));
    if (p.canon && p.canon !== '—') tags.push('Canon: ' + esc(p.canon));
    if (p.status && p.status !== '—') tags.push(esc(p.status));
    if (p.access) tags.push('Akses: ' + esc(p.access));
    var ptag = p.proposal ? '<span class="tag bad">Usulan — posisi belum dikunci · entri Atlas masih Draft</span>' : '';
    var coord = p.zone_r ? 'zona ± ' + fmt(p.zone_r, 1) + '° di sekitar ' + fLat(p.lat) + ' · ' + fLon(p.lon) : (p.label_only ? 'titik label ' : '') + fLat(p.lat) + ' · ' + fLon(p.lon);
    var dd = p.d, dcalc = prox(dd), scarLine;
    var dtxt = fmt(Math.abs(dd), 1) + '° (' + fint(Math.abs(dd) * KM_DEG) + ' km) dari kurva, sisi ' + (dd < 0 ? 'Rhykar' : 'Aëris');
    if (p.scar && !p.label_only) { var okk = p.scar === dcalc; scarLine = esc(p.scar) + ' <span class="' + (okk ? 'ok' : 'warnc') + '">' + (okk ? '✓' : '≠ ' + dcalc) + '</span><br><span style="color:var(--ink-3)">' + dtxt + '</span>'; }
    else if (p.scar) scarLine = esc(p.scar) + '<br><span style="color:var(--ink-3)">titik label: ' + dtxt + '</span>';
    else scarLine = '<span style="color:var(--ink-3)">' + dtxt + ' → ' + dcalc + '</span>';
    var rows = [];
    if (p.region) rows.push(['Wilayah', esc(p.region)]);
    if (p.hemi) rows.push(['Hemisfer', esc(p.hemi)]);
    rows.push(['Scar', scarLine]);
    if (p.climate) rows.push(['Iklim', esc(p.climate)]);
    if (p.pop) rows.push(['Populasi', esc(p.pop)]);
    if (p.hazards && p.hazards.length) rows.push(['Bahaya', esc(p.hazards.join(', '))]);
    if (p.parent) rows.push(['Induk', esc(p.parent)]);
    if (p.faction && FAC[p.faction]) rows.push(['Kuasa', '<a href="#" data-fac="' + p.faction + '">' + esc(FAC[p.faction].name) + '</a>']);
    var h = '<div class="pp"><h2>' + esc(p.name) + '</h2>' + (p.aka ? '<p class="aka">' + esc(p.aka) + '</p>' : '') +
      '<div class="tags">' + tags.map(function (t) { return '<span class="tag">' + t + '</span>'; }).join('') + ptag + '</div>' +
      '<div class="pos"><div class="ph">Koordinat ' + chip(p.epi, p.conf) + '</div><div class="coord">' + coord + '</div>' + esc(p.pos) + '</div>' +
      '<dl>' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>' +
      (p.strategic ? '<div class="sv"><b>Strategic Value · Notion</b>' + esc(p.strategic) + '</div>' : '') + (p.notes ? '<p class="nt">' + esc(p.notes) + '</p>' : '') +
      '<div class="acts">' + (p.url ? '<a class="act" href="' + esc(p.url) + '" target="_blank" rel="noopener">Buka di Notion ↗</a>' : '') + actCopy(p) +
      '<button class="act" data-measure="' + p.id + '">Ukur dari sini</button></div></div>';
    return h;
  }
  function actCopy(p) { return '<button class="act" data-copy="' + fmt(p.lat, 3).replace(',', '.') + ', ' + fmt(lonN(p.lon), 3).replace(',', '.') + '">Salin koordinat</button>'; }
  var popup = L.popup({ maxWidth: 400, autoPanPadding: [40, 60], className: 'rhp' });
  function openPlace(id, at) {
    if (measuring) return;
    var p = placeById[id]; if (!p) return;
    var ll = at ? at : L.latLng(p.lat, nearestX(p.lon));
    popup.setLatLng(ll).setContent(placeHTML(p)).openOn(map);
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  }
  function factionHTML(id) {
    var f = FAC[id]; if (!f) return null;
    return '<div class="pp"><h2>' + esc(f.name) + '</h2><p class="aka">' + esc(f.kind) + '</p><div class="pos"><div class="ph">Batas wilayah ' + chip(f.epi) + '</div>' +
      (f.gradient ? 'Gradasi mandala, bukan garis — ' : '') + 'Batas digambar lewat partisi sadar-medan (biaya gerak naik di pegunungan & sungai besar) dari jangkar kanon; snapshot AS 1647.</div>' +
      '<p class="nt">' + esc(f.blurb || '') + '</p><div class="acts">' + (f.url ? '<a class="act" href="' + esc(f.url) + '" target="_blank" rel="noopener">Entri Powers & Factions ↗</a>' : '') + '</div></div>';
  }
  function openFaction(id, at) {
    if (measuring) return;
    var h = factionHTML(id); if (!h) return;
    popup.setLatLng(at).setContent(h).openOn(map);
  }
  function mandalaHTML(ring) {
    return '<div class="pp"><h2>Mandala Kemurnian</h2><p class="aka">Ring ' + ring + ' · Anušarri / Elvari</p><div class="pos"><div class="ph">Struktur ' + chip('kanon') + ' · radius ' + chip('inferensi') + '</div>' +
      'Kekuasaan memancar dari pusat teladan dalam gradasi konsentris — tanpa garis batas, hanya pancaran yang menipis; ditegakkan drift biologis, bukan patroli. Radius ring di peta (5° / 11° / 18,5°) = usulan.</div><p class="nt">' + esc(RINGTXT[ring]) + '</p>' +
      '<div class="acts">' + (placeById.ellumat && placeById.ellumat.url ? '<a class="act" href="' + esc(placeById.ellumat.url) + '" target="_blank" rel="noopener">Entri Ellumāt ↗</a>' : '') + '</div></div>';
  }
  function openMandala(ring, at) {
    if (measuring) return;
    popup.setLatLng(at).setContent(mandalaHTML(ring)).openOn(map);
  }
  function routeHTML(r) {
    return '<div class="pp"><h2>' + esc(r.name) + '</h2><div class="pos"><div class="ph">Garis ' + chip(r.epi) + (r.topo ? ' · topologi ' + chip(r.topo) : '') + '</div>' + esc(r.note) + '</div>' +
      (r.pts ? '<p class="nt">Panjang lintasan di peta ≈ ' + fint(pathKm(r.pts)) + ' km.</p>' : '') + '</div>';
  }
  function openRoute(r, at) {
    if (measuring) return;
    popup.setLatLng(at).setContent(routeHTML(r)).openOn(map);
  }
  function gcDeg(a, b) { return C.angDist(a[0], a[1], b[0], b[1]); }
  function pathKm(pts) { var s = 0; for (var i = 1; i < pts.length; i++) s += gcDeg(pts[i - 1], pts[i]); return s * KM_DEG; }
  map.getContainer().addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('[data-copy],[data-measure],[data-fac]') : null; if (!t) return;
    if (t.hasAttribute('data-copy')) { ev.preventDefault(); var txt = t.getAttribute('data-copy');
      var done = function () { t.textContent = 'Tersalin ✓'; setTimeout(function () { t.textContent = 'Salin koordinat'; }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { t.textContent = txt; }); else t.textContent = txt; }
    if (t.hasAttribute('data-measure')) { ev.preventDefault(); var p = placeById[t.getAttribute('data-measure')]; startMeasure([p.lat, nearestX(p.lon)]); }
    if (t.hasAttribute('data-fac')) { ev.preventDefault(); openFaction(t.getAttribute('data-fac'), popup.getLatLng()); }
  });

  // ================================================================ panel: tabs, pencarian, filter
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tb) { tb.addEventListener('click', function () {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.setAttribute('aria-selected', String(x === tb)); });
    Array.prototype.forEach.call(document.querySelectorAll('.pbody section'), function (s) { s.classList.toggle('on', s.id === tb.getAttribute('data-sec')); });
    if (!panelOpen) setPanel(true); }); });
  var fcatEl = document.getElementById('f-cat'), fepiEl = document.getElementById('f-epi');
  CATS.forEach(function (c) { var b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.textContent = c[1]; b.setAttribute('aria-pressed', String(fCat.indexOf(c[0]) >= 0));
    b.addEventListener('click', function () { var i = fCat.indexOf(c[0]); if (i >= 0) fCat.splice(i, 1); else fCat.push(c[0]); b.setAttribute('aria-pressed', String(i < 0)); LS.set('rh-fcat', fCat); applyFilters(); }); fcatEl.appendChild(b); });
  var EPICOL = { kanon: 'var(--brass)', turunan: 'var(--sea)', inferensi: 'var(--warn)', terbuka: 'var(--scar)' };
  ['kanon', 'turunan', 'inferensi', 'terbuka'].forEach(function (k) { var b = document.createElement('button'); b.className = 'chip'; b.type = 'button';
    b.innerHTML = '<span class="sw" style="background:' + EPICOL[k] + '"></span>' + EPI[k]; b.setAttribute('aria-pressed', String(fEpi.indexOf(k) >= 0));
    b.addEventListener('click', function () { var i = fEpi.indexOf(k); if (i >= 0) fEpi.splice(i, 1); else fEpi.push(k); b.setAttribute('aria-pressed', String(i < 0)); LS.set('rh-fepi', fEpi); applyFilters(); }); fepiEl.appendChild(b); });
  var bp = document.createElement('button'); bp.className = 'chip'; bp.type = 'button'; bp.innerHTML = '<span class="sw" style="background:#f2b25a"></span>Usulan (belum dikunci)'; bp.setAttribute('aria-pressed', String(fProp));
  bp.addEventListener('click', function () { fProp = !fProp; bp.setAttribute('aria-pressed', String(fProp)); LS.set('rh-fprop', fProp); applyFilters(); }); fepiEl.appendChild(bp);
  var qEl = document.getElementById('q'), resEl = document.getElementById('results');
  var INDEX = DATA.places.map(function (p) { return { id: p.id, kind: 'place', s: norm([p.name, p.aka, p.type, p.region, p.parent].join(' ')), p: p }; })
    .concat(DATA.anomalies.map(function (a) { return { id: a.id, kind: 'place', s: norm(a.name + ' anomali kantong'), p: placeById[a.id] }; }))
    .concat(Object.keys(FAC).map(function (k) { return { id: k, kind: 'fac', s: norm(FAC[k].name + ' ' + FAC[k].kind + ' faksi'), f: FAC[k] }; }));
  function iconSmall(p) { var r = RING[p.epi] || RING.inferensi; return '<svg width="20" height="20" viewBox="0 0 24 24">' + (p.label_only ? '<text x="12" y="16" text-anchor="middle" font-family="Cinzel,serif" font-size="12" fill="currentColor">' + esc(p.name.charAt(0)) + '</text><circle cx="12" cy="12" r="9.5" fill="none" stroke="' + r[0] + '" stroke-width="1.2"' + (r[1] ? ' stroke-dasharray="' + r[1] + '"' : '') + '/>' : glyph(p.cat, r[0], r[1])) + '</svg>'; }
  function renderResults() {
    var q = norm(qEl.value.trim());
    var list = INDEX.filter(function (it) { if (it.kind === 'place' && !visible(it.p)) return false; return !q || it.s.indexOf(q) >= 0; });
    if (!q) list = list.filter(function (it) { return it.kind === 'place'; });
    list.sort(function (a, b) { var an = a.kind === 'place' ? a.p.name : a.f.name, bn = b.kind === 'place' ? b.p.name : b.f.name;
      if (q) { var ai = norm(an).indexOf(q) === 0 ? 0 : 1, bi = norm(bn).indexOf(q) === 0 ? 0 : 1; if (ai !== bi) return ai - bi; } return an.localeCompare(bn, 'id'); });
    resEl.innerHTML = list.slice(0, 80).map(function (it) {
      if (it.kind === 'fac') { var f = it.f; return '<li class="res" tabindex="0" data-fac="' + it.id + '"><span class="ic"><svg width="20" height="20" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="3" fill="' + f.color + '" fill-opacity=".35" stroke="' + f.color + '" stroke-width="1.6"/></svg></span><span style="min-width:0"><div class="nm">' + esc(f.name) + '</div><div class="sub">wilayah · ' + esc(f.kind) + '</div></span>' + chip(f.epi) + '</li>'; }
      var p = it.p; return '<li class="res" tabindex="0" data-id="' + p.id + '"><span class="ic">' + iconSmall(p) + '</span><span style="min-width:0"><div class="nm">' + esc(p.name) + (p.proposal ? ' <span style="color:var(--warn);font-weight:500">· usulan</span>' : '') + '</div><div class="sub">' + esc(p.type || 'Anomali') + (p.region ? ' · ' + esc(p.region) : '') + '</div></span>' + chip(p.epi) + '</li>';
    }).join('');
    document.getElementById('n-res').textContent = list.length + ' entri';
  }
  function zoomFor(p) { return p.cat === 'continent' ? 2.4 : (p.label_only ? 3.4 : 4.6); }
  function goPlace(id) { var p = placeById[id]; if (!p) return; var x = nearestX(p.lon), z = Math.max(map.getZoom(), zoomFor(p));
    if (REDUCED) map.setView([p.lat, x], z, { animate: false }); else map.flyTo([p.lat, x], z, { duration: 0.9 });
    map.once('moveend', function () { openPlace(id); }); if (window.innerWidth <= 760) setPanel(false); }
  function goFaction(id) { var t = DATA.territories.filter(function (x) { return x.id === id; })[0]; var pts = [];
    if (id === 'anusarri') { DATA.mandala.forEach(function (m) { m.rings.forEach(function (r) { pts = pts.concat(r); }); }); } else if (t) t.rings.forEach(function (r) { pts = pts.concat(r); });
    if (!pts.length) return; var b = L.latLngBounds(pts); var c = b.getCenter(), dx = nearestX(c.lng) - c.lng; b = L.latLngBounds(shift(pts, dx));
    map.flyToBounds(b, { padding: [60, 60], maxZoom: 5, duration: REDUCED ? 0 : 0.9 }); map.once('moveend', function () { openFaction(id, L.latLng(b.getCenter())); }); if (window.innerWidth <= 760) setPanel(false); }
  resEl.addEventListener('click', function (e) { var li = e.target.closest('.res'); if (!li) return; if (li.dataset.fac) goFaction(li.dataset.fac); else goPlace(li.dataset.id); });
  resEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var li = e.target.closest('.res'); if (li) li.click(); } });
  qEl.addEventListener('input', renderResults);
  qEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var li = resEl.querySelector('.res'); if (li) li.click(); } });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== qEl) { e.preventDefault(); if (!panelOpen) setPanel(true); document.getElementById('tab-cari').click(); qEl.focus(); }
    if (e.key === 'Escape') { map.closePopup(); stopMeasure(); }
  });

  // ================================================================ tab Layer
  var LAYER_UI = [
    ['Dasar & kartografi', [['grat', 'Graticule 15°'], ['mer', 'Tiga meridian'], ['cland', 'Kontur elevasi (1.000/2.500/4.500 m)'], ['csea', 'Kontur batimetri (−200/−3.000/−6.000 m)'], ['labels', 'Label wilayah & perairan'], ['regions', 'Garis region fisik']]],
    ['The Scar', [['band', 'Pita 13,0°'], ['curve', 'Kurva small circle'], ['arcs', 'Empat busur (batas usulan)'], ['anom', 'Kantong anomali massa'], ['zone', 'Zona Castra Birath (tak dikunci)']]],
    ['Wilayah kuasa AS 1647', [['t_hes', 'Hesperia & vasal Commonwealth', '#c0394b'], ['t_foe', 'Foedera & Provincia Cassivallae', '#2aa38a'], ['t_int', 'Kerajaan Interregna & Nundina', '#e0a33a'], ['t_ana', 'Anabasim (konsolidasi Birath–Satvan)', '#ff6a2b'], ['t_elv', 'Andurā (Zona Ambang)', '#4cc3a8'], ['mandala', 'Mandala Kemurnian (Anušarri)', '#e6d47a'], ['t_lain', 'Lainnya: Liminara, Ktonia, Kloaka, Emporys, Peratēs, Vasundha', '#9b6fd6'], ['fronts', 'Front Florian & arah ekspansi Anabasim']]],
    ['Rute', [['r_historic', 'Rute Penyeberangan The Scar', '#f6e7bd'], ['r_land', 'Jalur darat barat (Sutura)', '#e79a6a'], ['r_story', 'Rute Arc 1 (Sulis)', '#ffd35c'], ['r_sea', 'Usulan koridor angin & jalur laut', '#7fe0ec']]],
    ['Oseanografi', [['banks', 'Bank samudra (lapisan fisik v4)']]],
    ['Marker', [['markers', 'Tampilkan marker lokasi']]]
  ];
  var secL = document.getElementById('sec-layer');
  LAYER_UI.forEach(function (g) {
    var d = document.createElement('div'); d.className = 'grp'; d.innerHTML = '<h3>' + esc(g[0]) + '</h3>';
    g[1].forEach(function (it) { var k = it[0]; if (!LAYERS[k]) return; var id = 'ly-' + k;
      var lab = document.createElement('label'); lab.className = 'layer'; lab.setAttribute('for', id);
      lab.innerHTML = '<input type="checkbox" id="' + id + '"' + (LAYERS[k].on ? ' checked' : '') + '><span>' + (it[2] ? '<span class="sw" style="background:' + it[2] + '"></span>' : '') + esc(it[1]) + '</span><span class="meta"></span>';
      lab.querySelector('input').addEventListener('change', function (e) { setLayer(k, e.target.checked); if (k === 'grat' || k === 'mer') drawGratLabels(); });
      d.appendChild(lab); });
    secL.appendChild(d);
  });
  var tip = document.createElement('p'); tip.className = 'prose'; tip.style.margin = '0';
  tip.innerHTML = 'Relief fisik, garis pantai, sungai, dan bioma dirender dari pipeline prosedural (seed 1647). Semua lapisan vektor digambar ulang di atasnya dan tetap tajam saat diperbesar. Pilihan layer diingat di peramban ini.';
  secL.appendChild(tip);

  // ================================================================ tab Audit
  var secA = document.getElementById('sec-audit');
  var KT = { friksi: 'Friksi', blank: 'Blank spot', pola: 'Pola', tutup: 'Ditutup' };
  var ha = '<p class="prose" style="margin:0">Temuan sintesis database saat menyusun peta: friksi antar-entri, blank spot, dan benang merah. Yang sudah diketok dan ditulis balik ke Notion ditandai Ditutup; sisanya menunggu ketok.</p>';
  DATA.audit.forEach(function (a) { ha += '<div class="card"><span class="kind ' + a.kind + '">' + KT[a.kind] + '</span><h4>' + esc(a.title) + '</h4><p>' + esc(a.body) + '</p><div class="refs">' + esc(a.refs) + '</div></div>'; });
  ha += '<div class="grp"><h3>Utang lokasi terbuka (Location Debt Ledger)</h3><ol class="ledger">' + DATA.ledger.map(function (l) { return '<li><div>' + esc(l[0]) + '</div><div class="w">Beban: ' + esc(l[1]) + '</div><div style="color:var(--ink-2)">' + esc(l[2]) + '</div></li>'; }).join('') + '</ol></div>';
  ha += '<div class="grp"><h3>Sengaja tidak dipetakan</h3><ol class="ledger">' + DATA.unmapped.map(function (u) { return '<li><div>' + (u[2] ? '<a href="' + esc(u[2]) + '" target="_blank" rel="noopener">' + esc(u[0]) + '</a>' : esc(u[0])) + '</div><div style="color:var(--ink-2)">' + esc(u[1]) + '</div></li>'; }).join('') + '</ol></div>';
  secA.innerHTML = ha; document.getElementById('n-audit').textContent = DATA.audit.length;

  // ================================================================ tab Metode
  var S = DATA.stats, secI = document.getElementById('sec-info');
  secI.innerHTML =
    '<div class="grp"><h3>Neraca terukur di peta ini</h3><dl class="stat">' +
    '<dt>Darat Rhykar (kanon 23%)</dt><dd>' + fmt(S.rhykar, 3) + '%</dd><dt>Darat Aëris (kanon 15%)</dt><dd>' + fmt(S.aeris, 3) + '%</dd><dt>Perairan (kanon 62%)</dt><dd>' + fmt(S.water, 3) + '%</dd>' +
    '<dt>Hemisfer Rhykar / Aëris</dt><dd>' + fmt(S.hemR, 2) + ' / ' + fmt(S.hemA, 2) + '</dd><dt>Overlay Scar pada pita 13,0°</dt><dd>' + fmt(S.overlay, 2) + '%</dd>' +
    '<dt>Lebar turunan utk 4,000%</dt><dd>' + fmt(S.width_derived, 2) + '°</dd><dt>Koridor lintas-sutura</dt><dd>1 · ' + esc(S.corridor.split(' (')[0]) + '</dd>' +
    '<dt>Radius planet · keliling</dt><dd>' + fint(S.radius_km) + ' km · ' + fint(S.circ_km) + ' km</dd><dt>Grid raster global</dt><dd>' + esc(S.grid.split(' (')[0]) + ' · 12,7 km/px</dd>' +
    (DATA.inset ? '<dt>Inset detail wilayah inti</dt><dd>' + DATA.inset.ppd + ' px/° · ' + fmt(KM_DEG / DATA.inset.ppd, 1) + ' km/px</dd>' : '') + '</dl></div>' +
    '<div class="card"><h4>Master Map v4 = peta kanon (29 Sep 2026, Canon Index #208)</h4><p>v4 dibangun ulang dari constraint Master Map v3-D (11 Jul 2026), yang gambar dan script-nya tidak pernah masuk vault. Pipeline baru (seed 1647) memakai semua constraint terkunci sebagai <b>input</b> generator — proporsi, koridor tunggal, teluk, antipode — lalu lapisan fisiknya (garis pantai, relief, sungai, bioma, batimetri) diketok sebagai kanon. Lapisan politik tetap snapshot AS 1647 yang boleh bergeser tanpa versi fisik baru.</p></div>' +
    '<div class="prose"><p><b>Status koordinat.</b> Relasi sebuah lokasi bisa kanon sementara koordinatnya inferensi. Chip di setiap popup menandai status <i>koordinat</i>: ' + chip('kanon') + ' dikunci kanon (bujur 0° teluk, kutub, geometri Scar) · ' + chip('turunan') + ' diturunkan deterministik dari kanon + garis pantai · ' + chip('inferensi') + ' penempatan AI yang patuh relasi kanon · ' + chip('terbuka') + ' sengaja tidak dikunci.</p>' +
    '<p><b>Ambang Scar Proximity (kanon — Canon Index #209, 29 Sep 2026).</b> Pita ±' + fmt(TH.within, 1) + '° = Within · ≤' + fmt(TH.adjacent, 1) + '° (tiga setengah-lebar pita) = Adjacent · ≤' + fmt(TH.peripheral, 1) + '° = Peripheral · selebihnya Unaffected. Polity diukur dari ibukota, wilayah fisik dari sentroid; benua & samudra lintas-cincin tanpa nilai tunggal. Sabuk Transisi Sutura = Adjacent + Peripheral. Semua field kanon cocok setelah Zona Ambang dikoreksi ke Unaffected (#210).</p>' +
    '<p><b>Tiga meridian.</b> 0° historis di Litus Primum; meridian resmi melewati Aurelia (≈' + fmt(Math.abs(AUR), 2) + '° B); meridian Elvari melewati Libbāl di 180°. Pilih kerangka di readout koordinat.</p>' +
    '<p><b>Pipeline.</b> Noise 3D di permukaan bola (Perlin fBm + domain warp + ridged), kalibrasi ambang berbobot cos-lintang per komponen (superbenua, porsi lintas-sutura, Ellumāt, Šadûmāt, kepulauan), hidrologi priority-flood + D8, bioma dari curah & suhu, batas politik via Dijkstra sadar-medan.</p>' +
    (DATA.inset ? '<p><b>Inset detail.</b> Wilayah ' + fmt(DATA.inset.b[0][0], 0) + '°..' + fmt(DATA.inset.b[1][0], 0) + '° lintang, ' + fmt(DATA.inset.b[0][1], 0) + '°..' + fmt(DATA.inset.b[1][1], 0) + '° bujur dirender ulang ' + DATA.inset.ppd + ' px/°: medan potensial generator dievaluasi ulang dengan ambang & normalisasi global yang sama (garis pantai identik di titik grid global, lebih halus di antaranya); tekstur relief sub-grid hanya untuk bayangan bukit, tidak menambah geografi.</p>' : '') + '' +
    '<p><b>Sumber Notion (dibaca 29 Sep 2026):</b> Planetary Form · Atlas (33 entri) · Powers & Factions · Location Debt Ledger · Canon Ledger.</p></div>';

  // ================================================================ legenda
  var legEl = document.getElementById('legend'), btnLeg = document.getElementById('btn-legend');
  var legOpen = LS.get('rh-legend', false);
  function refreshLegend() {
    var h = '<h3>Status koordinat</h3>';
    ['kanon', 'turunan', 'inferensi', 'terbuka'].forEach(function (k) { var r = RING[k]; h += '<div class="li"><svg width="18" height="18" viewBox="0 0 24 24">' + glyph(k === 'terbuka' ? 'zone' : 'city', r[0], r[1]) + '</svg>' + EPI[k] + '</div>'; });
    h += '<div class="li"><svg width="18" height="18" viewBox="0 0 24 24">' + glyph('city', RING.inferensi[0], RING.inferensi[1]) + '<circle cx="19.6" cy="4.6" r="2.6" fill="#f2b25a"/></svg>Usulan — posisi belum dikunci (entri Atlas Draft)</div>';
    h += '<h3>The Scar</h3><div class="li"><svg width="30" height="12"><rect y="1" width="30" height="10" fill="#ff5a24" fill-opacity=".25"/><path d="M0 6h30" stroke="#ff7a3d" stroke-width="2.2"/></svg>Pita 13,0° & kurva</div>';
    var act = [['t_hes', '#c0394b', 'Hesperia / vasal'], ['t_foe', '#2aa38a', 'Foedera'], ['t_int', '#e0a33a', 'Interregna'], ['t_ana', '#ff6a2b', 'Anabasim'], ['mandala', '#e6d47a', 'Anušarri (gradasi)'], ['t_elv', '#4cc3a8', 'Andurā'], ['t_lain', '#9b6fd6', 'Faksi lain']]
      .filter(function (a) { return LAYERS[a[0]] && LAYERS[a[0]].on; });
    if (act.length) { h += '<h3>Wilayah kuasa</h3>'; act.forEach(function (a) { h += '<div class="li"><svg width="18" height="12"><rect x=".5" y=".5" width="17" height="11" rx="2" fill="' + a[1] + '" fill-opacity=".3" stroke="' + a[1] + '"/></svg>' + a[2] + '</div>'; }); h += '<div class="li" style="font-size:11px">Arsir = contested / dianeksasi / vasal</div>'; }
    h += '<h3>Rute</h3>';
    [['#f6e7bd', '8 7', 'Penyeberangan bersejarah'], ['#e79a6a', '2 6', 'Jalur darat Sutura'], ['#ffd35c', '', 'Rute Arc 1'], ['#7fe0ec', '12 5 2 5', 'Koridor angin (usulan)']].forEach(function (r) {
      h += '<div class="li"><svg width="30" height="12"><rect width="30" height="12" rx="3" fill="#1d2a33"/><path d="M3 6h24" stroke="' + r[0] + '" stroke-width="2.2"' + (r[1] ? ' stroke-dasharray="' + r[1] + '"' : '') + '/></svg>' + r[2] + '</div>'; });
    h += '<h3>Relief</h3><div class="ramp" style="background:linear-gradient(90deg,#081d33,#143f5d,#2f7390,#4f9aa6)"></div><div class="rampk"><span>−10 km</span><span>laut</span><span>0</span></div>' +
      '<div class="ramp" style="background:linear-gradient(90deg,#6f4336,#9a6a52,#9c8566,#7a805a,#4b5538)"></div><div class="rampk"><span>kering</span><span>Rhykar</span><span>basah</span></div>' +
      '<div class="ramp" style="background:linear-gradient(90deg,#8a9366,#62905a,#367148,#285f3d)"></div><div class="rampk"><span>kering</span><span>Aëris</span><span>basah</span></div>';
    legEl.innerHTML = h;
  }
  function setLegend(o) { legOpen = o; legEl.classList.toggle('hidden', !o); btnLeg.setAttribute('aria-pressed', String(o)); LS.set('rh-legend', o); }
  btnLeg.addEventListener('click', function () { setLegend(!legOpen); });
  refreshLegend(); setLegend(legOpen);

  // ================================================================ readout (grid data medan)
  var TERR = C.createTerrain(GRID);
  function terrainAt(lat, lon) { return TERR.at(lat, lon); }
  var frameSel = document.getElementById('ro-frame'); frameSel.value = LS.get('rh-frame', 'h');
  frameSel.addEventListener('change', function () { LS.set('rh-frame', frameSel.value); if (lastLL) updRO(lastLL); });
  var roLL = document.getElementById('ro-ll'), roS = document.getElementById('ro-scar'), roT = document.getElementById('ro-ter'), lastLL = null, rafPend = false;
  function updRO(ll) {
    var lat = ll.lat, lon = lonN(ll.lng); if (lat > 90 || lat < -90) { roLL.textContent = 'di luar bola'; return; }
    var f = frameSel.value, lonF = f === 'r' ? lonN(lon - AUR) : (f === 'e' ? lonN(lon - 180) : lon);
    roLL.textContent = fLat(lat) + ' · ' + fLon(lonF);
    var d = scarD(lat, lon); roS.textContent = fmt(Math.abs(d), 1) + '° · ' + fint(Math.abs(d) * KM_DEG) + ' km · ' + PROX_ID[prox(d)] + ' · sisi ' + (d < 0 ? 'Rhykar' : 'Aëris');
    var t = terrainAt(lat, lon); roT.textContent = t ? ((t.el >= 0 ? '+' : '−') + fint(Math.abs(t.el)) + ' m · ' + t.b) : '—';
  }
  map.on('mousemove', function (e) { lastLL = e.latlng; if (rafPend) return; rafPend = true; requestAnimationFrame(function () { rafPend = false; updRO(lastLL); }); });
  map.on('click', function (e) { lastLL = e.latlng; updRO(e.latlng); });
  document.getElementById('readout').addEventListener('click', function (e) { if (e.target.tagName !== 'SELECT') this.classList.toggle('open'); });
  updRO(map.getCenter());

  // ================================================================ skala
  var scT = document.getElementById('scale-t'), scB = document.getElementById('scale-b');
  function updScale() { var kmpx = KM_DEG / Math.pow(2, map.getZoom()); var cands = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000]; var best = cands[0];
    cands.forEach(function (c) { if (c / kmpx <= 150) best = c; }); scB.style.width = Math.round(best / kmpx) + 'px'; scT.textContent = fint(best) + ' km (utara–selatan)'; }
  map.on('zoomend', updScale); updScale();

  // ================================================================ ukur jarak
  var btnMeas = document.getElementById('btn-measure'); mA = null; var gMeas = L.layerGroup().addTo(map);
  function gcPath(a, b, n) {
    function v(la, lo) { return [Math.cos(la * D2R) * Math.cos(lo * D2R), Math.cos(la * D2R) * Math.sin(lo * D2R), Math.sin(la * D2R)]; }
    var v1 = v(a[0], a[1]), v2 = v(b[0], b[1]), dot = Math.max(-1, Math.min(1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2])), om = Math.acos(dot), pts = [], prev = a[1];
    for (var i = 0; i <= n; i++) { var t = i / n, s1, s2; if (om < 1e-9) { s1 = 1 - t; s2 = t; } else { s1 = Math.sin((1 - t) * om) / Math.sin(om); s2 = Math.sin(t * om) / Math.sin(om); }
      var x = s1 * v1[0] + s2 * v2[0], y = s1 * v1[1] + s2 * v2[1], z = s1 * v1[2] + s2 * v2[2], la = Math.asin(Math.max(-1, Math.min(1, z))) * R2D, lo = Math.atan2(y, x) * R2D;
      lo += 360 * Math.round((prev - lo) / 360); prev = lo; pts.push([la, lo]); }
    return { pts: pts, deg: om * R2D, km: om * R_KM };
  }
  function measDot(p) { OFFS.forEach(function (dx) { gMeas.addLayer(L.circleMarker([p[0], p[1] + dx], { renderer: svgMeas, radius: 5, color: '#fff', weight: 2, fillColor: '#ff7a3d', fillOpacity: 1 })); }); }
  // Petunjuk langkah (penting di layar sentuh: tidak ada kursor, label tombol tersembunyi)
  var hintEl = document.getElementById('mhint'), hintT = document.getElementById('mhint-t');
  function hint(html) { if (!html) { hintEl.hidden = true; return; } hintT.innerHTML = html; hintEl.hidden = false; }
  function startMeasure(a) {
    measuring = true; btnMeas.setAttribute('aria-pressed', 'true'); map.getContainer().style.cursor = 'crosshair'; gMeas.clearLayers(); mA = a || null; map.closePopup();
    if (window.innerWidth <= 760 && panelOpen) setPanel(false);
    if (mA) { measDot(mA); hint('Titik awal terpasang. Ketuk <b>titik tujuan</b> di peta.'); }
    else hint('Mode ukur aktif. Ketuk <b>titik awal</b> di peta. Ikon kota juga bisa diketuk.');
  }
  function stopMeasure() { measuring = false; btnMeas.setAttribute('aria-pressed', 'false'); map.getContainer().style.cursor = ''; mA = null; hint(null); }
  btnMeas.addEventListener('click', function () { if (measuring) { stopMeasure(); gMeas.clearLayers(); } else startMeasure(); });
  document.getElementById('mhint-x').addEventListener('click', function () { stopMeasure(); gMeas.clearLayers(); });
  function measureAt(ll) {
    var p = [ll.lat, ll.lng];
    if (!mA) { mA = p; gMeas.clearLayers(); measDot(p); hint('Titik awal terpasang. Ketuk <b>titik tujuan</b>.'); return; }
    var r = gcPath(mA, p, 96), end = r.pts[r.pts.length - 1];
    var tipHTML = '<b>' + fint(r.km) + ' km</b> · ' + fmt(r.deg, 1) + '° busur<br>jalan kaki ≈ ' + fint(r.km / 25) + ' hari · berkuda ≈ ' + fint(r.km / 50) + ' hari<br>kapal layar ≈ ' + fint(r.km / 130) + ' hari <span style="opacity:.7">(estimasi kasar)</span>';
    OFFS.forEach(function (dx) {
      gMeas.addLayer(L.polyline(shift(r.pts, dx), { renderer: svgMeas, color: '#000', weight: 5, opacity: 0.35 }));
      gMeas.addLayer(L.polyline(shift(r.pts, dx), { renderer: svgMeas, color: '#fff3d6', weight: 2.2, dashArray: '6 5' }));
      var cm = L.circleMarker([end[0], end[1] + dx], { renderer: svgMeas, radius: 5, color: '#fff', weight: 2, fillColor: '#ff7a3d', fillOpacity: 1 }); gMeas.addLayer(cm);
      cm.bindTooltip(tipHTML, { permanent: true, direction: 'right', className: 'rt measure-tip', offset: [8, 0] }).openTooltip();
    });
    hint('<b>' + fint(r.km) + ' km</b> · ' + fmt(r.deg, 1) + '° busur' +
      '<small>Jalan kaki ≈ ' + fint(r.km / 25) + ' hari · berkuda ≈ ' + fint(r.km / 50) + ' hari · kapal layar ≈ ' + fint(r.km / 130) + ' hari (estimasi kasar). Ketuk titik baru untuk mengukur lagi.</small>');
    mA = null;
  }
  map.on('click', function (e) { if (measuring) measureAt(e.latlng); });

  // ================================================================ declutter label (anti-tabrakan)
  // Ikon marker selalu tampil; nama marker ditempatkan kanan/kiri menurut prioritas (ibukota > kota > pelabuhan > lainnya,
  // lalu kanon > turunan > inferensi), disembunyikan bila kedua sisi bertabrakan. Label wilayah kecil menjadi penghalang.
  function overlap(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
  var PRI = { capital: 0, city: 1, port: 2, market: 2, fortress: 3, kingdom: 3, landmark: 3, gate: 3 }, EPR = { kanon: 0, turunan: 1, inferensi: 2, terbuka: 3 };
  var dclQ = false;
  function declutter() {
    dclQ = false;
    if (!map.hasLayer(gMarkers)) return;
    var size = map.getSize(), pad = 60, obst = [], items = [], cr = map.getContainer().getBoundingClientRect();
    gMarkers.eachLayer(function (m) {
      var el = m.getElement(); if (!el || !m._rh) return;
      var pt = map.latLngToContainerPoint(m.getLatLng());
      if (pt.x < -pad || pt.y < -pad || pt.x > size.x + pad || pt.y > size.y + pad) return;
      var s = m._rhs, nm = el.querySelector('.mk-name');
      obst.push([pt.x - s / 2, pt.y - s / 2, pt.x + s / 2, pt.y + s / 2, m]);
      if (nm) { nm.classList.remove('hide'); items.push({ m: m, p: m._rh, pt: pt, s: s, nm: nm }); }
    });
    if (map.hasLayer(gLabels)) gLabels.eachLayer(function (m) {
      var el = m.getElement(); if (!el) return; var lb = el.querySelector('.mlbl');
      if (!lb || lb.classList.contains('lbl-continent') || lb.classList.contains('big')) return;
      var r = lb.getBoundingClientRect(); if (!r.width) return;
      var x0 = r.left - cr.left, y0 = r.top - cr.top;
      if (x0 > size.x || y0 > size.y || x0 + r.width < 0 || y0 + r.height < 0) return;
      obst.push([x0, y0, x0 + r.width, y0 + r.height, null]);
    });
    items.sort(function (a, b) { var pa = PRI[a.p.cat] != null ? PRI[a.p.cat] : 4, pb = PRI[b.p.cat] != null ? PRI[b.p.cat] : 4;
      return (pa - pb) || ((EPR[a.p.epi] || 0) - (EPR[b.p.epi] || 0)); });
    var placed = [];
    items.forEach(function (it) {
      var w = it.nm.offsetWidth, h = it.nm.offsetHeight; if (!w) return;
      var x = it.pt.x, y = it.pt.y, s2 = it.s / 2;
      var R = [x + s2 + 1, y - h / 2 + 1, x + s2 + 3 + w, y + h / 2 - 1], Lf = [x - s2 - 3 - w, y - h / 2 + 1, x - s2 - 1, y + h / 2 - 1];
      var cand = LBL_SIDE[it.p.id] === 'l' ? [['l', Lf], ['r', R]] : [['r', R], ['l', Lf]], ok = null;
      for (var i = 0; i < cand.length && !ok; i++) {
        var rc = cand[i][1], hit = false;
        for (var j = 0; j < obst.length && !hit; j++) if (obst[j][4] !== it.m && overlap(rc, obst[j])) hit = true;
        for (var k = 0; k < placed.length && !hit; k++) if (overlap(rc, placed[k])) hit = true;
        if (!hit) ok = cand[i];
      }
      if (ok) { placed.push(ok[1]); it.nm.classList.toggle('l', ok[0] === 'l'); } else it.nm.classList.add('hide');
    });
  }
  function queueDeclutter() { if (dclQ) return; dclQ = true; requestAnimationFrame(declutter); }
  map.on('zoomend moveend', queueDeclutter);
  map.on('layeradd layerremove', function (e) { if (e.layer === gMarkers || e.layer === gLabels) queueDeclutter(); });
  window.addEventListener('resize', queueDeclutter);

  // ================================================================ bungkus dunia (antimeridian)
  // worldCopyJump memindah panel peta tepat satu lebar dunia saat menyeberang; salinan -360/0/+360 membuatnya tak terlihat.
  // Yang tidak disalin (popup, label graticule) disusulkan di sini.
  function fixPopupCopy() {
    if (!popup.isOpen()) return;
    var ll = popup.getLatLng(), k = Math.round((map.getCenter().lng - ll.lng) / 360);
    if (!k) return;
    var ap = popup.options.autoPan; popup.options.autoPan = false; popup.setLatLng([ll.lat, ll.lng + 360 * k]); popup.options.autoPan = ap;
  }
  var lastLng = null;
  map.on('move', function () {
    var c = map.getCenter().lng;
    if (lastLng !== null && Math.abs(c - lastLng) > 90) { drawGratLabels(); queueDeclutter(); }
    lastLng = c; fixPopupCopy();
  });
  map.on('moveend', function () {           // inersia / flyTo bisa berhenti di salinan tetangga -> kembalikan ke salinan tengah
    var c = map.getCenter().lng;
    if (Math.abs(c) <= 180) return;
    var k = Math.round(c / 360), ww = 360 * Math.pow(2, map.getZoom());
    map.panBy([-ww * k, 0], { animate: false });
  });
  function closeStaleTips() { map.eachLayer(function (l) { var t = l.getTooltip && l.getTooltip(); if (t && !t.options.permanent && l.isTooltipOpen()) l.closeTooltip(); }); }
  map.on('dragstart dragend zoomstart', closeStaleTips);

  // ================================================================ render awal & tautan dalam
  applyFilters(); drawGratLabels(); queueDeclutter();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueDeclutter);
  var h0 = (location.hash || '').replace('#', '');
  if (h0 && placeById[h0]) setTimeout(function () { goPlace(h0); }, 300);
  map.on('popupclose', function () { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
