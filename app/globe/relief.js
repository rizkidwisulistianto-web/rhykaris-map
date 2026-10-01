/* Master Map Rhykaris — globe 3D: relief (Stage 2b, v1.6). Status epistemik: TURUNAN.
   Aset di assets/3d/ (BARU, di samping lapisan kanon v4) dimuat HANYA saat pengguna mengaktifkan relief:
     relief.json     manifest (ukuran, konstanta, asal-usul, hasil verifikasi terhadap datagrid.png)
     height_4096.png tinggi daratan 16-bit dipecah ke dua kanal 8-bit (R = byte atas, G = byte bawah), PNG lossless; laut = 0
     slope.webp      gradien permukaan (timur, utara), lossless, dikodekan akar-kuadrat (127 = datar)
     albedo_q84.webp palet v4 TANPA hillshade terpanggang (pencahayaan dinamis dari peta kemiringan)
   Presisi 16-bit hilang bila dimuat lewat canvas, jadi tinggi dibaca lewat createImageBitmap (tanpa konversi warna / premultiply) dan
   di-sampling dengan NEAREST + interpolasi bilinear manual di vertex shader. Displacement hanya untuk daratan; laut tetap datar.
   Slider eksagerasi 0–60× (bawaan 15×) — "tidak berskala": relief asli ≈ ±10 km pada radius 8.282 km (≈ 0,1 %). */
(function (root) {
'use strict';
var RH = root.RH, G = RH.G, clamp = G.clamp;

G.createRelief = function (S, ctx) {
  var T = G.THREE, C = ctx.C, LS = ctx.LS, U = S.mat.uniforms;
  var st = { on: false, loading: false, man: null, tex: null, exag: clamp(+LS.get('rh-g-exag', 15), 0, 60), err: null };
  var ui = {};
  var R_M = ctx.DATA.stats.radius_km * 1000;
  var url = function (name) { return new URL('assets/3d/' + name, document.baseURI).href; };

  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u); return r.json(); }); }
  function getBlob(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u); return r.blob(); }); }
  function bitmap(blob, flip) {
    if (window.createImageBitmap) return createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none', imageOrientation: flip ? 'flipY' : 'none' });
    return new Promise(function (res, rej) { var im = new Image(), u = URL.createObjectURL(blob); im.onload = function () { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; });
  }
  function dataTex(img, flipped) {
    var tex = new T.Texture(img); tex.flipY = !flipped && !(img instanceof ImageBitmap); tex.colorSpace = T.NoColorSpace;
    tex.minFilter = tex.magFilter = T.NearestFilter; tex.generateMipmaps = false; tex.wrapS = T.RepeatWrapping; tex.wrapT = T.ClampToEdgeWrapping; tex.premultiplyAlpha = false; tex.needsUpdate = true; return tex;
  }
  /** GPU kecil (MAX_TEXTURE_SIZE < lebar peta tinggi): kecilkan peta tinggi 16-bit di CPU (rata-rata 2×2 pada nilai 16-bit, lalu kemas ulang R/G) — tanpa smoothing canvas yang merusak byte. */
  function downscaleHeight(bmp, maxW) {
    var w = bmp.width, h = bmp.height, k = 1; while (w / k > maxW) k *= 2;
    var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
    var src = g.getImageData(0, 0, w, h).data, nw = w / k, nh = h / k, out = new Uint8Array(nw * nh * 4);
    for (var y = 0; y < nh; y++) for (var x = 0; x < nw; x++) {
      var sum = 0; for (var dy = 0; dy < k; dy++) for (var dx = 0; dx < k; dx++) { var i = ((y * k + dy) * w + (x * k + dx)) * 4; sum += src[i] * 256 + src[i + 1]; }
      var v = Math.round(sum / (k * k)), o = (y * nw + x) * 4; out[o] = v >> 8; out[o + 1] = v & 255; out[o + 2] = 0; out[o + 3] = 255;
    }
    var tex = new T.DataTexture(out, nw, nh, T.RGBAFormat); tex.flipY = true; tex.colorSpace = T.NoColorSpace; tex.minFilter = tex.magFilter = T.NearestFilter; tex.generateMipmaps = false;
    tex.wrapS = T.RepeatWrapping; tex.wrapT = T.ClampToEdgeWrapping; tex.needsUpdate = true; return { tex: tex, w: nw, h: nh };
  }

  function load() {
    if (st.tex) return Promise.resolve(st.tex);
    if (st.loading) return st.loading;
    st.loading = getJSON(url('relief.json')).then(function (man) {
      st.man = man; var n = 0, tot = 3; function tick() { n++; setStatus('memuat ' + n + '/' + tot + '…'); }
      var pH = getBlob(url(man.height.file)).then(function (b) { return bitmap(b, true); }).then(function (bmp) {
        var w = bmp.width, h = bmp.height, t;
        if (w > S.maxTex) { var d = downscaleHeight(bmp, S.maxTex); t = d.tex; w = d.w; h = d.h; } else t = dataTex(bmp, true);
        tick(); return { tex: t, w: w, h: h };
      });
      var pS = S.loadImage(url(man.slope.file)).then(function (im) { var t = S.makeTexture(S.fitImage(im, 4096)); t.generateMipmaps = true; tick(); return t; });
      var pA = S.loadImage(url(man.albedo.file)).then(function (im) { var t = S.makeTexture(S.fitImage(im, 4096)); tick(); return t; });
      return Promise.all([pH, pS, pA]);
    }).then(function (r) { st.tex = { height: r[0], slope: r[1], albedo: r[2] }; st.loading = false; return st.tex; })
      .catch(function (e) { st.loading = false; throw e; });
    return st.loading;
  }

  function apply() {
    if (st.on && st.tex) {
      var m = st.man;
      U.uAlbedo.value = st.tex.albedo; U.uHeight.value = st.tex.height.tex; U.uHeightSize.value.set(st.tex.height.w, st.tex.height.h); U.uHMax.value = m.height.hmax_m;
      U.uSlope.value = st.tex.slope; U.uSlopeMax.value = m.slope.smax; U.uRelief.value = 1; U.uExag.value = st.exag; U.uDisp.value = st.exag / R_M;
    } else { U.uAlbedo.value = S.baseTex || U.uAlbedo.value; U.uRelief.value = 0; U.uExag.value = 0; U.uDisp.value = 0; }
    S.dirty(); if (G.renderEpi) G.renderEpi();
  }
  function setStatus(txt, bad) { if (!ui.st) return; ui.st.textContent = txt || ''; ui.st.classList.toggle('bad', !!bad); }
  function setOn(on) {
    if (!on) { st.on = false; if (ui.cb) ui.cb.checked = false; if (ui.ex) ui.ex.disabled = true; setStatus(''); apply(); return Promise.resolve(false); }
    if (ui.cb) ui.cb.checked = true; if (ui.cb) ui.cb.disabled = true;
    setStatus('memuat…');
    return load().then(function () {
      st.on = true; if (ui.ex) ui.ex.disabled = false; setStatus('aktif · ' + (st.man.label || 'Turunan')); apply(); return true;
    }).catch(function (e) {
      console.error(e); st.on = false; if (ui.cb) ui.cb.checked = false; if (ui.ex) ui.ex.disabled = true; apply();
      setStatus('gagal dimuat', true);
      ctx.toast('<b>Relief tidak bisa dimuat.</b> Relief butuh koneksi internet dan halaman yang dilayani lewat http(s) (mis. GitHub Pages atau server lokal), bukan berkas yang dibuka langsung. Globe tetap tampil tanpa relief.');
      return false;
    }).then(function (ok) { if (ui.cb) ui.cb.disabled = false; return ok; });
  }
  function setExag(v) { st.exag = clamp(+v, 0, 60); LS.set('rh-g-exag', st.exag); if (ui.exv) ui.exv.textContent = C.fint(st.exag) + '×'; if (st.on) apply(); }

  return {
    isOn: function () { return st.on; }, label: function () { return st.man ? (st.man.label || 'Turunan') : 'Turunan'; }, setOn: setOn, setExag: setExag, state: st,
    buildPanel: function (sec, grp) {
      var d = grp('Relief ' + C.chip('turunan'),
        '<label class="row" for="g-relief"><span><input type="checkbox" id="g-relief"> Aktifkan relief 3D</span><span class="val" id="g-relief-st"></span></label>' +
        '<label class="row" for="g-exag"><span>Eksagerasi vertikal <i>(tidak berskala)</i></span><span class="val" id="g-exag-v"></span></label>' +
        '<input type="range" id="g-exag" min="0" max="60" step="1" aria-label="Eksagerasi vertikal, tidak berskala" disabled>' +
        '<p class="note">Relief asli hanya ≈ ±10 km pada radius 8.282 km (≈ 0,1 %); eksagerasi (bawaan 15×, 0–60×) semata-mata untuk keterbacaan. Relief <b>diturunkan</b> dari lapisan fisik v4 (generator seed 1647, cocok 100 % dengan <code>datagrid.png</code>) — bukan klaim kanon baru. Hanya daratan yang naik; laut tetap datar. Aset ≈ 9 MB diunduh hanya saat relief diaktifkan.</p>');
      ui.cb = d.querySelector('#g-relief'); ui.st = d.querySelector('#g-relief-st'); ui.ex = d.querySelector('#g-exag'); ui.exv = d.querySelector('#g-exag-v');
      ui.ex.value = String(st.exag); ui.exv.textContent = C.fint(st.exag) + '×';
      ui.cb.addEventListener('change', function () { setOn(ui.cb.checked); });
      ui.ex.addEventListener('input', function () { setExag(ui.ex.value); });
    }
  };
};
})(typeof window !== 'undefined' ? window : globalThis);
