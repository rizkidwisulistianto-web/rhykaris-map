// Stage 2b tests: relief assets (reproduction vs datagrid, 16-bit packing, slope map), lazy loading, shader uniforms, displacement,
// slider, failure mode, 2048 fallback, size budget.   node relief.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PNG } from 'pngjs';
import { startServer, ROOT } from './lib/server.mjs';
import { launch, newPage } from './lib/browser.mjs';
import { loadRH, readJSON } from './lib/load.mjs';

const RH = loadRH(), C = RH.core; const DATA = readJSON('data/data.json'); C.configure(DATA.stats, DATA.thresholds);
let pass = 0, fail = 0; const failures = [];
const t = (name, ok, detail = '') => { if (ok) pass++; else { fail++; failures.push(name); console.log(`FAIL  ${name} ${detail}`); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const D3 = path.join(ROOT, 'assets/3d'), man = JSON.parse(fs.readFileSync(path.join(D3, 'relief.json'), 'utf8'));

// ============================================================ assets (node only)
{
  const H = PNG.sync.read(fs.readFileSync(path.join(D3, man.height.file))), GRID = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'assets/datagrid.png')));
  t('manifest: label Turunan, regeneration verified against datagrid.png', man.epi === 'turunan' && man.label === 'Turunan' && man.verification.passed === true && man.verification.within1 >= 0.995, JSON.stringify(man.verification));
  t('manifest: exact reproduction of the datagrid R channel', man.verification.exact === 1 && man.verification.max_diff === 0);
  t(`height PNG is ${H.width}×${H.height} 8-bit RGB with B = 0 (R/G split, no alpha tricks)`, H.width === man.height.width && H.height === man.height.height && Array.from({ length: 2000 }, (_, i) => H.data[i * 4 * 997 % H.data.length - (i * 4 * 997 % 4) + 2]).every((v) => v === 0));
  const hm = (i) => (H.data[i * 4] * 256 + H.data[i * 4 + 1]) / 65535 * man.height.hmax_m;
  // 1) 16-bit precision survives: values are not coarser than the quantisation step (many distinct low bytes)
  const lows = new Set(); for (let i = 0; i < H.width * H.height; i += 997) lows.add(H.data[i * 4 + 1]);
  t(`low byte carries real information (${lows.size} distinct values) — precision beyond 8 bits`, lows.size > 200);
  // 2) reproduce the datagrid scheme from the packed heights: ±1 code on ≥ 99,5 % of the 1024×512 grid (land pixels), sea pixels are 0 m
  let ok1 = 0, tot = 0, landAgree = 0, seaN = 0;
  const k = H.width / GRID.width;
  for (let y = 0; y < GRID.height; y++) for (let x = 0; x < GRID.width; x++) {
    const code = GRID.data[(y * GRID.width + x) * 4], px = Math.floor(x * k + k / 2), py = Math.floor(y * k + k / 2), h = hm(py * H.width + px);
    if (code >= 100) { const mine = 100 + Math.max(0, Math.min(155, Math.round(h / 60))); tot++; if (Math.abs(mine - code) <= 1) ok1++; landAgree += h > 0 ? 1 : 0; }
    else { seaN++; if (h === 0) landAgree++; }
  }
  t(`packed heights → datagrid codes: within ±1 on ${(ok1 / tot * 100).toFixed(3)} % of land pixels (≥ 99,5 %)`, ok1 / tot >= 0.995);
  t(`land/sea mask agrees with the datagrid on ${(landAgree / (tot + seaN) * 100).toFixed(3)} % of pixels (sea is flat 0 m)`, landAgree / (tot + seaN) > 0.999);
  let mx = 0; for (let i = 0; i < H.width * H.height; i++) mx = Math.max(mx, hm(i)); t(`tallest packed height ${mx.toFixed(0)} m < hmax ${man.height.hmax_m} m, equals manifest`, mx < man.height.hmax_m && near(mx, man.height.max_land_m, 1));
  // 3) slope map orientation/encoding: compare with central differences of the packed heights (land interior)
  const { execFileSync } = await import('node:child_process');
  const py = process.env.RH_PYTHON || 'python3';
  let slopeReport = null;
  try {
    slopeReport = JSON.parse(execFileSync(py, ['-c', `
import json, numpy as np, sys
from PIL import Image
man = json.load(open(${JSON.stringify(path.join(D3, 'relief.json'))}))
S = np.asarray(Image.open(${JSON.stringify(path.join(D3, 'slope.webp'))}).convert('RGB')).astype(np.float64)
H = np.asarray(Image.open(${JSON.stringify(path.join(D3, man.height.file))}).convert('RGB')).astype(np.float64)
h = (H[...,0]*256 + H[...,1]) / 65535 * man['height']['hmax_m'] / 1000.0
x = (S[...,:2] - 127) / 127; s = man['slope']['smax'] * np.sign(x) * x * x
R = ${DATA.stats.radius_km} * 1.0; Hh, W = h.shape; px = 2*np.pi*R/W
lat = 90 - (np.arange(Hh) + .5) * 180 / Hh; cl = np.cos(np.radians(lat)).clip(.05, 1)[:, None]
gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / 2 / (px * cl); gy = -np.gradient(h, axis=0) / px
land = h > 0; inner = land & np.roll(land, 1, 0) & np.roll(land, -1, 0) & np.roll(land, 1, 1) & np.roll(land, -1, 1) & (np.abs(lat)[:, None] < 80)
err_e = np.abs(s[...,0] - gx)[inner]; err_n = np.abs(s[...,1] - gy)[inner]
corr_e = float(np.corrcoef(s[...,0][inner], gx[inner])[0,1]); corr_n = float(np.corrcoef(s[...,1][inner], gy[inner])[0,1])
flat = float(np.abs(s[~land]).mean())
print(json.dumps(dict(corr_e=corr_e, corr_n=corr_n, med_err=float(np.median(np.maximum(err_e, err_n))), p99_err=float(np.percentile(np.maximum(err_e, err_n), 99)), sea_mean=flat, n=int(inner.sum()))))
`], { encoding: 'utf8', maxBuffer: 1 << 28 }));
  } catch (e) { console.log('  (slope check skipped: python3 with numpy+Pillow not available — set RH_PYTHON)'); }
  if (slopeReport) {
    t(`slope map east/north match the heights' own gradients (r = ${slopeReport.corr_e.toFixed(4)} / ${slopeReport.corr_n.toFixed(4)}, n = ${slopeReport.n})`, slopeReport.corr_e > 0.999 && slopeReport.corr_n > 0.999, JSON.stringify(slopeReport));
    t(`slope precision: median error ${slopeReport.med_err.toExponential(1)}, p99 ${slopeReport.p99_err.toExponential(1)}`, slopeReport.med_err < 1e-3 && slopeReport.p99_err < 3e-3);
  }
  const total = fs.readdirSync(D3).reduce((s, f) => s + fs.statSync(path.join(D3, f)).size, 0);
  t(`3D extra assets ${(total / 1e6).toFixed(2)} MB ≤ 15 MB budget`, total <= 15e6);
  t('manifest hashes match the files', Object.entries(man.files).every(([n, f]) => crypto.createHash('sha256').update(fs.readFileSync(path.join(D3, n))).digest('hex') === f.sha256));
  // canon untouched
  const canon = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/canon-hashes.json'), 'utf8')).sha256;
  t('canon assets/data byte-identical to the pre-Stage-2 baseline', Object.entries(canon).every(([f, h]) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex') === h));
}

// ============================================================ browser
const srv = await startServer(), browser = await launch();
async function open3D(o = {}) {
  const { ctx, page, ev } = await newPage(browser, { cdn: o.cdn });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  if (o.route) await o.route(page);
  await page.goto(srv.url + (o.query || '?view=3d'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__rhGlobe && window.__rhGlobe.isShown() && window.__rhGlobe.info().frames >= 5, null, { timeout: 60000 });
  return { ctx, page, ev };
}
const uni = (page) => page.evaluate(() => { const u = window.__rhGlobe._S.mat.uniforms; return { relief: u.uRelief.value, exag: u.uExag.value, disp: u.uDisp.value, hmax: u.uHMax.value, hs: [u.uHeightSize.value.x, u.uHeightSize.value.y], smax: u.uSlopeMax.value, albedoIsBase: u.uAlbedo.value === window.__rhGlobe._S.baseTex }; });
// rightmost opaque pixel of the WebGL canvas on a given CSS row (alpha ≥ 128), read straight from the framebuffer right after a render
const silhouette = (page, rowCss) => page.evaluate((y) => { const S = window.__rhGlobe._S; S.render(); const gl = S.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, row = new Uint8Array(w * 4), yy = Math.round((1 - y / S.H) * h) - 1;
  gl.readPixels(0, Math.max(0, Math.min(h - 1, yy)), w, 1, gl.RGBA, gl.UNSIGNED_BYTE, row); let x = w - 1; while (x > 0 && row[x * 4 + 3] < 128) x--; return x / S.dpr; }, rowCss);
const frame = (page, n = 3) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

{ // lazy loading + uniforms + slider + toggle off
  const { ctx, page, ev } = await open3D();
  const reqs = () => ev.requests.filter((u) => /assets\/3d\//.test(u)).map((u) => u.split('/assets/3d/')[1]);
  t('relief assets are NOT requested when entering 3D (lazy)', reqs().length === 0, reqs().join());
  await page.locator('#tab-globe').click();
  t('relief is off by default, slider disabled, exaggeration default 15×', !(await page.locator('#g-relief').isChecked()) && (await page.locator('#g-exag').isDisabled()) && (await page.locator('#g-exag').inputValue()) === '15' && /15×/.test(await page.locator('#g-exag-v').innerText()));
  t('before activation: baked-hillshade texture, no displacement', await (async () => { const u = await uni(page); return u.relief === 0 && u.disp === 0 && u.albedoIsBase; })());
  await page.locator('#g-relief').check();
  await page.waitForFunction(() => /^aktif/.test(document.getElementById('g-relief-st').textContent), null, { timeout: 90000 });
  const r = reqs(); t(`after activation exactly the four relief files are requested once (${r.join(', ')})`, r.length === 4 && ['relief.json', man.height.file, man.slope.file, man.albedo.file].every((f) => r.includes(f)));
  const u = await uni(page);
  t('shader uniforms: relief on, hmax and height texture size from the manifest', u.relief === 1 && u.hmax === man.height.hmax_m && u.hs[0] === 4096 && u.hs[1] === 2048 && near(u.smax, man.slope.smax, 1e-9), JSON.stringify(u));
  t('displacement = exaggeration / planet radius (15× / 8.282 km)', u.exag === 15 && near(u.disp, 15 / 8282000, 1e-12) && !u.albedoIsBase);
  { const st = await page.locator('#g-relief-st').innerText(); t('status text names the epistemic label', /Turunan/.test(st), st); }
  const albedoLum = await page.evaluate(async () => { const g = window.__rhGlobe; function lum(img) { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 256, 128); const d = x.getImageData(0, 0, 256, 128).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / (d.length / 4); } const a = lum(g._S.mat.uniforms.uAlbedo.value.image), b = lum(g._S.baseTex.image); return { a, b }; });
  t(`albedo (no hillshade) has the same overall brightness as the canon map (${albedoLum.a.toFixed(1)} vs ${albedoLum.b.toFixed(1)})`, Math.abs(albedoLum.a / albedoLum.b - 1) < 0.1, JSON.stringify(albedoLum));
  // slider
  await page.locator('#g-exag').fill('60'); let uu = await uni(page); t('slider 60× → uExag 60 and displacement 60/R', uu.exag === 60 && near(uu.disp, 60 / 8282000, 1e-12));
  t('exaggeration persisted', (await page.evaluate(() => localStorage.getItem('rh-g-exag'))) === '60');
  await page.locator('#g-exag').fill('0'); uu = await uni(page); t('slider 0× → flat sphere (no displacement)', uu.exag === 0 && uu.disp === 0);
  // displacement is real: the silhouette grows where the tallest peak sits at the limb
  const H = PNG.sync.read(fs.readFileSync(path.join(D3, man.height.file))); let best = 0, bi = 0; for (let i = 0; i < H.width * H.height; i++) { const v = H.data[i * 4] * 256 + H.data[i * 4 + 1]; if (v > best) { best = v; bi = i; } }
  const pkLat = 90 - (Math.floor(bi / H.width) + 0.5) * 180 / H.height, pkLon = -180 + ((bi % H.width) + 0.5) * 360 / H.width;
  await page.evaluate(([la, lo]) => { const g = window.__rhGlobe, c = g._ctx; g._state.spin = false; Object.keys(c.LAYERS).forEach((k) => c.setLayer(k, false)); const S = g._S; S.cancelFly(); S.view.dist = 3.4; S.view.lat = la; S.view.lon = lo - Math.acos(1 / 3.4) * 180 / Math.PI + 1.5; S.dirty(); }, [pkLat, pkLon]);
  await frame(page, 3);
  const row = await page.evaluate(([la, lo]) => { const S = window.__rhGlobe._S, v = RH.G.vec(la, lo), o = S.toScreen(v[0], v[1], v[2], {}); return { y: o.y, x: o.x }; }, [pkLat, pkLon]);
  async function extent(exag) { await page.locator('#g-exag').fill(String(exag)); await frame(page, 2); return silhouette(page, row.y); }
  const e0 = await extent(0), e60 = await extent(60);
  t(`peak ${(best / 65535 * man.height.hmax_m).toFixed(0)} m at (${pkLat.toFixed(1)}°, ${pkLon.toFixed(1)}°): silhouette grows by ${e60 - e0} px at 60× (vertex displacement works)`, e60 - e0 >= 6, `${e0} → ${e60}`);
  // toggle off restores the baked texture; toggling again does not re-download
  await page.locator('#g-relief').uncheck(); uu = await uni(page); t('relief off → baked-hillshade texture back, displacement gone', uu.relief === 0 && uu.disp === 0 && uu.albedoIsBase);
  const before = reqs().length, texBefore = await page.evaluate(() => window.__rhGlobe.info().textures);
  for (let i = 0; i < 5; i++) { await page.locator('#g-relief').check(); await page.waitForFunction(() => /^aktif/.test(document.getElementById('g-relief-st').textContent)); await page.locator('#g-relief').uncheck(); }
  t('re-enabling reuses the cached textures (no new requests, GPU texture count stable)', reqs().length === before && (await page.evaluate(() => window.__rhGlobe.info().textures)) === texBefore, `${reqs().length} vs ${before}`);
  t('no console errors/warnings and no page errors', ev.errors.length === 0 && ev.console.length === 0, JSON.stringify([ev.errors, ev.console]));
  await ctx.close();
}
{ // failure: relief files unreachable → friendly message, globe unharmed
  const { ctx, page, ev } = await open3D({ route: (p) => p.route('**/assets/3d/relief.json', (r) => r.abort()) });
  await page.locator('#tab-globe').click(); await page.locator('#g-relief').check(); await page.waitForTimeout(1500);
  t('failed relief load: friendly toast, checkbox unchecked, status says failed', await page.evaluate(() => /Relief tidak bisa dimuat/.test(document.getElementById('v2-toast').innerText) && !document.getElementById('g-relief').checked && /gagal/.test(document.getElementById('g-relief-st').textContent)));
  t('globe still renders after the failure (frames keep advancing)', await (async () => { const a = await page.evaluate(() => window.__rhGlobe.info().frames); await page.evaluate(() => window.__rhGlobe._S.dirty()); await page.waitForTimeout(800); return (await page.evaluate(() => window.__rhGlobe.info().frames)) > a; })());
  t('retry is possible (checkbox enabled again)', !(await page.locator('#g-relief').isDisabled()));
  await ctx.close();
}
{ // GPU with MAX_TEXTURE_SIZE 2048
  const { ctx, page } = await open3D({ query: '?view=3d&maxtex=2048' });
  await page.locator('#tab-globe').click(); await page.locator('#g-relief').check(); await page.waitForFunction(() => /^aktif|^gagal/.test(document.getElementById('g-relief-st').textContent), null, { timeout: 90000 });
  const u = await uni(page); t(`maxtex=2048: relief still works with a 2048×1024 height texture (CPU-repacked 16-bit) → ${u.hs.join('×')}`, u.relief === 1 && u.hs[0] === 2048 && u.hs[1] === 1024, JSON.stringify(u));
  await ctx.close();
}
await browser.close(); await srv.close();
console.log(`\nrelief: ${pass} passed, ${fail} failed${fail ? '\nFAILED: ' + failures.join(' | ') : ''}`);
process.exit(fail ? 1 : 0);
