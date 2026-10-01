/* Master Map Rhykaris — globe 3D: perakit (RH.globe.init), panel "Globe", dock, kartu info, tooltip, kompas 3D, putaran otomatis.
   Dipanggil app.js setelah three.js termuat. Mengembalikan pengendali {show, hide, getFocus, goPlace, goFaction, closeCard}. */
(function (root) {
'use strict';
var RH = root.RH, G = RH.G, D2R = G.D2R, R2D = G.R2D, clamp = G.clamp;

RH.globe = {
  init: function (THREE, ctx) {
    G.THREE = THREE; G.ctx = ctx;
    var C = ctx.C, LS = ctx.LS, esc = ctx.esc, REDUCED = ctx.REDUCED;
    var app = document.getElementById('app');

    // ------------------------------------------------------------ DOM
    var rootEl = G.el('div', 'v2-chrome'); rootEl.id = 'globe'; rootEl.hidden = true; rootEl.setAttribute('data-z', '1');
    app.insertBefore(rootEl, document.getElementById('map').nextSibling);
    var S = G.createScene(rootEl, ctx); G.S = S;
    var labelsEl = G.el('div', 'g-labels'); rootEl.appendChild(labelsEl); G.labelsEl = labelsEl;
    var tipEl = G.el('div', 'g-tip'); tipEl.hidden = true; rootEl.appendChild(tipEl);
    var cardEl = ctx.card.el;   // kartu info bersama (dibuat app.js; isi dari pembangun popup 2D)
    var dockEl = G.el('div', 'v2-chrome'); dockEl.id = 'g-dock'; dockEl.hidden = true; dockEl.setAttribute('role', 'group'); dockEl.setAttribute('aria-label', 'Kontrol globe');
    app.appendChild(dockEl);

    var st = { spin: false, period: LS.get('rh-g-period', 90), hover: null, shown: false, cardKey: null, meas: false };
    var layers = G.createLayers ? G.createLayers(S, ctx, labelsEl) : null; G.layers = layers;
    var bodies = G.createBodies ? G.createBodies(S, ctx, labelsEl) : null; G.bodies = bodies;
    if (G.createRelief) G.relief = G.createRelief(S, ctx);

    // ------------------------------------------------------------ putar otomatis (≈ 90 dtk / putaran; berhenti saat disentuh)
    var btnSpin, btnFocus, btnSys;
    function setSpin(on) {
      st.spin = !!on && !REDUCED;
      [btnSpin, document.getElementById('g-spin')].forEach(function (b) { if (!b) return; b.setAttribute('aria-pressed', String(st.spin));
        var lbl = b.querySelector('.lbl'); if (lbl) lbl.textContent = st.spin ? 'Jeda' : 'Putar';
        var ic = b.querySelector('.ic'); if (ic) ic.innerHTML = st.spin ? PAUSE : PLAY; if (!lbl && b.id === 'g-spin') b.innerHTML = '<span class="ic">' + (st.spin ? PAUSE : PLAY) + '</span> ' + (st.spin ? 'Jeda putaran' : 'Putar'); });
    }
    S.onFrame(function (dt) { if (st.spin) { S.view.lon -= 360 / st.period * dt; S.dirty(); } });
    S.onUserInput = function () { if (st.spin) setSpin(false); };
    S.onDragStart = function () { hideTip(); };
    var PLAY = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 2.8v10.4L13 8z" fill="currentColor"/></svg>';
    var PAUSE = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor"/></svg>';
    var ICON_FOCUS = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/></svg>';
    var ICON_MOON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="6" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12.4" cy="4.4" r="1.5" fill="currentColor"/><ellipse cx="8" cy="8" rx="6.6" ry="3" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 2" transform="rotate(-22 8 8)"/></svg>';
    function dockBtn(id, icon, label, title, fn) {
      var b = G.el('button', 'tbtn', icon + '<span class="lbl">' + label + '</span>'); b.type = 'button'; b.id = id; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', fn); dockEl.appendChild(b); return b;
    }
    btnSpin = dockBtn('g-dock-spin', '<span class="ic">' + PLAY + '</span>', 'Putar', REDUCED ? 'Putaran otomatis dinonaktifkan oleh pengaturan "kurangi gerakan"' : 'Putar atau jeda rotasi planet (berhenti saat globe disentuh)', function () { setSpin(!st.spin); });
    btnSpin.setAttribute('aria-pressed', 'false'); if (REDUCED) btnSpin.disabled = true;
    btnFocus = dockBtn('g-dock-focus', ICON_FOCUS, 'Fokus planet', 'Fokus planet: dekatkan kamera ke planet', function () { ctl.focusPlanet(); });
    btnSys = dockBtn('g-dock-sys', ICON_MOON, 'Sistem bulan', 'Lihat sistem bulan: mundurkan kamera agar kedua orbit terlihat', function () { ctl.viewMoonSystem(); });

    // ------------------------------------------------------------ kartu info
    function closeCard() { ctx.card.close(); }
    function openCard(html, key, hash) { ctx.card.open(html, key, hash); }
    cardEl.addEventListener('click', function (ev) {   // tombol khusus kartu bulan (aksi umum — salin koordinat, ukur, kuasa — ditangani app.js)
      var b = ev.target.closest && ev.target.closest('[data-g]'); if (!b) return;
      var a = b.getAttribute('data-g'); if (a === 'sys') ctl.viewMoonSystem(); else if (a === 'planet') ctl.focusPlanet();
    });
    G.openCard = openCard; G.closeCard = closeCard;
    function openHit(h) {
      if (!h) return false;
      if (h.type === 'place') openCard(ctx.cards.place(ctx.placeById[h.id]), 'place:' + h.id, h.id);
      else if (h.type === 'faction') openCard(ctx.cards.faction(h.id), 'fac:' + h.id);
      else if (h.type === 'mandala') openCard(ctx.cards.mandala(h.ring), 'mandala:' + h.ring);
      else if (h.type === 'route') openCard(ctx.cards.route(h.route), 'route:' + h.route.id);
      else if (h.type === 'bank') openCard(ctx.cards.bank, 'bank');
      else if (h.type === 'moon') openCard(bodies.cardHTML(h.moon), 'moon:' + h.moon.id);
      else return false;
      return true;
    }
    G.openHit = openHit;

    // ------------------------------------------------------------ hover (readout identik 2D, kompas, tooltip) dan klik
    var tipTxt = '', hoverRaf = 0, hoverPx = null, lastRef = 0, tmpA = {}, tmpB = {};
    function hideTip() { if (!tipEl.hidden) tipEl.hidden = true; rootEl.classList.remove('pick'); }
    function refPoint() {
      if (st.hover) return { lat: st.hover.lat, lon: st.hover.lon, src: 'kursor' };
      return { lat: clamp(S.view.lat, -88, 88), lon: C.lonN(S.view.lon), src: 'pusat' };
    }
    function updateCompass() {
      var r = refPoint(), P = G.vec(r.lat, r.lon), s0 = S.toScreen(P[0], P[1], P[2], tmpA), sc = C.scarCompass(r.lat, r.lon);
      if (r.src === 'pusat') ctx.readout({ lat: r.lat, lng: r.lon });   // tanpa kursor (layar sentuh): readout mengikuti pusat tampilan
      function ang(brg) { var q = C.destination(r.lat, r.lon, brg, 0.8), Q = G.vec(q[0], q[1]), s1 = S.toScreen(Q[0], Q[1], Q[2], tmpB); return G.screenAngle(s1.x - s0.x, s1.y - s0.y); }
      ctx.compass.update({ lat: r.lat, lon: r.lon, source: r.src, northDeg: ang(0), scarDeg: sc.singular ? 0 : ang(sc.bearing), behind: !S.front(P[0], P[1], P[2], 0) });
    }
    function trackHover() {
      hoverRaf = 0;
      if (!hoverPx) return;
      var p = S.pick(hoverPx.x, hoverPx.y);
      st.hover = p ? { lat: p.lat, lon: p.lon } : null;
      if (p) ctx.readout({ lat: p.lat, lng: p.lon });
      var h = null, moon = bodies && bodies.moonAt(hoverPx.x, hoverPx.y);
      if (moon) h = { type: 'moon', moon: moon, name: moon.name + ' (Inferensi AI)' };
      else if (layers && (h = layers.pinAt(hoverPx.x, hoverPx.y))) { /* marker, anomali atau label */ }
      else if (p && layers) h = layers.hit(p.lat, p.lon, S.degPerPx());
      if (h && h.name) { tipEl.textContent = h.name; tipEl.hidden = false; tipEl.style.transform = 'translate(' + Math.round(hoverPx.x + 14) + 'px,' + Math.round(hoverPx.y + 14) + 'px)'; rootEl.classList.add('pick'); }
      else hideTip();
      updateCompass();
    }
    S.onHover = function (e, p) { hoverPx = p; if (!hoverRaf) hoverRaf = requestAnimationFrame(trackHover); };
    S.onLeave = function () { hoverPx = null; st.hover = null; hideTip(); updateCompass(); };
    S.onClick = function (e, p) {
      if (st.meas) {   // mode ukur: marker (bukan label wilayah) menjadi titik tepat; selain itu titik di permukaan bola
        var mpn = layers && layers.pinAt(p.x, p.y, e.pointerType === 'touch' ? 1.9 : 1), mpl = mpn && ctx.placeById[mpn.id], mll = S.pick(p.x, p.y);
        if (mpl && !mpl.label_only) ctx.measureAt(mpl.lat, mpl.lon); else if (mll) ctx.measureAt(mll.lat, mll.lon);
        return;
      }
      var moon = bodies && bodies.moonAt(p.x, p.y), ll = S.pick(p.x, p.y);
      if (moon) { openHit({ type: 'moon', moon: moon }); return; }
      var pn = layers && layers.pinAt(p.x, p.y, e.pointerType === 'touch' ? 1.9 : 1);
      if (pn) { openHit(pn); return; }
      if (ll) { ctx.readout({ lat: ll.lat, lng: ll.lon }); st.hover = { lat: ll.lat, lon: ll.lon }; hoverPx = p; }
      var h = ll && layers ? layers.hit(ll.lat, ll.lon, S.degPerPx() * (e.pointerType === 'touch' ? 2.4 : 1)) : null;
      if (h && openHit(h)) return;
      closeCard();
    };
    S.afterRender(function () {   // bola berputar di bawah kursor tetap → perbarui titik acuan, readout, kompas (≈ 15 Hz)
      var now = performance.now(); if (now - lastRef < 66) return; lastRef = now;
      if (hoverPx && !hoverRaf) hoverRaf = requestAnimationFrame(trackHover); else if (!hoverPx) updateCompass();
    });
    // data-z (aturan z-level label peta datar) dihitung dari jarak kamera
    S.afterRender(function () { var z = clamp(Math.floor(S.zoomOf(S.view.dist) - 0.6), 0, 7); if (rootEl.getAttribute('data-z') !== String(z)) rootEl.setAttribute('data-z', String(z)); });

    // ------------------------------------------------------------ panel "Globe"
    var sec = document.getElementById('sec-globe'); sec.innerHTML = '';
    var PERIODS = [30, 60, 90, 180, 300], MSPEEDS = [0, 0.25, 0.5, 1, 2, 4, 8];
    var mIdx = REDUCED ? 0 : LS.get('rh-g-moonspeed', 3); if (MSPEEDS[mIdx] == null) mIdx = 3;
    function mname(id) { var m = bodies && bodies.byId(id); return m ? m.name : id; }   // nama kerja bulan dari data/moons.json
    function grp(title, inner) { var d = G.el('div', 'grp gctl', '<h3>' + title + '</h3>' + inner); sec.appendChild(d); return d; }
    var spinG = grp('Putaran planet',
      '<div class="btns"><button type="button" class="btn" id="g-spin" aria-pressed="false"></button></div>' +
      '<label class="row" for="g-period"><span>Satu putaran penuh</span><span class="val" id="g-period-v"></span></label>' +
      '<input type="range" id="g-period" min="0" max="' + (PERIODS.length - 1) + '" step="1" aria-label="Waktu satu putaran penuh">' +
      '<p class="note">' + (REDUCED ? '<b class="bad">Dinonaktifkan</b> oleh pengaturan <i>kurangi gerakan</i> perangkat. ' : '') + 'Berhenti saat globe disentuh, diklik, atau diseret; lanjutkan lewat tombol. Arah putaran (barat → timur) ilustratif.</p>');
    var moonG = grp('Dua bulan ' + C.chip('inferensi'),
      '<div class="btns"><button type="button" class="btn" id="g-focus">Fokus planet</button><button type="button" class="btn" id="g-sys">Lihat sistem bulan</button></div>' +
      '<div class="btns"><button type="button" class="btn" id="g-m-besar" title="Buka kartu ' + esc(mname('bulan_besar')) + ' (bulan besar)">' + esc(mname('bulan_besar')) + '</button><button type="button" class="btn" id="g-m-kecil" title="Buka kartu ' + esc(mname('bulan_kecil')) + ' (bulan kecil)">' + esc(mname('bulan_kecil')) + '</button></div>' +
      '<label class="row" for="g-mspeed"><span>Kecepatan bulan</span><span class="val" id="g-mspeed-v"></span></label>' +
      '<input type="range" id="g-mspeed" min="0" max="' + (MSPEEDS.length - 1) + '" step="1" aria-label="Kecepatan bulan">' +
      '<p class="note">Nama kerja (eksonim manusia, Inferensi AI): <b>' + esc(mname('bulan_besar')) + '</b> = bulan besar, <b>' + esc(mname('bulan_kecil')) + '</b> = bulan kecil. Ukuran relatif ke planet <b>asli</b> (0,2415 dan 0,0604 jari-jari). <b>Jarak tidak berskala</b>: dikompres monoton agar urutan orbit dan bentuk elips (e, i) tetap terbaca. Rasio periode asli 3,41 : 1. Jam bulan terpisah dari putaran planet. Seluruh parameter = Inferensi AI, bukan kanon.</p>');
    grp('Sumbu &amp; ekliptika ' + C.chip('terbuka'),
      '<p class="note">Sumbu rotasi digambar tegak dan bidang ekliptika sejajar ekuator — <b>ilustratif</b>. <b>Kemiringan sumbu belum ditetapkan</b> (Terbuka #2): tidak ada terminator, sisi malam, atau musim; pencahayaan netral menempel pada kamera. Bintang belum ditetapkan.</p>');
    if (G.relief) G.relief.buildPanel(sec, grp);
    var spinBtn2 = sec.querySelector('#g-spin');
    spinBtn2.disabled = !!REDUCED;
    spinBtn2.addEventListener('click', function () { setSpin(!st.spin); });
    var per = sec.querySelector('#g-period'), perV = sec.querySelector('#g-period-v');
    function showPeriod() { perV.textContent = st.period + ' dtk'; }
    per.value = String(Math.max(0, PERIODS.indexOf(st.period))); if (PERIODS.indexOf(st.period) < 0) { st.period = 90; per.value = '2'; } showPeriod();
    per.addEventListener('input', function () { st.period = PERIODS[+per.value]; LS.set('rh-g-period', st.period); showPeriod(); });
    var ms = sec.querySelector('#g-mspeed'), msV = sec.querySelector('#g-mspeed-v');
    function showMS() { var v = MSPEEDS[mIdx]; msV.textContent = v === 0 ? 'jeda' : (v === 1 ? '1 hari-R ≈ 2 dtk' : '× ' + String(v).replace('.', ',')); if (bodies) bodies.setSpeed(v); }
    ms.value = String(mIdx); showMS();
    ms.addEventListener('input', function () { mIdx = +ms.value; LS.set('rh-g-moonspeed', mIdx); showMS(); });
    sec.querySelector('#g-focus').addEventListener('click', function () { ctl.focusPlanet(); });
    sec.querySelector('#g-sys').addEventListener('click', function () { ctl.viewMoonSystem(); });
    sec.querySelector('#g-m-besar').addEventListener('click', function () { ctl.openMoon('bulan_besar'); });
    sec.querySelector('#g-m-kecil').addEventListener('click', function () { ctl.openMoon('bulan_kecil'); });
    setSpin(false);

    // ------------------------------------------------------------ pengendali
    var ctl = {
      isShown: function () { return st.shown; },
      show: function (focus, o) {
        o = o || {};
        rootEl.hidden = false; dockEl.hidden = false; st.shown = true;
        S.resize();
        // Pertama kali masuk dari peta yang masih di posisi bawaan (lintang ≈ 0): miringkan kamera sedikit supaya orbit bulan terbaca sebagai elips, bukan garis.
        var lat0 = clamp(focus.lat, -85, 85); if (!st.entered && Math.abs(lat0) < 8) lat0 = 18; st.entered = true;
        S.view.lat = lat0; S.view.lon = focus.lon; S.view.dist = clamp(S.distOf(focus.zoom == null ? 2 : focus.zoom), 1.2, 9);
        if (!o.instant && !REDUCED) { rootEl.classList.add('fade'); void rootEl.offsetWidth; rootEl.classList.add('in'); } else rootEl.classList.remove('fade', 'in');
        S.updateCamera(); S.start(); S.dirty();
        if (layers) layers.onShow();
        if (!REDUCED && !o.noSpin) setSpin(true);
        updateCompass(); ctx.syncLayerUI();
        tabInit();
      },
      hide: function () { st.shown = false; st.meas = false; rootEl.classList.remove('meas'); S.stop(); setSpin(false); if (layers) layers.onHide(); rootEl.hidden = true; dockEl.hidden = true; closeCard(); hideTip(); rootEl.classList.remove('fade', 'in'); },
      getFocus: function () { var v = S.view; return { lat: clamp(v.lat, -85, 85), lon: C.lonN(v.lon), dist: v.dist, zoom: clamp(S.zoomOf(v.dist), 0.5, 6) }; },
      goPlace: function (p) {
        setSpin(false);
        S.flyTo({ lat: clamp(p.lat, -80, 80), lon: p.lon, dist: p.cat === 'continent' ? S.distOf(2.2) : (p.label_only ? S.distOf(3.2) : S.distOf(4.2)) }, 900, function () { if (!st.meas) openHit({ type: 'place', id: p.id }); });
      },
      goFaction: function (id, pts) {
        var la = 0, lo = [0, 0], n = pts.length; pts.forEach(function (q) { la += q[0]; var a = q[1] * D2R; lo[0] += Math.cos(a); lo[1] += Math.sin(a); });
        var cLat = la / n, cLon = Math.atan2(lo[1], lo[0]) * R2D, span = 0; pts.forEach(function (q) { span = Math.max(span, C.angDist(cLat, cLon, q[0], q[1])); });
        setSpin(false);
        S.flyTo({ lat: clamp(cLat, -80, 80), lon: cLon, dist: Math.max(1.6, Math.min(5.2, 1 + span / 14)) }, 900, function () { openHit({ type: id === 'anusarri' ? 'mandala' : 'faction', id: id, ring: 0 }); });
      },
      focusPlanet: function () { setSpin(false); S.flyTo({ lat: clamp(S.view.lat, -60, 60), lon: S.view.lon, dist: S.defaultDist() * 0.92 }, 800); },
      viewMoonSystem: function () { setSpin(false); S.flyTo({ lat: 20, lon: S.view.lon, dist: bodies ? bodies.systemDist() : 9 }, 1000); },
      openMoon: function (id) { var m = bodies && bodies.byId(id); if (m) openHit({ type: 'moon', moon: m }); },
      closeCard: closeCard,
      /** Ukur jarak: app.js memegang keadaan (dua titik, hasil); modul ini hanya menangkap ketukan dan menggambar garis, titik, dan kotak hasil. */
      setMeasure: function (m) { if (layers) layers.setMeasure(m); },
      setMeasureMode: function (on) { st.meas = !!on; rootEl.classList.toggle('meas', st.meas); if (st.meas) { setSpin(false); hideTip(); } },
      openFaction: function (id) { openCard(ctx.cards.faction(id), 'fac:' + id); },
      relayout: function () { if (st.shown) S.resize(); },
      /** Status adapter3D per layer (paritas 2D/3D): {key: {on, adapter3D, reason}}. */
      layerStatus: function () { var o = {}; Object.keys(ctx.LAYERS).forEach(function (k) { var L0 = ctx.LAYERS[k]; o[k] = { on: L0.on, only3D: !!L0.only3D, onlyDisk: !!L0.onlyDisk, adapter2D: !!L0.adapter2D, adapter3D: !!L0.adapter3D, reason: L0.reason3D || null }; }); return o; },
      /** Ringkasan teknis untuk uji: ukuran tekstur, memori GPU, pin DOM, bulan. */
      info: function () { var r = S.renderer.info; return { baseSize: S.baseSize, overlay: layers && layers.overlaySize, maxTex: S.maxTex, geometries: r.memory.geometries, textures: r.memory.textures, frames: S.frames || 0,
        pins: layers ? layers.pins.length : 0, view: { lat: S.view.lat, lon: S.view.lon, dist: S.view.dist }, moons: bodies ? bodies.info() : null, spin: st.spin, dpr: S.dpr, W: S.W, H: S.H }; },
      _S: S, _state: st, _ctx: ctx, _bodies: bodies, _layers: layers
    };
    // tab "Globe" dipilih otomatis saat pertama kali masuk 3D
    function tabInit() { if (!st.tabbed) { st.tabbed = true; } }
    ctx.onEvent(function (type) { if (type === 'layout') ctl.relayout(); });
    window.__rhGlobe = ctl;   // pegangan untuk uji otomatis dan debugging
    return S.loadImage(ctx.BASE).then(function (img) {
      var src = S.fitImage(img, 4096); S.baseTex = S.makeTexture(src); S.baseSize = src.width;
      S.mat.uniforms.uAlbedo.value = S.baseTex; S.dirty();
      return ctl;
    });
  }
};
})(typeof window !== 'undefined' ? window : globalThis);
