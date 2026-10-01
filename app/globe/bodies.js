/* Master Map Rhykaris — globe 3D: dua bulan, sumbu rotasi, bidang ekliptika.
   Semua parameter bulan datang dari data/moons.json (RH.moons) dan berstatus INFERENSI AI — bukan kanon.
   Digambar "tidak berskala": ukuran relatif ke planet ASLI (0,2415 dan 0,0604), jarak dikompres dengan fungsi monoton
   (RH.moons.compress) yang menjaga urutan orbit dan bentuk elips; garis orbit dan e/i tidak dianimasikan (periode ayunannya belum diukur).
   Sumbu rotasi digambar TEGAK dan ekliptika sejajar ekuator — ilustratif; kemiringan sumbu belum ditetapkan (Terbuka #2). */
(function (root) {
'use strict';
var RH = root.RH, G = RH.G, D2R = G.D2R, R2D = G.R2D, clamp = G.clamp;

G.createBodies = function (S, ctx, labelsEl) {
  var T = G.THREE, M = RH.moons, C = ctx.C, LAY = ctx.LAYERS;
  var group = new T.Group(); S.scene.add(group);
  var speed = 1, simDays = 0, moons = [];

  // ------------------------------------------------------------------ tekstur prosedural sederhana (tanpa klaim detail kawah)
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function noiseTex(id, base, tint, amp) {
    var W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
    var q = c.getContext('2d'), im = q.createImageData(W, H), rnd = rng(id === 'bulan_besar' ? 1647 : 2026);
    var N = 24, lat = []; for (var a = 0; a <= N; a++) { lat.push([]); for (var b = 0; b < N * 2; b++) lat[a].push(rnd()); }
    function vn(u, v, f) {   // value-noise periodik pada u (tanpa jahitan di bujur ±180)
      var x = u * N * 2 * f, y = v * N * f, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      var P = N * 2 * f; function h(i, j) { var ii = ((i % P) + P) % P, jj = clamp(j, 0, N * f); return hash(ii * 73856093 ^ jj * 19349663 ^ f * 83492791); }
      var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      return (h(x0, y0) * (1 - sx) + h(x0 + 1, y0) * sx) * (1 - sy) + (h(x0, y0 + 1) * (1 - sx) + h(x0 + 1, y0 + 1) * sx) * sy;
    }
    function hash(n) { n = (n ^ (n >>> 13)) * 1274126177; n = n ^ (n >>> 16); return (n >>> 0) / 4294967296; }
    for (var j = 0; j < H; j++) for (var i = 0; i < W; i++) {
      var u = i / W, v = j / H, n = 0.5 * vn(u, v, 1) + 0.28 * vn(u, v, 2) + 0.14 * vn(u, v, 4) + 0.08 * vn(u, v, 8), m = vn(u + 0.31, v + 0.17, 3);
      var k = (n - 0.5) * 2 * amp, t = clamp((m - 0.45) * 2.4, 0, 1), o = (j * W + i) * 4;
      for (var ch = 0; ch < 3; ch++) im.data[o + ch] = clamp(base[ch] * (1 + k) + tint[ch] * t, 0, 255);
      im.data[o + 3] = 255;
    }
    q.putImageData(im, 0, 0);
    return S.makeTexture(c, { aniso: 4 });
  }
  var LOOK = {
    bulan_besar: { tex: function () { return noiseTex('bulan_besar', [96, 88, 86], [46, 10, 4], 0.34); }, orbit: '#c79a80', glow: '#b9795f' },
    bulan_kecil: { tex: function () { return noiseTex('bulan_kecil', [226, 216, 194], [18, 18, 22], 0.13); }, orbit: '#f1e6c8', glow: '#f4ecd8' }
  };

  // ------------------------------------------------------------------ bulan, garis orbit
  M.data.moons.forEach(function (m) {
    var look = LOOK[m.id]; if (!look) return;
    var mat = new T.ShaderMaterial({ vertexShader: G.BODY_VERT, fragmentShader: G.BODY_FRAG,
      uniforms: { uMap: { value: look.tex() }, uLightDir: S.mat.uniforms.uLightDir, uAmb: { value: G.AMB }, uDif: { value: G.DIF }, uOpacity: { value: 1 } } });
    var mesh = new T.Mesh(G.sphereGeometry(T, 64, 32), mat); mesh.scale.setScalar(M.sceneRadius(m)); mesh.frustumCulled = false; group.add(mesh);
    var pts = M.orbitPath(m, 256), arr = new Float32Array(pts.length * 3); pts.forEach(function (p, i) { arr[i * 3] = p[0]; arr[i * 3 + 1] = p[1]; arr[i * 3 + 2] = p[2]; });
    var lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(arr, 3));
    var line = new T.Line(lg, new T.LineBasicMaterial({ color: new T.Color(look.orbit), transparent: true, opacity: 0.42 })); line.frustumCulled = false; group.add(line);
    var lbl = G.el('div', 'g-moon-lbl', C.esc(m.name) + '<small>Inferensi AI · tidak berskala</small>'); lbl.setAttribute('role', 'button'); lbl.tabIndex = 0;
    lbl.setAttribute('aria-label', m.name + ', Inferensi AI. Buka kartu info'); labelsEl.appendChild(lbl);
    var rec = { m: m, mesh: mesh, line: line, lbl: lbl, pos: [0, 0, 0], sx: 0, sy: 0, rpx: 0, vis: false };
    lbl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); G.openHit({ type: 'moon', moon: m }); } });
    moons.push(rec);
  });

  // ------------------------------------------------------------------ sumbu rotasi (tegak) dan bidang ekliptika (sejajar ekuator) — ilustratif
  var axisG = new T.Group(), segs = new Float32Array([0, 1, 0, 0, 1.62, 0, 0, -1, 0, 0, -1.62, 0]), ag = new T.BufferGeometry();
  ag.setAttribute('position', new T.BufferAttribute(segs, 3));
  axisG.add(new T.LineSegments(ag, new T.LineBasicMaterial({ color: new T.Color('#e8eef0'), transparent: true, opacity: 0.6 }))); group.add(axisG);
  // bidang ekliptika (sejajar ekuator): lingkaran terluar + jari-jari tipis — tanpa isi, supaya tidak menodai planet dari sudut pandang atas
  var eclG = new T.Group(), cp = [], NC = 160, sp = [];
  for (var k = 0; k < NC; k++) { var a = k / NC * Math.PI * 2; cp.push(Math.cos(a) * 3.95, 0, Math.sin(a) * 3.95); }
  for (k = 0; k < 12; k++) { var b = k / 12 * Math.PI * 2; sp.push(Math.cos(b) * 1.15, 0, Math.sin(b) * 1.15, Math.cos(b) * 3.95, 0, Math.sin(b) * 3.95); }
  var cg = new T.BufferGeometry(); cg.setAttribute('position', new T.BufferAttribute(new Float32Array(cp), 3));
  eclG.add(new T.LineLoop(cg, new T.LineBasicMaterial({ color: new T.Color('#9fc7d4'), transparent: true, opacity: 0.32 })));
  var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(new Float32Array(sp), 3));
  eclG.add(new T.LineSegments(sg, new T.LineBasicMaterial({ color: new T.Color('#9fc7d4'), transparent: true, opacity: 0.1 }))); group.add(eclG);
  var noteAxis = G.el('div', 'g-note', 'sumbu rotasi (tegak) · <b>kemiringan sumbu belum ditetapkan</b>'), noteEcl = G.el('div', 'g-note', 'bidang ekliptika (ilustratif · sejajar ekuator)');
  var noteDist = G.el('div', 'g-note', 'jarak bulan tidak berskala'); [noteAxis, noteEcl, noteDist].forEach(function (n) { labelsEl.appendChild(n); });
  var ECL_ANCHOR = [Math.cos(2.4) * 3.95, 0, Math.sin(2.4) * 3.95];

  // ------------------------------------------------------------------ pembaruan posisi
  function updatePositions() {
    moons.forEach(function (r) {
      var p = M.scenePosition(r.m, simDays); r.pos = p; r.mesh.position.set(p[0], p[1], p[2]);
      if (r.m.id === 'bulan_besar') r.mesh.lookAt(0, 0, 0);   // terkunci pasang-surut: sisi yang sama selalu menghadap planet (bulan kecil tidak dianimasikan)
    });
  }
  updatePositions();
  function on(k) { return LAY[k] && LAY[k].on; }
  function applyVis() {
    var mo = on('g_moons');
    moons.forEach(function (r) { r.mesh.visible = mo; r.line.visible = on('g_orbits'); r.lbl.style.display = mo ? '' : 'none'; });
    axisG.visible = on('g_axis'); eclG.visible = on('g_ecl'); S.dirty();
  }
  S.onFrame(function (dt) { if (speed > 0 && on('g_moons')) { simDays += dt * speed / 2; updatePositions(); S.dirty(); } });
  ['g_moons', 'g_orbits', 'g_axis', 'g_ecl'].forEach(function (k) { if (LAY[k]) LAY[k].adapter3D = { z: 0, dom: true }; });
  ctx.onEvent(function (type, key) { if (type === 'layer' && key && key.indexOf('g_') === 0) applyVis(); });
  applyVis();

  // ------------------------------------------------------------------ proyeksi label & picking
  var tmp = {}, tmp2 = {};
  function occluded(p) {   // apakah titik p tertutup planet (segmen kamera → p memotong bola satuan)?
    var c = S.camPos, dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2], b = c[0] * dx + c[1] * dy + c[2] * dz, a = dx * dx + dy * dy + dz * dz, cc = c[0] * c[0] + c[1] * c[1] + c[2] * c[2] - 1;
    var disc = b * b - a * cc; if (disc < 0) return false; var t = (-b - Math.sqrt(disc)) / a; return t > 0 && t < 1;
  }
  var focal = function () { return S.H / 2 / Math.tan(36 * D2R / 2); };
  S.afterRender(function () {
    var mo = on('g_moons'), c = S.camPos;
    moons.forEach(function (r) {
      if (!mo) { r.vis = false; return; }
      var p = r.pos, dc = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      S.toScreen(p[0], p[1], p[2], tmp); r.sx = tmp.x; r.sy = tmp.y; r.rpx = M.sceneRadius(r.m) * focal() / Math.max(0.05, dc);
      r.vis = !occluded(p) && tmp.z < 1 && r.sx > -60 && r.sy > -60 && r.sx < S.W + 60 && r.sy < S.H + 60;
      r.lbl.style.display = r.vis ? '' : 'none';
      if (r.vis) r.lbl.style.transform = 'translate(' + Math.round(r.sx + r.rpx + 8) + 'px,' + Math.round(r.sy - 12) + 'px)';
    });
    var vAx = on('g_axis'), vEc = on('g_ecl'), q;
    noteAxis.style.display = vAx ? '' : 'none'; noteEcl.style.display = vEc ? '' : 'none'; noteDist.style.display = (mo && on('g_orbits')) ? '' : 'none';
    if (vAx) { S.toScreen(0, 1.66, 0, tmp2); var okA = !occluded([0, 1.66, 0]) && tmp2.z < 1; noteAxis.style.display = okA ? '' : 'none'; noteAxis.style.transform = 'translate(' + Math.round(tmp2.x + 8) + 'px,' + Math.round(tmp2.y - 8) + 'px)'; }
    if (vEc) { S.toScreen(ECL_ANCHOR[0], 0, ECL_ANCHOR[2], tmp2); noteEcl.style.display = tmp2.z < 1 ? '' : 'none'; noteEcl.style.transform = 'translate(' + Math.round(tmp2.x - 70) + 'px,' + Math.round(tmp2.y + 4) + 'px)'; }
    if (mo && on('g_orbits')) { var far = moons[moons.length - 1]; if (far) { var pt = M.orbitPath(far.m, 4)[1]; S.toScreen(pt[0], pt[1], pt[2], tmp2); noteDist.style.display = tmp2.z < 1 ? '' : 'none'; noteDist.style.transform = 'translate(' + Math.round(tmp2.x + 6) + 'px,' + Math.round(tmp2.y + 6) + 'px)'; } }
  });

  // ------------------------------------------------------------------ kartu info bulan
  function f(n, d) { return C.fmt(n, d); }
  function row(k, v) { return '<tr><th>' + k + '</th><td>' + v + '</td></tr>'; }
  function cardHTML(m) {
    var d = M.derived(m), P = M.data.planet, sm = m.eccentricity_range;
    var ang = m.angular_size_deg[0] === m.angular_size_deg[1] ? '≈ ' + f(m.angular_size_deg[0], 2) + '° <small>(' + f(d.angMinDeg, 2) + '–' + f(d.angMaxDeg, 2) + '° sepanjang orbit)</small>' : f(m.angular_size_deg[0], 2) + '–' + f(m.angular_size_deg[1], 2) + '°';
    var rows = [
      row('Radius', C.fint(m.radius_km) + ' km <small>(' + f(m.radius_rel, 4) + ' × radius planet)</small>'),
      row('Densitas · massa', f(m.density_gcm3, 1) + ' g/cm³ · ' + (m.mass_kg.toExponential(2).replace('e+', '×10<sup>') .replace(/^(\d)\.(\d+)×/, '$1,$2×') + '</sup>') + ' kg'),
      row('Jarak rata-rata', C.fint(m.semi_major_axis_km) + ' km <small>(' + f(m.semi_major_axis_rel, 1) + ' × radius planet; pusat ke pusat)</small>'),
      row('Eksentrisitas', f(m.eccentricity, 2) + (sm ? ' <small>(berayun ' + f(sm[0], 2) + '–' + f(sm[1], 2) + '; tidak dianimasikan)</small>' : '')),
      row('Inklinasi', '≈ ' + f(m.inclination_deg, 0) + '°' + (m.inclination_range_deg ? ' <small>(berayun ' + m.inclination_range_deg[0] + '–' + m.inclination_range_deg[1] + '°; tidak dianimasikan)</small>' : '') + '<br><small>terhadap bidang orbit planet (digambar sejajar ekuator — ilustratif)</small>'),
      row('Periode', f(d.periodDaysR, 2) + ' hari-Rhykaris<br><small>= ' + f(d.periodDaysE, 1) + ' hari-Bumi (hari-R = ' + P.day_hours + ' jam)</small>'),
      row('Rasio periode', f(M.periodRatio(), 2) + ' : 1 <small>(Bulan Besar : Bulan Kecil)</small>'),
      row('Ukuran tampak', ang + '<br><small>dari planet, pusat ke pusat</small>'),
      row('Jarak periapsis · apoapsis', C.fint(d.periapsisKm) + ' · ' + C.fint(d.apoapsisKm) + ' km'),
      row('Albedo · warna', f(m.albedo, 2) + ' · ' + C.esc(m.color)),
      row('Rotasi', C.esc(m.rotation)),
      row('Pasang ekuilibrium', '≈ ' + f(m.tide_equilibrium_m, m.tide_equilibrium_m < 1 ? 2 : 1) + ' m' + (m.tide_note ? ' <small>(' + C.esc(m.tide_note) + ')</small>' : ''))
    ].join('');
    var stab = m.id === 'bulan_kecil' ? '<p class="nt"><b>Batas stabilitas:</b> tebing ≈ ' + C.fint(M.data.stability.cliff_km) + ' km (jarak ≥ ' + C.fint(M.data.stability.lost_within_century_km) + ' km hilang dalam hitungan abad) — jarak rata-rata tidak digeser keluar dari ≤ ' + C.fint(M.data.stability.max_semi_major_axis_km) + ' km.</p>' : '';
    return '<div class="pp"><h2>' + C.esc(m.name) + '</h2><p class="aka">' + C.esc(m.origin) + '</p>' +
      '<div class="tags"><span class="tag bad">Inferensi AI — bukan kanon</span><span class="tag">tafsir A · stabil tapi bergoyang</span><span class="tag">jarak tidak berskala di globe</span></div>' +
      '<div class="pos"><div class="ph">Parameter ' + C.chip('inferensi') + '</div>' + C.esc(M.data.provenance) + '</div>' +
      '<table class="mt">' + rows + '</table>' + stab +
      '<p class="nt">Di globe: ukuran relatif ke planet <b>asli</b>; jarak dikompres dengan fungsi monoton (urutan orbit dan bentuk elips tetap terbaca). Simpul naik, argumen periapsis dan fase awal dipilih tetap hanya untuk ilustrasi.</p>' +
      '<div class="acts"><button type="button" class="act" data-g="sys">Lihat sistem bulan</button><button type="button" class="act" data-g="planet">Fokus planet</button></div></div>';
  }

  return {
    cardHTML: cardHTML, byId: function (id) { return M.byId(id); },
    setSpeed: function (v) { speed = v; S.dirty(); },
    systemDist: function () { return S.fitDist(4.0, 0.84); },
    moonAt: function (px, py) {
      var best = null, bd = 1e9; if (!on('g_moons')) return null;
      moons.forEach(function (r) {
        if (!r.vis) return;
        var d = Math.hypot(r.sx - px, r.sy - py), tol = Math.max(r.rpx, 13);
        var lx = r.sx + r.rpx + 8, ly = r.sy - 12, onLbl = px >= lx - 3 && px <= lx + r.lbl.offsetWidth + 3 && py >= ly - 3 && py <= ly + r.lbl.offsetHeight + 3;   // etiket bulan ikut area klik
        if (onLbl) d = Math.min(d, tol - 1);
        if (d <= tol && d < bd) { bd = d; best = r.m; }
      });
      return best;
    },
    info: function () { return moons.map(function (r) { return { id: r.m.id, radiusScene: r.mesh.scale.x, aScene: M.compress(r.m.semi_major_axis_rel), e: r.m.eccentricity, inc: r.m.inclination_deg, visible: r.mesh.visible, orbitVisible: r.line.visible, tidalLock: r.m.id === 'bulan_besar' }; }).concat([{ speed: speed, simDays: simDays }]); },
    positions: function () { return moons.map(function (r) { return { id: r.m.id, pos: r.pos.slice(), sx: r.sx, sy: r.sy, rpx: r.rpx, vis: r.vis }; }); },
    simDays: function () { return simDays; }, setSimDays: function (d) { simDays = d; updatePositions(); S.dirty(); }
  };
};
})(typeof window !== 'undefined' ? window : globalThis);
