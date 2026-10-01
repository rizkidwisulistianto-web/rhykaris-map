/* Master Map Rhykaris — globe 3D: renderer, kamera, kontrol orbit (buatan sendiri: drag, pinch/scroll, inersia, batas zoom),
   material planet (shader sendiri) dan loop render. Tidak ada addon three.js yang diimpor.
   Pencahayaan: netral — ambient + cahaya terarah lembut yang MENEMPEL pada kamera. Bintang tidak ditetapkan di vault,
   jadi tidak ada terminator, sisi malam, atau musim. */
(function (root) {
'use strict';
var RH = root.RH, G = RH.G, D2R = G.D2R, R2D = G.R2D, clamp = G.clamp;

var FOV = 36;
var DIST_MIN = 1.12, DIST_MAX = 18;
var LIGHT = [-0.34, 0.46, 0.82];

// ------------------------------------------------------------------ shader planet
// Albedo (tekstur v4 dengan hillshade terpanggang, atau albedo tanpa hillshade + relief) + overlay vektor (canvas ekuirektangular).
// Relief (2b): tinggi 16-bit dipecah ke dua kanal 8-bit (R = byte atas, G = byte bawah), dibaca dengan NEAREST dan diinterpolasi manual
// di shader supaya presisi tidak rusak; normal dari peta kemiringan, dikali eksagerasi vertikal.
var VERT = [
  'precision highp float;',
  'uniform sampler2D uHeight; uniform vec2 uHeightSize; uniform float uHMax; uniform float uDisp; uniform float uRelief;',
  'varying vec2 vUv; varying vec3 vN; varying vec3 vE; varying vec3 vNo;',
  'float hAt(vec2 ij) {',
  '  ij.x = mod(ij.x, uHeightSize.x); ij.y = clamp(ij.y, 0.0, uHeightSize.y - 1.0);',
  '  vec4 t = texture2D(uHeight, (ij + 0.5) / uHeightSize) * 255.0;',
  '  return (floor(t.r + 0.5) * 256.0 + floor(t.g + 0.5)) / 65535.0 * uHMax;',
  '}',
  'float heightM(vec2 uv) {',
  '  vec2 p = uv * uHeightSize - 0.5; vec2 i = floor(p); vec2 f = p - i;',
  '  return mix(mix(hAt(i), hAt(i + vec2(1.0, 0.0)), f.x), mix(hAt(i + vec2(0.0, 1.0)), hAt(i + vec2(1.0, 1.0)), f.x), f.y);',
  '}',
  'void main() {',
  '  vUv = uv;',
  '  vec3 dir = normalize(position);',
  '  vec3 E = cross(vec3(0.0, 1.0, 0.0), dir); float le = length(E); E = le > 1e-4 ? E / le : vec3(1.0, 0.0, 0.0);',
  '  vec3 No = cross(dir, E);',
  '  vN = normalMatrix * dir; vE = normalMatrix * E; vNo = normalMatrix * No;',
  '  float h = uRelief > 0.5 ? heightM(uv) : 0.0;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(dir * (1.0 + h * uDisp), 1.0);',
  '}'
].join('\n');
var FRAG = [
  'precision highp float;',
  'uniform sampler2D uAlbedo; uniform sampler2D uOverlay; uniform sampler2D uSlope;',
  'uniform float uOverlayOn; uniform float uRelief; uniform float uExag; uniform float uSlopeMax;',
  'uniform vec3 uLightDir; uniform float uAmb; uniform float uDif;',
  'varying vec2 vUv; varying vec3 vN; varying vec3 vE; varying vec3 vNo;',
  'void main() {',
  '  vec3 base = texture2D(uAlbedo, vUv).rgb;',
  '  vec4 ov = texture2D(uOverlay, vUv);',
  '  base = mix(base, ov.rgb, ov.a * uOverlayOn);',
  '  vec3 n = normalize(vN);',
  '  if (uRelief > 0.5) {',
  '    vec2 s = (texture2D(uSlope, vUv).rg - 0.5) * 2.0 * uSlopeMax;',
  '    n = normalize(n - uExag * (s.x * normalize(vE) + s.y * normalize(vNo)));',
  '  }',
  '  float light = uAmb + uDif * max(dot(n, uLightDir), 0.0);',
  '  gl_FragColor = vec4(base * light, 1.0);',
  '}'
].join('\n');
G.LIGHT = LIGHT; G.AMB = 0.66; G.DIF = 0.42;
G.BODY_VERT = ['varying vec2 vUv; varying vec3 vN;', 'void main(){ vUv = uv; vN = normalMatrix * normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'].join('\n');
G.BODY_FRAG = ['precision highp float; uniform sampler2D uMap; uniform vec3 uLightDir; uniform float uAmb; uniform float uDif; uniform float uOpacity;', 'varying vec2 vUv; varying vec3 vN;',
  'void main(){ vec3 c = texture2D(uMap, vUv).rgb; float l = uAmb + uDif * max(dot(normalize(vN), uLightDir), 0.0); gl_FragColor = vec4(c * l, uOpacity); }'].join('\n');

/** Bola ekuirektangular: 513 × 257 titik; kolom u = 0 dan u = 1 digandakan di bujur ±180° sehingga tidak ada jahitan. */
function sphereGeometry(T, wSeg, hSeg) {
  var nV = (wSeg + 1) * (hSeg + 1), pos = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), idx = new Uint32Array(wSeg * hSeg * 6), k = 0;
  for (var j = 0; j <= hSeg; j++) {
    var lat = 90 - 180 * j / hSeg;
    for (var i = 0; i <= wSeg; i++) {
      var lon = -180 + 360 * i / wSeg, v = G.vec(lat, lon), n = j * (wSeg + 1) + i;
      pos[n * 3] = v[0]; pos[n * 3 + 1] = v[1]; pos[n * 3 + 2] = v[2]; uv[n * 2] = i / wSeg; uv[n * 2 + 1] = 1 - j / hSeg;
    }
  }
  for (j = 0; j < hSeg; j++) for (i = 0; i < wSeg; i++) {
    var a = j * (wSeg + 1) + i, b = a + 1, c = a + wSeg + 1, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  var g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setIndex(new T.BufferAttribute(idx, 1));
  g.boundingSphere = new T.Sphere(new T.Vector3(0, 0, 0), 1.2);   // relief menonjol di atas jari-jari 1
  return g;
}

G.sphereGeometry = sphereGeometry;

G.createScene = function (rootEl, ctx) {
  var T = G.THREE;
  T.ColorManagement.enabled = false;   // pipeline sRGB "mentah": warna tekstur dan hex tampil apa adanya; pencahayaan di shader
  var canvas = G.el('canvas', 'g-canvas'); canvas.tabIndex = 0; canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Globe 3D Rhykaris. Seret untuk memutar, gulir atau cubit untuk memperbesar. Tombol panah memutar, plus dan minus memperbesar.');
  rootEl.insertBefore(canvas, rootEl.firstChild);
  var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = T.LinearSRGBColorSpace; renderer.setClearColor(0x000000, 0);
  var scene = new T.Scene();
  var camera = new T.PerspectiveCamera(FOV, 1, 0.02, 80);
  var S = { T: T, root: rootEl, canvas: canvas, renderer: renderer, scene: scene, camera: camera, W: 1, H: 1, view: { lat: 12, lon: 0, dist: 4.3 },
            hooks: [], after: [], isDirty: true, running: false, last: 0, inertia: null, fly: null, lost: false,
            maxTex: Math.min(renderer.capabilities.maxTextureSize, +((location.search.match(/[?&]maxtex=(\d+)/) || [])[1]) || 1e9) };   // ?maxtex=2048 mensimulasikan GPU kecil (uji fallback tekstur)
  S.dirty = function () { S.isDirty = true; };
  S.onFrame = function (fn) { S.hooks.push(fn); };
  S.afterRender = function (fn) { S.after.push(fn); };

  // ---------------------------------------------------------------- geometri & material planet
  var blank = new T.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;
  var clearTex = new T.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); clearTex.needsUpdate = true;
  var mat = new T.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uAlbedo: { value: blank }, uOverlay: { value: clearTex }, uOverlayOn: { value: 0 },
      uHeight: { value: blank }, uHeightSize: { value: new T.Vector2(1, 1) }, uHMax: { value: 1 }, uDisp: { value: 0 }, uRelief: { value: 0 },
      uSlope: { value: blank }, uSlopeMax: { value: 0.5 }, uExag: { value: 0 },
      uLightDir: { value: new T.Vector3(LIGHT[0], LIGHT[1], LIGHT[2]).normalize() }, uAmb: { value: G.AMB }, uDif: { value: G.DIF }
    }
  });
  var planet = new T.Mesh(sphereGeometry(T, 512, 256), mat); planet.frustumCulled = false; planet.renderOrder = 0;
  scene.add(planet);
  S.planet = planet; S.mat = mat; S.blank = blank; S.clearTex = clearTex;

  S.makeTexture = function (src, o) {   // src: HTMLImageElement | canvas
    o = o || {};
    var tex = src.getContext ? new T.CanvasTexture(src) : new T.Texture(src);
    tex.wrapS = o.clampS ? T.ClampToEdgeWrapping : T.RepeatWrapping; tex.wrapT = T.ClampToEdgeWrapping;
    tex.magFilter = T.LinearFilter; tex.minFilter = o.noMip ? T.LinearFilter : T.LinearMipmapLinearFilter; tex.generateMipmaps = !o.noMip;
    tex.anisotropy = Math.min(o.aniso || 8, renderer.capabilities.getMaxAnisotropy()); tex.needsUpdate = true;
    return tex;
  };
  S.loadImage = function (src) {
    return new Promise(function (res, rej) { var im = new Image(); im.decoding = 'async'; im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('gambar tekstur gagal dimuat')); }; im.src = src; });
  };
  /** Turunkan ke `max` px lebar bila GPU tidak sanggup (MAX_TEXTURE_SIZE < 4096) atau diminta. */
  S.fitImage = function (img, want) {
    var max = Math.min(want || 4096, S.maxTex); if (img.width <= max) return img;
    var c = document.createElement('canvas'); c.width = max; c.height = Math.round(img.height * max / img.width);
    var g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height); return c;
  };

  // ---------------------------------------------------------------- kamera, ukuran, proyeksi
  var tanHalf = Math.tan(FOV * D2R / 2);
  S.freeBox = function () {
    var ins = ctx.insets ? ctx.insets() : { l: 0, b: 0 };
    return { l: ins.l || 0, b: ins.b || 0, w: Math.max(120, S.W - (ins.l || 0)), h: Math.max(120, S.H - (ins.b || 0)) };
  };
  /** Jarak kamera agar bola berjari-jari R tampak berjari-jari frac × setengah sisi terkecil area bebas. */
  S.fitDist = function (R, frac) {
    var f = S.freeBox(), minDim = Math.min(f.w, f.h), t = frac * (minDim / S.H) * tanHalf;
    return R * Math.sqrt(1 + 1 / (t * t));
  };
  S.defaultDist = function () { return S.fitDist(1, 0.74); };
  /** Setara "zoom peta datar": 2,0 pada jarak bawaan; naik 2,2 per penggandaan. */
  S.zoomOf = function (d) { return 2.0 + 2.2 * Math.log(S.defaultDist() / d) / Math.LN2; };
  S.distOf = function (z) { return S.defaultDist() * Math.pow(2, -(z - 2.0) / 2.2); };
  S.updateCamera = function () {
    var v = S.view, lat = clamp(v.lat, -88, 88), p = G.vec(lat, v.lon, v.dist);
    camera.position.set(p[0], p[1], p[2]); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    S.camPos = p;
  };
  S.resize = function () {
    var r = rootEl.getBoundingClientRect(), W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
    if (!r.width || !r.height) return;
    S.W = W; S.H = H; S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(S.dpr); renderer.setSize(W, H, false);
    camera.aspect = W / H;
    var f = S.freeBox();   // pusatkan globe di area yang tidak tertutup panel
    camera.setViewOffset(W, H, -f.l / 2, f.b / 2, W, H); camera.updateProjectionMatrix();
    S.dirty();
  };
  var tmp = new T.Vector3();
  /** Titik adegan → piksel CSS di dalam kontainer; out = {x, y, z (kedalaman NDC)}. */
  S.toScreen = function (x, y, z, out) {
    tmp.set(x, y, z).project(camera); out = out || {};
    out.x = (tmp.x * 0.5 + 0.5) * S.W; out.y = (1 - (tmp.y * 0.5 + 0.5)) * S.H; out.z = tmp.z; return out;
  };
  /** Titik permukaan (vektor satuan) menghadap kamera? */
  S.front = function (x, y, z, margin) { var c = S.camPos; return x * c[0] + y * c[1] + z * c[2] > 1 + (margin || 0.002); };
  /** Piksel (relatif kontainer) → {lat, lon} pada bola satuan, atau null bila meleset. */
  var ray = new T.Vector3();
  S.pick = function (px, py) {
    ray.set(px / S.W * 2 - 1, -(py / S.H * 2 - 1), 0.5).unproject(camera);
    var c = S.camPos, dx = ray.x - c[0], dy = ray.y - c[1], dz = ray.z - c[2], l = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= l; dy /= l; dz /= l;
    var b = c[0] * dx + c[1] * dy + c[2] * dz, cc = c[0] * c[0] + c[1] * c[1] + c[2] * c[2] - 1, disc = b * b - cc;
    if (disc < 0) return null;
    var t = -b - Math.sqrt(disc), x = c[0] + t * dx, y = c[1] + t * dy, z = c[2] + t * dz, ll = G.latlon(x, y, z);
    ll.v = [x, y, z]; return ll;
  };
  /** Derajat busur permukaan per piksel layar di pusat tampilan (untuk toleransi hit-test). */
  S.degPerPx = function () { var f = S.H / 2 / tanHalf / Math.max(0.05, S.view.dist - 1); return R2D / f; };
  S.pxPerRad = function () { return S.H / 2 / tanHalf / Math.max(0.05, S.view.dist - 1); };

  // ---------------------------------------------------------------- gerak halus & inersia
  S.setDist = function (d) { S.view.dist = clamp(d, DIST_MIN, DIST_MAX); S.dirty(); };
  S.cancelFly = function () { S.fly = null; };
  S.flyTo = function (to, ms, done) {
    var v = S.view, from = { lat: v.lat, lon: v.lon, dist: v.dist };
    var dl = ((to.lon - from.lon + 540) % 360) - 180;   // jalur bujur terpendek
    if (ctx.REDUCED || ms === 0) { v.lat = to.lat != null ? to.lat : v.lat; v.lon = from.lon + dl; if (to.dist != null) v.dist = clamp(to.dist, DIST_MIN, DIST_MAX); S.dirty(); if (done) done(); return; }
    S.inertia = null;
    S.fly = { t0: performance.now(), ms: ms || 900, from: from, dl: dl, to: to, done: done };
  };
  S.onFrame(function (dt) {
    var v = S.view;
    if (S.fly) {
      var f = S.fly, k = clamp((performance.now() - f.t0) / f.ms, 0, 1), e = G.ease(k);
      v.lon = f.from.lon + f.dl * e;
      if (f.to.lat != null) v.lat = f.from.lat + (f.to.lat - f.from.lat) * e;
      if (f.to.dist != null) v.dist = f.from.dist + (clamp(f.to.dist, DIST_MIN, DIST_MAX) - f.from.dist) * e;
      S.dirty(); if (k >= 1) { var d = f.done; S.fly = null; if (d) d(); }
    }
    if (S.inertia) {
      var i = S.inertia, decay = Math.exp(-dt / 0.42);
      v.lon += i.vLon * dt; v.lat = clamp(v.lat + i.vLat * dt, -85, 85); i.vLon *= decay; i.vLat *= decay; S.dirty();
      if (Math.abs(i.vLon) < 0.6 && Math.abs(i.vLat) < 0.6) S.inertia = null;
    }
    v.lon = ((v.lon + 540) % 360) - 180;
  });

  // ---------------------------------------------------------------- kontrol: drag, pinch, scroll, keyboard
  var ptrs = {}, nPtr = 0, g0 = null, pinch = null;
  function rel(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function rotate(dx, dy) {
    var k = S.pxPerRad(), v = S.view, cosl = Math.max(Math.cos(clamp(v.lat, -88, 88) * D2R), 0.3);
    v.lon -= dx / k * R2D / cosl; v.lat = clamp(v.lat + dy / k * R2D, -85, 85); S.dirty();
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; nPtr++;
    S.cancelFly(); S.inertia = null;
    if (S.onUserInput) S.onUserInput('down', e);
    if (nPtr === 1) { g0 = { x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, lx: e.clientX, ly: e.clientY, lt: performance.now(), vLon: 0, vLat: 0 }; pinch = null; }
    else if (nPtr === 2) { var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, dist0: S.view.dist }; g0 = null; }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) { if (S.onHover && e.pointerType !== 'touch') S.onHover(e, rel(e)); return; }
    ptrs[e.pointerId].x = e.clientX; ptrs[e.pointerId].y = e.clientY;
    if (nPtr === 2 && pinch) { var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]], d = Math.hypot(a.x - b.x, a.y - b.y) || 1; S.setDist(pinch.dist0 * pinch.d0 / d); return; }
    if (nPtr === 1 && g0) {
      var dx = e.clientX - g0.lx, dy = e.clientY - g0.ly, now = performance.now();
      if (!g0.moved && Math.hypot(e.clientX - g0.x0, e.clientY - g0.y0) > 4) { g0.moved = true; rootEl.classList.add('dragging'); if (S.onDragStart) S.onDragStart(); }
      if (g0.moved) {
        rotate(dx, dy);
        var dt = Math.max(0.008, (now - g0.lt) / 1000), k = S.pxPerRad(), cosl = Math.max(Math.cos(clamp(S.view.lat, -88, 88) * D2R), 0.3);
        g0.vLon = 0.6 * g0.vLon + 0.4 * (-dx / k * R2D / cosl / dt); g0.vLat = 0.6 * g0.vLat + 0.4 * (dy / k * R2D / dt);
        g0.lx = e.clientX; g0.ly = e.clientY; g0.lt = now;
      }
    }
  });
  function up(e) {
    if (!ptrs[e.pointerId]) return;
    delete ptrs[e.pointerId]; nPtr = Math.max(0, nPtr - 1); try { canvas.releasePointerCapture(e.pointerId); } catch (x) {}
    if (g0 && nPtr === 0) {
      rootEl.classList.remove('dragging');
      if (e.type === 'pointerup') {
        if (!g0.moved && performance.now() - g0.t0 < 700) { if (S.onClick) S.onClick(e, rel(e)); }
        else if (g0.moved && !ctx.REDUCED && performance.now() - g0.lt < 140 && (Math.abs(g0.vLon) > 8 || Math.abs(g0.vLat) > 8)) S.inertia = { vLon: clamp(g0.vLon, -240, 240), vLat: clamp(g0.vLat, -160, 160) };
      }
      g0 = null;
    }
    if (nPtr < 2) pinch = null;
    if (nPtr === 1) { var k = Object.keys(ptrs)[0], p = ptrs[k]; g0 = { x0: p.x, y0: p.y, t0: performance.now(), moved: true, lx: p.x, ly: p.y, lt: performance.now(), vLon: 0, vLat: 0 }; }
  }
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', function (e) { if (S.onLeave && !ptrs[e.pointerId]) S.onLeave(); });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault(); S.cancelFly(); S.inertia = null; if (S.onUserInput) S.onUserInput('wheel', e);
    S.setDist(S.view.dist * Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.0013)));
  }, { passive: false });
  canvas.addEventListener('dblclick', function (e) {
    var p = S.pick(rel(e).x, rel(e).y); if (!p) return;
    if (S.onUserInput) S.onUserInput('dbl', e);
    S.flyTo({ lat: clamp(p.lat, -80, 80), lon: p.lon, dist: Math.max(DIST_MIN * 1.4, S.view.dist * 0.62) }, 600);
  });
  canvas.addEventListener('keydown', function (e) {
    var big = e.shiftKey ? 3 : 1, handled = true, v = S.view;
    S.cancelFly(); S.inertia = null;
    if (e.key === 'ArrowLeft') v.lon -= 8 * big; else if (e.key === 'ArrowRight') v.lon += 8 * big;
    else if (e.key === 'ArrowUp') v.lat = clamp(v.lat + 8 * big, -85, 85); else if (e.key === 'ArrowDown') v.lat = clamp(v.lat - 8 * big, -85, 85);
    else if (e.key === '+' || e.key === '=') S.setDist(v.dist * 0.82); else if (e.key === '-' || e.key === '_') S.setDist(v.dist / 0.82);
    else handled = false;
    if (handled) { e.preventDefault(); if (S.onUserInput) S.onUserInput('key', e); S.dirty(); }
  });
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); S.lost = true; ctx.toast('<b>Konteks grafis globe hilang.</b> Beralih ke peta datar 2D lalu kembali ke 3D untuk memulihkan.'); });
  canvas.addEventListener('webglcontextrestored', function () { S.lost = false; S.dirty(); });

  // ---------------------------------------------------------------- loop render (berhenti saat tab tersembunyi / globe tidak tampil)
  S.render = function () {
    if (S.lost) return;
    S.updateCamera(); renderer.render(scene, camera);
    for (var i = 0; i < S.after.length; i++) S.after[i]();
  };
  function loop(t) {
    if (!S.running) return;
    S.raf = requestAnimationFrame(loop);
    var now = t / 1000, dt = Math.min(0.5, Math.max(0, now - S.last)); S.last = now;   // jam simulasi mengikuti waktu nyata (batas 0,5 dtk menahan lompatan setelah tab disembunyikan)
    for (var i = 0; i < S.hooks.length; i++) S.hooks[i](dt);
    if (S.isDirty) { S.isDirty = false; S.render(); S.frames = (S.frames || 0) + 1; }
  }
  S.start = function () { if (S.running) return; S.running = true; S.last = performance.now() / 1000; S.resize(); S.dirty(); S.raf = requestAnimationFrame(loop); };
  S.stop = function () { S.running = false; if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; };
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.running) { S.last = performance.now() / 1000; S.dirty(); } });
  S.updateCamera();
  if (window.ResizeObserver) new ResizeObserver(function () { if (S.running) S.resize(); }).observe(rootEl); else window.addEventListener('resize', function () { if (S.running) S.resize(); });
  return S;
};
})(typeof window !== 'undefined' ? window : globalThis);
