/* Master Map Rhykaris — globe 3D: adapter3D untuk SEMUA layer v1.4.
   Strategi: layer vektor digambar ke satu canvas ekuirektangular lalu dikomposit sebagai tekstur alfa di atas albedo (urutan z sama dengan
   pane Leaflet di peta datar). Marker, label wilayah, label graticule dan cincin anomali adalah elemen DOM terproyeksi yang hanya tampil
   di sisi globe yang menghadap kamera. Satu data.json, satu tabel gaya (styles) dari app.js — tidak ada duplikasi data.
   Registri: LAYERS[key].adapter3D diisi di sini; state on/off dibagi dengan peta datar. */
(function (root) {
'use strict';
var RH = root.RH, G = RH.G, D2R = G.D2R, R2D = G.R2D, clamp = G.clamp;

G.createLayers = function (S, ctx, labelsEl) {
  var C = ctx.C, DATA = ctx.DATA, LAY = ctx.LAYERS, ST = ctx.styles, FAC = ctx.FAC, SC = ST.SC, OFFS = [-360, 0, 360];
  var OW = Math.min(4096, S.maxTex), OH = OW / 2, LW = OW / 1640;     // LW: pengali tebal garis (px canvas per px CSS peta datar)
  var cv = document.createElement('canvas'); cv.width = OW; cv.height = OH;
  var g = cv.getContext('2d');
  var tex = S.makeTexture(cv);
  S.mat.uniforms.uOverlay.value = tex; S.mat.uniforms.uOverlayOn.value = 1; S.overlayTex = tex;
  var X = function (lon) { return (lon + 180) / 360 * OW; }, Y = function (lat) { return (90 - lat) / 180 * OH; };
  var A = {};        // key → adapter {z, paint, dom, hit, reason}
  var pend = false, needs = true, shown = false, lastPR = 0;
  // Tebal garis data konstan di LAYAR (bukan di tekstur): tekstur membesar saat kamera mendekat, jadi lebar tekstur dikompensasi, lalu mengecil mengikuti zoom (C.lineK).
  // Tekstur digambar ulang bila pembesarannya bergeser > ~15 % sejak gambar terakhir (lihat afterRender di bawah).
  var LINE_KEYS = C.TGROUPS.map(function (k) { return 't_' + k; }).concat(['r_historic', 'r_land', 'r_story', 'r_sea', 'fronts']);
  function texPerScreen() { return OW / (2 * Math.PI * S.pxPerRad()) / LW; }
  function gw(b) { return Math.max(1 / LW, C.lineW(b, S.zoomOf(S.view.dist)) * texPerScreen()); }   // ≥ 1 piksel tekstur: lebih tipis dari itu jadi bayangan pudar
  function ga() { return Math.max(0.3 / LW, C.arrowK(S.zoomOf(S.view.dist)) * texPerScreen()); }   // kepala panah ≥ ~3 piksel tekstur, kalau tidak tak terlihat saat zoom dalam

  // ------------------------------------------------------------------ primitif gambar
  function path(pts, dx, close) { g.beginPath(); for (var i = 0; i < pts.length; i++) { var x = X(pts[i][1] + dx), y = Y(pts[i][0]); if (i) g.lineTo(x, y); else g.moveTo(x, y); } if (close) g.closePath(); }
  function dash(d) { g.setLineDash(d ? String(d).split(/[ ,]+/).map(function (n) { return +n * LW; }) : []); }
  /** rings: array of arrays [lat, lon]. o: {close, fill, fa, stroke, sa, w, dash, under:{stroke,sa,w}} */
  function shape(rings, o) {
    var close = o.close !== false;
    for (var k = 0; k < OFFS.length; k++) for (var r = 0; r < rings.length; r++) {
      var pts = rings[r]; if (pts.length < 2) continue;
      if (o.under) { path(pts, OFFS[k], close); g.globalAlpha = o.under.sa; g.strokeStyle = o.under.stroke; g.lineWidth = o.under.w * LW; g.setLineDash([]); g.lineCap = g.lineJoin = 'round'; g.stroke(); }
      path(pts, OFFS[k], close);
      if (o.fill) { g.globalAlpha = o.fa == null ? 1 : o.fa; g.fillStyle = o.fill; g.fill(); }
      if (o.stroke) { g.globalAlpha = o.sa == null ? 1 : o.sa; g.strokeStyle = o.stroke; g.lineWidth = o.w * LW; dash(o.dash); g.lineCap = o.cap || 'round'; g.lineJoin = 'round'; g.stroke(); }
    }
    g.globalAlpha = 1; g.setLineDash([]);
  }
  /** Lingkaran sudut (bola) berjari-jari r derajat di sekitar (lat, lon) → cincin titik [lat, lon]. */
  function cap(lat, lon, r, n) { var out = []; n = n || 90; for (var i = 0; i <= n; i++) out.push(C.destination(lat, lon, i * 360 / n, r)); return out; }
  function arrow(lat, lon, ang, col, scale) {   // segitiga panah (sama bentuk dengan ikon 2D) pada titik akhir rute; ang = derajat layar
    OFFS.forEach(function (dx) {
      g.save(); g.translate(X(lon + dx), Y(lat)); g.rotate(ang * D2R); g.scale(LW * scale, LW * scale);
      g.beginPath(); g.moveTo(-5, -5); g.lineTo(5, 0); g.lineTo(-5, 5); g.lineTo(-2, 0); g.closePath();
      g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 0.8; g.stroke(); g.fill(); g.restore();
    });
  }
  var bearScr = function (a, b) { return Math.atan2(-(b[0] - a[0]), b[1] - a[1]) * R2D; };
  function mkPattern(w, h, draw, rot) {
    var c = document.createElement('canvas'); c.width = Math.ceil(w * LW); c.height = Math.ceil(h * LW);
    var q = c.getContext('2d'); q.scale(c.width / w, c.height / h); draw(q);
    var p = g.createPattern(c, 'repeat'); if (rot && p.setTransform) p.setTransform(new DOMMatrix().rotate(rot)); return p;
  }
  var pForest = null, pBlank = null, pFill = {};
  function forest() { return pForest || (pForest = mkPattern(12, 12, function (q) { q.fillStyle = 'rgba(111,180,106,.10)'; q.fillRect(0, 0, 12, 12); q.fillStyle = 'rgba(191,232,168,.55)'; q.fill(new Path2D('M3 9l2-4 2 4zM8.5 5l1.5-3 1.5 3z')); })); }
  function blank() { return pBlank || (pBlank = mkPattern(14, 14, function (q) { q.fillStyle = 'rgba(242,217,160,.05)'; q.fillRect(0, 0, 14, 14); q.fillStyle = 'rgba(242,217,160,.30)'; q.fillRect(0, 0, 1.2, 14); }, -35)); }
  /** Isian bukan-rata (arsir atau bintik) dari deskriptor bersama C.terrStyle → pola kanvas; di-cache per kunci pola. */
  function pat(fl) { var k = C.patKey(fl), tl; return pFill[k] || (tl = C.patTile(fl), pFill[k] = mkPattern(tl.w, tl.h, tl.draw, tl.rot)); }

  // ------------------------------------------------------------------ penjadwalan repaint
  function repaint() {
    pend = false; needs = false; lastPR = S.pxPerRad();
    g.clearRect(0, 0, OW, OH);
    order.forEach(function (k) { if (LAY[k] && LAY[k].on) { g.save(); A[k].paint(); g.restore(); } });
    if (meas && meas.pts) { g.save(); paintMeas(); g.restore(); }   // hasil ukur selalu paling atas
    tex.needsUpdate = true; S.dirty();
  }
  function schedule() { if (!shown) { needs = true; return; } if (!pend) { pend = true; requestAnimationFrame(repaint); } }
  var order = [];
  // ------------------------------------------------------------------ ukur jarak (bukan layer di panel: tampil selama ada hasil ukur)
  var meas = null;
  function paintMeas() { shape([meas.pts], { close: false, stroke: '#fff3d6', sa: 1, w: 2.2, dash: '6 5', under: { stroke: '#000', sa: 0.35, w: 5 } }); }
  function add(key, o) { A[key] = o; if (LAY[key]) { LAY[key].adapter3D = o; } }

  // ------------------------------------------------------------------ DOM terproyeksi
  var pins = [];
  function pin(o) {   // o: {el, vec, layer, p, kind, dyn, minCos, hit}
    var wrap = G.el('div', 'g-pin' + (o.hit ? ' hit' : '')); wrap.style.display = 'none'; wrap.appendChild(o.el); labelsEl.appendChild(wrap);
    o.wrap = wrap; o.shown = false; o.minCos = o.minCos == null ? 0.07 : o.minCos; pins.push(o); return o;
  }
  var tmp = {};
  function placePins() {
    var c = S.camPos, dist = S.view.dist, i, n, v, dot, cs;
    for (i = 0; i < pins.length; i++) {
      n = pins[i];
      var on = !n.layer || (LAY[n.layer] && LAY[n.layer].on);
      if (on && n.p && ctx.visible && !n.p.isAnomaly && !ctx.visible(n.p)) on = false;
      if (on && n.dyn) n.dyn(n);
      if (!on || !n.vec) { if (n.shown) { n.wrap.style.display = 'none'; n.shown = false; } continue; }
      v = n.vec; dot = v[0] * c[0] + v[1] * c[1] + v[2] * c[2];
      // fc = cos sudut antara normal permukaan dan arah pandang: 1 di pusat piringan, 0 di tepi (limb), < 0 di sisi belakang
      cs = (dot - 1) / Math.sqrt(Math.max(1e-6, dist * dist - 2 * dot + 1));
      if (dot <= 1.0005 || cs < n.minCos) { if (n.shown) { n.wrap.style.display = 'none'; n.shown = false; } continue; }
      S.toScreen(v[0], v[1], v[2], tmp);
      var ox = n.ox || 0, oy = n.oy || 0;
      n.wrap.style.transform = 'translate(' + (tmp.x - ox).toFixed(1) + 'px,' + (tmp.y - oy).toFixed(1) + 'px)';
      n.sx = tmp.x; n.sy = tmp.y;
      if (n.fade) { var f = clamp((cs - n.minCos) / n.fade, 0, 1); n.wrap.style.opacity = f.toFixed(2); }
      if (!n.shown) { n.wrap.style.display = ''; n.shown = true; }
    }
  }
  var lastDecl = 0, declT = 0;
  var DEC = ctx.DECL;
  function declutter() {   // sama dengan peta datar (C.declutterNames): ikon selalu tampil; nama marker kanan/kiri menurut prioritas, disembunyikan bila bentrok
    declT = 0; lastDecl = performance.now();
    var cr = labelsEl.getBoundingClientRect(), obst = [], items = [], pol = [], pp = [];
    pins.forEach(function (n) {
      if (!n.shown) return;
      if (n.kind === 'marker') {
        var s = n.size; obst.push([n.sx - s / 2, n.sy - s / 2, n.sx + s / 2, n.sy + s / 2, n]);
        if (n.nm) { n.nm.classList.remove('hide'); items.push(n); }
      } else if (n.kind === 'label' && n.polity) {   // nama polity Interregna (v2.0.1): bukan penghalang, disaring sesudah nama marker
        n.wrap.classList.remove('hide'); pp.push(n);
      } else if (n.kind === 'label' && n.obstacle) {
        var lb = n.el.firstChild; if (!lb || !lb.getBoundingClientRect) return; var r = lb.getBoundingClientRect(); if (!r.width) return;
        obst.push([r.left - cr.left, r.top - cr.top, r.right - cr.left, r.bottom - cr.top, null]);
      }
    });
    C.declutterNames(items, obst, DEC);
    pp.forEach(function (n) {   // diukur setelah semua 'hide' lama dilepas (satu reflow, bukan satu per label)
      var pb = n.el.firstChild; if (!pb || !pb.getBoundingClientRect) return; var q = pb.getBoundingClientRect(); if (!q.width) return;
      var fit = null;   // lebar bebas poligon di layar: lebar bebas (derajat bujur) × panjang 1° sepanjang paralel di titik label, dari proyeksi dua titik
      if (n.p.room != null) { var a = n.vec, b = G.vec(n.p.lat, n.p.lon + 1); S.toScreen(a[0], a[1], a[2], tmp); var ax = tmp.x, ay = tmp.y; S.toScreen(b[0], b[1], b[2], tmp); fit = n.p.room * Math.hypot(tmp.x - ax, tmp.y - ay); }
      pol.push({ rc: [q.left - cr.left, q.top - cr.top, q.right - cr.left, q.bottom - cr.top], px: n.p.px, fit: fit, hide: function (b) { n.wrap.classList.toggle('hide', b); } });
    });
    if (pol.length) {
      var nmr = []; items.forEach(function (n) { if (n.nm.classList.contains('hide')) return; var q = n.nm.getBoundingClientRect(); if (q.width) nmr.push([q.left - cr.left, q.top - cr.top, q.right - cr.left, q.bottom - cr.top]); });
      C.declutterPolity(pol, obst.concat(nmr));
    }
  }
  function queueDeclutter() { if (declT) return; var wait = Math.max(0, 140 - (performance.now() - lastDecl)); declT = setTimeout(declutter, wait); }
  S.afterRender(function () {
    placePins(); queueDeclutter();
    if (shown && lastPR && !pend) { var r = S.pxPerRad() / lastPR; if ((r > 1.18 || r < 0.85) && LINE_KEYS.some(function (k) { return LAY[k] && LAY[k].on; })) schedule(); }
  });

  // ================================================================== adapter: graticule & meridian
  add('grat', { z: 320, paint: function () {
    for (var lo = -180; lo <= 180; lo += 15) {
      if (lo % 180 === 0 && lo !== 0) continue;   // 180° dilukis oleh layer meridian (Elvari), seperti di peta datar
      g.globalAlpha = lo % 30 === 0 ? 0.22 : 0.12; g.strokeStyle = '#f1ead8'; g.lineWidth = (lo % 30 === 0 ? 0.9 : 0.5) * LW;
      g.beginPath(); g.moveTo(X(lo), 0); g.lineTo(X(lo), OH); g.stroke();
    }
    for (var la = -75; la <= 75; la += 15) {
      g.globalAlpha = la === 0 ? 0.32 : (la % 30 === 0 ? 0.22 : 0.12); g.strokeStyle = '#f1ead8'; g.lineWidth = (la === 0 ? 1.2 : (la % 30 === 0 ? 0.9 : 0.5)) * LW;
      g.beginPath(); g.moveTo(0, Y(la)); g.lineTo(OW, Y(la)); g.stroke();
    }
    g.globalAlpha = 1;
  } });
  add('mer', { z: 321, paint: function () {
    ST.MER.forEach(function (m) {
      [m.lon - 360, m.lon, m.lon + 360].forEach(function (x) {
        if (x < -180 || x > 180) return;
        g.globalAlpha = 0.6; g.strokeStyle = m.col; g.lineWidth = 1.3 * LW; dash('7 6'); g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), OH); g.stroke();
      });
    }); g.globalAlpha = 1; g.setLineDash([]);
  } });
  // label graticule (hanya di sisi depan): bujur di sepanjang ekuator, lintang di sisi kiri tampilan, nama tiga meridian
  function gratLabel(cls, text, tx, ty, layer, dyn) {
    var el = G.el('div', cls, text); el.style.transform = 'translate(' + tx + ',' + ty + ')';
    return pin({ el: el, vec: null, layer: layer, dyn: dyn, minCos: 0.2 });
  }
  var lonLbls = [], latLbls = [];
  for (var lo0 = -180; lo0 < 180; lo0 += 15) (function (lo) {
    var t = lo === 0 ? '0°' : C.fLon(lo).replace(',00', '');
    var v = G.vec(0, lo), n = gratLabel('grat-lbl', t, '-50%', '4px', 'grat', function (nn) { var fine = S.zoomOf(S.view.dist) >= 3.4; nn.vec = (lo % 30 === 0 || fine) ? v : null; });
    n.vec = v; lonLbls.push(n);
  })(lo0);
  [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75].forEach(function (la) {
    var t = la === 0 ? 'ekuator' : C.fLat(la).replace(',00', '');
    gratLabel('grat-lbl', t, '0', '-125%', 'grat', function (nn) {
      var fine = S.zoomOf(S.view.dist) >= 3.4;
      if (!(la % 30 === 0 || fine)) { nn.vec = null; return; }
      nn.vec = G.vec(la, S.view.lon - Math.min(72, 54 / Math.max(Math.cos(la * D2R), 0.4)));
    });
  });
  ST.MER.forEach(function (m) {
    var el = G.el('div', 'mer-lbl', C.esc(m.name)); el.style.color = m.col; el.style.transform = 'translate(3px,0)';
    pin({ el: el, vec: G.vec(52, m.lon), layer: 'mer', minCos: 0.3 });
  });

  // ================================================================== kontur elevasi / batimetri
  function contourPaint(pos) {
    return function () {
      DATA.contours.forEach(function (c) {
        if ((c.lvl > 0) !== pos) return; var st = ST.CST[c.lvl];
        shape([c.pts], { close: false, stroke: st[0], sa: st[1], w: st[2] });
      });
    };
  }
  add('cland', { z: 330, paint: contourPaint(true) });
  add('csea', { z: 331, paint: contourPaint(false) });

  // ================================================================== region fisik
  add('regions', { z: 360, paint: function () {
    DATA.regions.forEach(function (r) {
      var st = ST.REG_STYLE[r.id]; if (!st) return;
      var fill = null, fa = 1;
      if (st.fill === 'url(#p-forest)') fill = forest(); else if (st.fill === 'url(#p-blank)') fill = blank(); else if (st.fill !== 'none') { fill = st.fill; fa = 0.001; }
      shape(r.rings, { fill: fill, fa: fa, stroke: st.nostroke ? null : st.color, sa: st.op || 0.85, w: st.w || 1.3, dash: st.dash });
    });
  } });

  // ================================================================== bank samudra
  add('banks', { z: 361, paint: function () {
    DATA.banks.forEach(function (b) { shape([cap(b.lat, b.lon, b.r, 72)], { fill: '#8fe3e0', fa: 0.05, stroke: '#8fe3e0', sa: 1, w: 1.2, dash: '2 5' }); });
  } });

  // ================================================================== mandala Elvari (gradasi, tanpa tepi)
  add('mandala', { z: 385, paint: function () {
    DATA.mandala.forEach(function (m) { shape(m.rings, { fill: FAC.anusarri.color, fa: ST.MOP[m.ring] }); });
  } });

  // ================================================================== teritori AS 1647 (kelompok = C.TGROUPS)
  // Satu tabel gaya dan satu urutan gambar untuk semua tampilan: kelompok menurut C.TGROUPS (bawah → atas; semua z = 390, urutan penyisipan adapter = urutan kelompok), lalu urutan data.
  var TORD = C.terrOrder(DATA.territories);   // urutan gambar bawah → atas; hit-test memakai kebalikannya
  C.TGROUPS.forEach(function (grp) {
    add('t_' + grp, { z: 390, paint: function () {
      TORD.forEach(function (t) {
        if (t.id === 'anusarri' || C.tgroupOf(t) !== grp) return;
        var f = FAC[t.of || t.id] || { name: t.name, color: '#cccccc' }, ts = C.terrStyle(f, t), fl = ts.fill, sk = ts.stroke;
        shape(C.drawRings(t), { fill: C.patKey(fl) ? pat(fl) : fl.col, fa: C.patKey(fl) ? 1 : fl.a, stroke: sk ? sk.col : null, sa: sk ? sk.a : 1, w: gw(C.LINE.terr * (sk ? sk.k : 1)), dash: sk && sk.dash ? sk.dash : null });
      });
    } });
  });

  // ================================================================== The Scar
  var scarPoly = ctx.scar.outer.concat(ctx.scar.inner);
  add('band', { z: 420, paint: function () {
    shape([scarPoly], { fill: '#ff5a24', fa: 0.14 });
    shape([ctx.scar.outer], { close: false, stroke: '#ff9a5c', sa: 0.55, w: 1, dash: '2 5' });
    shape([ctx.scar.inner], { close: false, stroke: '#ff9a5c', sa: 0.55, w: 1, dash: '2 5' });
  } });
  add('curve', { z: 421, paint: function () {
    shape([ctx.scar.curve], { close: false, stroke: '#ff5a24', sa: 0.16, w: 7 });
    g.shadowColor = 'rgba(255,110,50,.9)'; g.shadowBlur = 6 * LW;
    shape([ctx.scar.curve], { close: false, stroke: '#ff7a3d', sa: 0.95, w: 2.2 });
    g.shadowBlur = 0;
  } });
  add('arcs', { z: 422, paint: function () {
    [-135, -25, 25, 135].forEach(function (a) { var t = [C.circlePt(a, SC.r - SC.half - 1.5), C.circlePt(a, SC.r + SC.half + 1.5)]; shape([t], { close: false, stroke: '#ffc39a', sa: 0.85, w: 1.4 }); });
  } });

  // ================================================================== zona Castra Birath (cincin memudar, BUKAN titik presisi)
  var zonePlace = DATA.places.filter(function (p) { return p.zone_r; })[0];
  add('zone', { z: 423, paint: function () {
    if (!zonePlace) return;
    [1, 0.72, 0.46, 0.24].forEach(function (k, i) { shape([cap(zonePlace.lat, zonePlace.lon, zonePlace.zone_r * k, 60)], { fill: '#ff6a2b', fa: 0.09, stroke: i === 0 ? '#ffb08a' : null, sa: 1, w: 1.2, dash: '3 4' }); });
  } });

  // ================================================================== rute & front
  ['historic', 'land', 'story', 'sea'].forEach(function (kind) {
    add('r_' + kind, { z: 450, paint: function () {
      var st = ST.RST[kind];
      DATA.routes.forEach(function (r) {
        if (r.kind !== kind) return;
        [r.pts].concat(r.pts2 ? [r.pts2] : []).forEach(function (pts) {
          shape([pts], { close: false, stroke: st.color, sa: 0.95, w: gw(st.weight), dash: st.dash, under: { stroke: '#000', sa: 0.28, w: gw(st.weight + C.LINE.under) } });
          var n = pts.length; arrow(pts[n - 1][0], pts[n - 1][1], bearScr(pts[n - 2], pts[n - 1]), st.color, ga());
        });
      });
    } });
  });
  add('fronts', { z: 451, paint: function () {
    DATA.fronts.forEach(function (f) {
      var fl = f.id === 'front_florian', col = fl ? '#2aa38a' : '#ff6a2b';
      shape([f.pts], { close: false, stroke: col, sa: 0.95, w: gw(fl ? C.LINE.florian : C.LINE.front), dash: fl ? '1 5' : '6 4' });
      var last = f.pts[f.pts.length - 1], tgt = f.arrow_to;
      if (fl) { var mid = f.pts[Math.floor(f.pts.length / 2)]; shape([[mid, tgt]], { close: false, stroke: col, sa: 0.9, w: gw(C.LINE.shaftFlorian) }); arrow(tgt[0], tgt[1], bearScr(mid, tgt), col, ga()); }
      else { shape([[last, tgt]], { close: false, stroke: col, sa: 0.95, w: gw(C.LINE.shaft), dash: '6 4' }); arrow(tgt[0], tgt[1], bearScr(last, tgt), col, ga()); }
    });
  } });

  // ================================================================== marker lokasi (44 titik: 22 marker + 22 label), kantong anomali
  var markerPins = [], labelPins = [];
  DATA.places.forEach(function (p) {
    var v = G.vec(p.lat, p.lon);
    if (p.label_only) {
      var el = G.el('div', null, ctx.labelHTML(p));
      var np = pin({ el: el, vec: v, layer: 'labels', p: p, kind: 'label', minCos: 0.3, fade: 0.2, obstacle: !(p.cat === 'continent' || p.id === 'tamtu') });
      labelPins.push(np);
    } else {
      var sz = p.cat === 'capital' ? 26 : (p.cat === 'town' ? 20 : 23);
      var me = G.el('div', null, ctx.markerHTML(p, sz)), mk = me.firstChild;
      mk.setAttribute('role', 'button'); mk.tabIndex = 0; mk.setAttribute('aria-label', p.name + (p.proposal ? ' (usulan)' : '') + ', status koordinat ' + C.EPI[p.epi]); mk.title = p.name;
      var open = function (e) { e.stopPropagation(); if (ctx.measuring && ctx.measuring()) ctx.measureAt(p.lat, p.lon); else G.openHit({ type: 'place', id: p.id }); };
      mk.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
      var mp = pin({ el: me, vec: v, layer: 'markers', p: p, kind: 'marker', size: sz, ox: sz / 2, oy: sz / 2, minCos: 0.05, fade: 0.12 });
      mp.nm = mk.querySelector('.mk-name'); markerPins.push(mp);
    }
  });
  // nama polity Interregna (v2.0.1): label di atas poligon, elemen yang sama dengan peta datar; tidak interaktif (klik dan hover jatuh ke poligon di bawahnya)
  (ctx.POLY || []).forEach(function (p) {
    labelPins.push(pin({ el: G.el('div', null, ctx.labelHTML(p)), vec: G.vec(p.lat, p.lon), layer: 'labels', p: p, kind: 'label', polity: true, minCos: 0.3, fade: 0.2, obstacle: false }));
  });
  DATA.anomalies.forEach(function (a) {
    var el = G.el('div', 'g-anom', '<b></b><i role="button" tabindex="0" aria-label="' + C.esc(a.name) + '"></i>');
    var ring = el.querySelector('i'); ring.title = a.name;
    var open = function (e) { e.stopPropagation(); if (ctx.measuring && ctx.measuring()) ctx.measureAt(a.lat, a.lon); else G.openHit({ type: 'place', id: a.id }); };
    ring.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
    pin({ el: el, vec: G.vec(a.lat, a.lon), layer: 'anom', p: { isAnomaly: true }, a: a, kind: 'anom', minCos: 0.08 });
  });
  add('markers', { z: 0 }); add('labels', { z: 0 }); add('anom', { z: 0 });

  // titik awal, titik tujuan, dan kotak hasil di titik tujuan (pin DOM tak interaktif, tampil hanya di sisi globe yang menghadap kamera)
  var mDot = [0, 1].map(function (i) { return pin({ el: G.el('div', 'g-mdot ' + (i ? 'b' : 'a')), vec: null, kind: 'meas', minCos: 0.03, ox: 7, oy: 7 }); });
  var mTip = pin({ el: G.el('div', 'g-mtip'), vec: null, kind: 'meas', minCos: 0.12, ox: -12, oy: 16,
    dyn: function (n) { var w = n.el.offsetWidth || 270; n.ox = n.sx != null && n.sx + w + 28 > S.W ? w + 12 : -12; } });   // kotak hasil pindah ke kiri titik bila hampir menyentuh tepi kanan
  mDot.concat([mTip]).forEach(function (n) { n.wrap.classList.add('g-mpin'); });
  function setMeasure(m) {
    meas = m && m.a ? m : null;
    mDot[0].vec = meas ? G.vec(meas.a[0], meas.a[1]) : null;
    mDot[1].vec = meas && meas.b ? G.vec(meas.b[0], meas.b[1]) : null;
    mTip.vec = mDot[1].vec; if (meas && meas.tip) mTip.el.innerHTML = meas.tip;
    schedule(); S.dirty();
  }

  order = Object.keys(A).filter(function (k) { return A[k].paint; }).sort(function (a, b) { return A[a].z - A[b].z; });

  // ------------------------------------------------------------------ peristiwa layer / filter / tata letak
  ctx.onEvent(function (type, key) {
    if (type === 'layer') { var a = A[key]; if (a && a.paint) schedule(); else if (a) { S.dirty(); } }
    else if (type === 'filters') { S.dirty(); queueDeclutter(); }
  });

  // ================================================================== hit-test (klik & tooltip) — urutan = z pane Leaflet, atas dulu
  function inRing(lat, lon, ring) {
    for (var k = -1; k <= 1; k++) {
      var x = lon + 360 * k, c = false;
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
        if ((yi > lat) !== (yj > lat) && x < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c;
      }
      if (c) return true;
    }
    return false;
  }
  function distSeg(lat, lon, a, b) {   // jarak (derajat) dari titik ke ruas, bidang lintang-bujur ber-skala cos(lintang)
    var k = Math.cos(lat * D2R), best = 1e9;
    for (var s = -1; s <= 1; s++) {
      var px = (lon + 360 * s) * k, py = lat, ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      var t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
      best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
    }
    return best;
  }
  function nearLine(lat, lon, pts, tol) { for (var i = 1; i < pts.length; i++) if (distSeg(lat, lon, pts[i - 1], pts[i]) <= tol) return true; return false; }
  function nearRing(lat, lon, ring, tol) { return nearLine(lat, lon, ring.concat([ring[0]]), tol); }
  var ARC_RANGES = [['culmen', [[-25, 25]]], ['latus_orientale', [[25, 135]]], ['ima', [[135, 180], [-180, -135]]], ['latus_occidentale', [[-135, -25]]]];
  function on(k) { return LAY[k] && LAY[k].on; }
  function hit(lat, lon, degPx) {
    var tol = Math.max(0.15, degPx * 6), r, i, h;
    // rute dan front (pane route 450)
    var rk = { historic: 'r_historic', land: 'r_land', story: 'r_story', sea: 'r_sea' };
    for (i = 0; i < DATA.routes.length; i++) { r = DATA.routes[i]; if (on(rk[r.kind]) && (nearLine(lat, lon, r.pts, tol) || (r.pts2 && nearLine(lat, lon, r.pts2, tol)))) return { type: 'route', route: r, name: r.name }; }
    if (on('fronts')) for (i = 0; i < DATA.fronts.length; i++) { r = DATA.fronts[i]; if (nearLine(lat, lon, r.pts, tol)) return { type: 'route', route: r, name: r.name }; }
    // scar (pane 420): zona Castra Birath, empat busur
    if (zonePlace && on('zone') && C.angDist(lat, lon, zonePlace.lat, zonePlace.lon) <= zonePlace.zone_r) return { type: 'place', id: zonePlace.id, name: zonePlace.name };
    if (on('arcs')) {
      var d = C.scarD(lat, lon);
      if (Math.abs(d) <= SC.half) {
        var b = C.bearing(SC.lat, SC.lon, lat, lon); b = b > 180 ? b - 360 : b;
        for (i = 0; i < ARC_RANGES.length; i++) for (var j = 0; j < ARC_RANGES[i][1].length; j++) { var rg = ARC_RANGES[i][1][j]; if (b >= rg[0] && b <= rg[1]) { var pa = ctx.placeById[ARC_RANGES[i][0]]; return { type: 'place', id: ARC_RANGES[i][0], name: pa ? pa.name : ARC_RANGES[i][0] }; } }
      }
    }
    // teritori (pane 390)
    for (i = TORD.length - 1; i >= 0; i--) {   // atas dulu = kebalikan urutan gambar (kelompok C.TGROUPS lalu urutan data)
      var t = TORD[i]; if (t.id === 'anusarri' || !on('t_' + C.tgroupOf(t))) continue;
      for (var q = 0; q < t.rings.length; q++) if (inRing(lat, lon, t.rings[q])) { var fid = t.of || t.id, f = FAC[fid]; return { type: 'faction', id: fid, name: f ? f.name : t.name }; }
    }
    // mandala (pane 385): yang digambar terakhir ada di atas
    if (on('mandala')) for (i = DATA.mandala.length - 1; i >= 0; i--) { var m = DATA.mandala[i]; for (q = 0; q < m.rings.length; q++) if (inRing(lat, lon, m.rings[q])) return { type: 'mandala', ring: m.ring, name: 'Mandala Kemurnian · Ring ' + m.ring }; }
    // bank samudra, region fisik (pane 360)
    if (on('banks')) for (i = 0; i < DATA.banks.length; i++) if (C.angDist(lat, lon, DATA.banks[i].lat, DATA.banks[i].lon) <= DATA.banks[i].r) return { type: 'bank', name: 'Bank samudra (lapisan fisik v4)' };
    if (on('regions')) for (i = 0; i < DATA.regions.length; i++) {
      var rr = DATA.regions[i], st = ST.REG_STYLE[rr.id]; if (!st) continue;
      for (q = 0; q < rr.rings.length; q++) { var inside = st.fill !== 'none' ? inRing(lat, lon, rr.rings[q]) : (!st.nostroke && nearRing(lat, lon, rr.rings[q], tol));
        if (inside) { var pn = ctx.placeById[st.open]; return { type: 'place', id: st.open, name: pn ? pn.name : rr.id }; } }
    }
    return null;
  }

  /** Pin DOM di bawah piksel (px, py relatif kontainer globe): marker, lalu cincin anomali, lalu label. Interaksi pointer selalu lewat kanvas
   *  (pin tidak menangkap pointer), jadi menyeret globe dari atas marker atau label tetap memutar globe; klik tanpa geser membuka kartu. */
  function pinAt(px, py, mult) {
    mult = mult || 1; var best = null, bd = 1e9, i, n, d;
    for (i = 0; i < pins.length; i++) {
      n = pins[i]; if (!n.shown) continue;
      if (n.kind === 'marker') { d = Math.hypot(n.sx - px, n.sy - py); if (d <= (n.size / 2 + 4) * mult && d < bd) { bd = d; best = { type: 'place', id: n.p.id, name: n.p.name }; } }
    }
    if (best) return best;
    for (i = 0; i < pins.length; i++) {
      n = pins[i]; if (!n.shown || n.kind !== 'anom') continue;
      d = Math.hypot(n.sx - px, n.sy - py); if (d <= 18 * mult && d < bd) { bd = d; best = { type: 'place', id: n.a.id, name: n.a.name }; }
    }
    if (best) return best;
    var cr = labelsEl.getBoundingClientRect(), area = 1e12;
    for (i = 0; i < pins.length; i++) {
      n = pins[i]; if (!n.shown || n.kind !== 'label' || n.polity) continue;   // nama polity tak mencegat klik: jatuh ke poligon di bawahnya
      var lb = n.el.firstChild; if (!lb || !lb.getBoundingClientRect) continue; var r = lb.getBoundingClientRect(), pad = 2 * mult;
      if (px >= r.left - cr.left - pad && px <= r.right - cr.left + pad && py >= r.top - cr.top - pad && py <= r.bottom - cr.top + pad && r.width * r.height < area) { area = r.width * r.height; best = { type: 'place', id: n.p.id, name: n.p.name }; }
    }
    return best;
  }

  return {
    hit: hit, pinAt: pinAt, A: A, pins: pins, repaint: repaint, overlaySize: OW, setMeasure: setMeasure, measure: function () { return meas; },
    onShow: function () { shown = true; repaint(); },
    onHide: function () { shown = false; },
    status: function () { var o = {}; Object.keys(LAY).forEach(function (k) { o[k] = !!LAY[k].adapter3D; }); return o; }
  };
};
})(typeof window !== 'undefined' ? window : globalThis);
