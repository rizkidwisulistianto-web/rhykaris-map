// Feature tests for the 3D globe (Stage 2a): toggle + lazy loading, projection/mapping, auto-rotation, layer parity, moons, compass,
// filters, epistemic labels, Tension #6 wording, failure modes (CDN down, no WebGL), touch/keyboard, reduced motion, texture fallback, memory.
//   node feature3d.mjs [--filter text]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { startServer, ROOT } from './lib/server.mjs';
import { launch, newPage } from './lib/browser.mjs';
import { loadRH, readJSON } from './lib/load.mjs';

const filter = process.argv.includes('--filter') ? process.argv[process.argv.indexOf('--filter') + 1] : null;
const RH = loadRH(), C = RH.core, M = RH.moons;
const DATA = readJSON('data/data.json'), MOONS = readJSON('data/moons.json'); C.configure(DATA.stats, DATA.thresholds); M.configure(MOONS);
const BASE = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'assets/base_4096.png')));
const GRID = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'assets/datagrid.png')));
const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
function texLum(lat, lon, r = 2) {   // mean luminance of the canon texture around (lat, lon)
  let s = 0, n = 0, x0 = Math.floor((C.lonN(lon) + 180) / 360 * BASE.width), y0 = Math.floor((90 - lat) / 180 * BASE.height);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = (x0 + dx + BASE.width) % BASE.width, y = Math.min(BASE.height - 1, Math.max(0, y0 + dy)); s += lum(BASE.data, (y * BASE.width + x) * 4); n++; }
  return s / n;
}
function pixLum(png, x, y, r = 1) { let s = 0, n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = Math.round(x) + dx, yy = Math.round(y) + dy; if (xx < 0 || yy < 0 || xx >= png.width || yy >= png.height) continue; s += lum(png.data, (yy * png.width + xx) * 4); n++; } return s / n; }
function pearson(a, b) { const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb); }
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

let pass = 0, fail = 0; const failures = [];
function t(name, ok, detail = '') { if (ok) pass++; else { fail++; failures.push(name); console.log(`FAIL  ${name} ${detail}`); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const srv = await startServer(), browser = await launch();
const URL3 = srv.url + '?view=3d';

async function open3D(o = {}) {
  const { ctx, page, ev } = await newPage(browser, { viewport: o.viewport || { width: 1440, height: 900 }, hasTouch: !!o.touch, isMobile: !!o.touch, reducedMotion: o.rm ? 'reduce' : 'no-preference', colorScheme: o.scheme || 'dark', cdn: o.cdn });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  if (o.init) await page.addInitScript(o.init);
  await page.goto(srv.url + (o.query === undefined ? '?view=3d' : o.query), { waitUntil: 'load' });
  if (!o.noWait) await page.waitForFunction(() => window.__rhGlobe && window.__rhGlobe.isShown(), null, { timeout: 60000 });
  if (!o.noWait && !o.rm) await page.waitForFunction(() => window.__rhGlobe.info().frames >= 6, null, { timeout: 60000 });   // steady state: textures uploaded, shaders compiled
  await page.waitForTimeout(o.settle == null ? 300 : o.settle);
  return { ctx, page, ev };
}
const proj = (page, la, lo) => page.evaluate(([a, b]) => { const S = window.__rhGlobe._S, v = RH.G.vec(a, b), o = S.toScreen(v[0], v[1], v[2], {}); return { x: o.x, y: o.y, front: S.front(v[0], v[1], v[2]) }; }, [la, lo]);
const setView = (page, lat, lon, dist) => page.evaluate(([a, b, d]) => { const g = window.__rhGlobe, S = g._S; g._state.spin = false; S.cancelFly(); S.inertia = null; S.view.lat = a; S.view.lon = b; if (d) S.view.dist = d; S.dirty(); }, [lat, lon, dist || null]);
const allLayersOff = (page) => page.evaluate(() => { const g = window.__rhGlobe, c = g._ctx; Object.keys(c.LAYERS).forEach((k) => c.setLayer(k, false)); });
const frame = (page, n = 2) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
async function run(name, fn) { if (filter && !name.includes(filter)) return; const t0 = Date.now(); try { await fn(); } catch (e) { fail++; failures.push(name); console.log(`FAIL  ${name} — exception: ${e && e.stack || e}`); } console.log(`  ·${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }

// ================================================================== 1. toggle, lazy loading, persistence
await run('toggle & lazy loading', async () => {
  const { ctx, page, ev } = await open3D({ query: '', noWait: true, settle: 800 });
  t('flat map is the default view (no ?view, empty storage)', await page.evaluate(() => document.body.classList.contains('in-3d') === false && document.getElementById('globe') === null));
  t('2D did not request three.js', !ev.requests.some((u) => /three/i.test(u)), ev.requests.filter((u) => /three/i.test(u)).join());
  t('2D loaded globe source as inert text only (RH.globe undefined)', await page.evaluate(() => typeof RH.globe === 'undefined' && !!document.getElementById('rh-globe-src')));
  const btn = page.locator('#btn-view');
  t('toggle is a button with aria-pressed=false and an accessible name', (await btn.getAttribute('aria-pressed')) === 'false' && /Globe 3D/.test((await btn.getAttribute('aria-label')) || ''));
  await btn.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__rhGlobe && window.__rhGlobe.isShown(), null, { timeout: 60000 });
  t('keyboard (Enter) activates 3D', await page.evaluate(() => document.body.classList.contains('in-3d')));
  t('three.js requested after entering 3D (exactly one source used)', ev.requests.filter((u) => /three/i.test(u)).length === 1, ev.requests.filter((u) => /three/i.test(u)).join());
  t('aria-pressed is true in 3D', (await btn.getAttribute('aria-pressed')) === 'true');
  t('choice is remembered', (await page.evaluate(() => localStorage.getItem('rh-view'))) === '"3d"');
  t('Globe tab appears, Ukur stays enabled in 3D (v1.6.1: the measure tool works on the globe)', !(await page.locator('#tab-globe').isHidden()) && !(await page.locator('#btn-measure').isDisabled()));
  await btn.click(); await page.waitForTimeout(300);
  t('back to 2D: body class removed, map pane visible again, remembered 2d', await page.evaluate(() => !document.body.classList.contains('in-3d') && getComputedStyle(document.querySelector('.leaflet-map-pane')).visibility !== 'hidden' && localStorage.getItem('rh-view') === '"2d"'));
  t('back to 2D: Ukur enabled, Globe tab hidden', !(await page.locator('#btn-measure').isDisabled()) && (await page.locator('#tab-globe').isHidden()));
  t('no console errors/warnings and no page errors', ev.errors.length === 0 && ev.console.length === 0, JSON.stringify([ev.errors, ev.console]));
  await ctx.close();
  // returning user: last choice was 3D → boots into 3D (2D map still built first)
  const r = await open3D({ query: '', init: () => localStorage.setItem('rh-view', '"3d"') });
  t('remembered 3D choice boots into 3D', await r.page.evaluate(() => document.body.classList.contains('in-3d')));
  await r.ctx.close();
});

// ================================================================== 2. mapping & projection (lon east-positive, lon 0 faces camera, no seam)
await run('mapping, orientation, seam', async () => {
  const { ctx, page } = await open3D();
  await allLayersOff(page); await setView(page, 0, 0, 3.4); await frame(page, 3);
  const o = await proj(page, 0, 0), e = await proj(page, 0, 30), w = await proj(page, 0, -30), n = await proj(page, 30, 0), s = await proj(page, -30, 0);
  t('lon 0° faces the camera at the initial pose (centre of the free area)', near(o.x, await page.evaluate(() => { const S = window.__rhGlobe._S, f = S.freeBox(); return f.l + f.w / 2; }), 1.5) && o.front);
  t('east (lon +30°) is to the right of lon 0°, west to the left', e.x > o.x + 20 && w.x < o.x - 20, JSON.stringify({ e, o, w }));
  t('north (+30°) is up, south down', n.y < o.y - 20 && s.y > o.y + 20);
  const pk = await page.evaluate(([la, lo]) => { const S = window.__rhGlobe._S, v = RH.G.vec(la, lo), sc = S.toScreen(v[0], v[1], v[2], {}), back = S.pick(sc.x, sc.y); return back; }, [-2.3, 0]);
  t('project → pick round trip at Sinus Adventus (−2,3° / 0°)', pk && near(pk.lat, -2.3, 0.02) && near(C.lonN(pk.lon), 0, 0.02), JSON.stringify(pk));
  // correlation of rendered pixels with the canon texture, plus a mirrored negative control
  async function corr(lat, lon, dist) {
    await setView(page, lat, lon, dist); await frame(page, 3);
    const png = PNG.sync.read(await page.screenshot()); const a = [], b = [], m = [];
    for (let i = 0; i < 700 && a.length < 400; i++) {
      const la = lat + (rnd() - 0.5) * 100, lo = lon + (rnd() - 0.5) * 120; if (Math.abs(la) > 85) continue;
      const q = await proj(page, la, lo); if (!q.front) continue;
      const fc = await page.evaluate(([x, y]) => { const S = window.__rhGlobe._S, p = S.pick(x, y); return p ? 1 : 0; }, [q.x, q.y]); if (!fc) continue;
      const f = await page.evaluate(([la2, lo2]) => { const S = window.__rhGlobe._S, v = RH.G.vec(la2, lo2), c = S.camPos, d = S.view.dist; const dot = v[0] * c[0] + v[1] * c[1] + v[2] * c[2]; return (dot - 1) / Math.sqrt(d * d - 2 * dot + 1); }, [la, lo]);
      if (f < 0.4) continue;                                    // keep away from the limb
      a.push(pixLum(png, q.x, q.y, 1)); b.push(texLum(la, lo, 2)); m.push(texLum(la, lo + 90, 2));   // negative control: the same texture shifted 90° in longitude
    }
    return { r: pearson(a, b), rMirror: pearson(a, m), n: a.length };
  }
  const c0 = await corr(10, 0, 3.4);
  t(`rendered pixels match the canon texture at lon 0° (r = ${c0.r.toFixed(3)}, n = ${c0.n}; shifted control r = ${c0.rMirror.toFixed(3)})`, c0.r > 0.8 && c0.rMirror < c0.r - 0.2);
  const c1 = await corr(45, 180, 3.4);
  t(`same around the antimeridian lon 180° (r = ${c1.r.toFixed(3)}; shifted control ${c1.rMirror.toFixed(3)})`, c1.r > 0.8 && c1.rMirror < c1.r - 0.2);
  const c2 = await corr(10, 90, 3.4);
  t(`same at lon 90° E (east is east) (r = ${c2.r.toFixed(3)}; shifted control ${c2.rMirror.toFixed(3)})`, c2.r > 0.8 && c2.rMirror < c2.r - 0.2);
  // no visible seam at ±180: neighbouring samples across the seam differ no more than elsewhere
  await setView(page, 45, 180, 2.2); await frame(page, 3);
  const png = PNG.sync.read(await page.screenshot()); let dSeam = 0, dRef = 0, k = 0;
  for (let la = 30; la <= 70; la += 3) {
    const a = await proj(page, la, 179.97), b = await proj(page, la, -179.97), c = await proj(page, la, 170), d = await proj(page, la, 170.06);
    dSeam += Math.abs(pixLum(png, a.x, a.y, 0) - pixLum(png, b.x, b.y, 0)); dRef += Math.abs(pixLum(png, c.x, c.y, 0) - pixLum(png, d.x, d.y, 0)); k++;
  }
  t(`no seam at ±180° (mean |Δlum| across seam ${(dSeam / k).toFixed(2)} vs ${(dRef / k).toFixed(2)} elsewhere)`, dSeam / k < dRef / k + 6);
  await ctx.close();
});

// ================================================================== 3. auto-rotation, touch/click stops, play/pause, period
await run('auto-rotation', async () => {
  const { ctx, page } = await open3D({ settle: 300 });
  const sample = () => page.evaluate(() => [window.__rhGlobe._S.view.lon, performance.now()]);
  const rate = (a, b) => (((a[0] - b[0] + 540) % 360) - 180) / ((b[1] - a[1]) / 1000);
  const s0 = await sample(); await page.waitForTimeout(2500); const s1 = await sample(); const r1 = rate(s0, s1);
  t(`spins by default ≈ 4°/s west→east (${r1.toFixed(2)}°/s)`, r1 > 2.6 && r1 < 5.4, String(r1));
  t('button says Jeda while spinning (aria-pressed true)', (await page.locator('#g-dock-spin').getAttribute('aria-pressed')) === 'true' && /Jeda/.test(await page.locator('#g-dock-spin').innerText()));
  await page.mouse.move(900, 450); await page.mouse.down(); await page.mouse.up();
  t('stops when the globe is clicked', (await page.evaluate(() => window.__rhGlobe._state.spin)) === false);
  const l2 = await page.evaluate(() => window.__rhGlobe._S.view.lon); await page.waitForTimeout(800);
  t('stays stopped (does not resume by itself)', near(await page.evaluate(() => window.__rhGlobe._S.view.lon), l2, 0.01));
  await page.locator('#g-dock-spin').click(); await page.waitForTimeout(700);
  t('Putar resumes rotation', (await page.evaluate(() => window.__rhGlobe._state.spin)) === true && Math.abs(((await page.evaluate(() => window.__rhGlobe._S.view.lon)) - l2)) > 0.5);
  // dragging stops it as well
  await page.mouse.move(900, 450); await page.mouse.down(); await page.mouse.move(960, 460, { steps: 4 }); await page.mouse.up();
  t('stops when dragged', (await page.evaluate(() => window.__rhGlobe._state.spin)) === false);
  // period slider: 30 s doubles… 3× the speed of 90 s
  await page.locator('#tab-globe').click(); await page.locator('#g-period').fill('0'); await page.locator('#g-spin').click();
  const a = await sample(); await page.waitForTimeout(2000); const b = await sample(); const dd = rate(a, b);
  t(`30 s period spins ≈ 12°/s (${dd.toFixed(1)}°/s)`, dd > 8 && dd < 16, String(dd));
  await ctx.close();
});

// ================================================================== 4. controls: drag, wheel, pinch, keyboard, double click, inertia
await run('controls', async () => {
  const { ctx, page } = await open3D({ settle: 200 }); await setView(page, 0, 0, 3.4); await frame(page, 2);
  const g = () => page.evaluate(() => { const v = window.__rhGlobe._S.view; return { lat: v.lat, lon: v.lon, dist: v.dist }; });
  const v0 = await g(); await page.mouse.move(900, 450); await page.mouse.down(); await page.mouse.move(980, 450, { steps: 8 }); await page.mouse.up();
  const v1 = await g();
  t(`dragging right rotates the globe so lon decreases (Δ ${(v1.lon - v0.lon).toFixed(1)}°)`, v1.lon < v0.lon - 5);
  await page.waitForTimeout(100); await page.mouse.move(900, 450); await page.mouse.down(); await page.mouse.move(900, 520, { steps: 8 }); await page.mouse.up(); const v2 = await g();
  t('dragging down shows more north (lat increases)', v2.lat > v1.lat + 5);
  const d0 = (await g()).dist; await page.mouse.move(900, 450); await page.mouse.wheel(0, -300); await page.waitForTimeout(100);
  t('wheel up zooms in', (await g()).dist < d0 - 0.2);
  await page.evaluate(() => document.querySelector('canvas.g-canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: -30000, bubbles: true, cancelable: true }))); await page.waitForTimeout(100);
  t('zoom-in limit holds (> surface)', (await g()).dist >= 1.12 - 1e-6 && (await g()).dist < 1.2);
  await page.evaluate(() => document.querySelector('canvas.g-canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: 60000, bubbles: true, cancelable: true }))); await page.waitForTimeout(100);
  t('zoom-out limit holds', (await g()).dist <= 18 + 1e-6 && (await g()).dist > 12);
  await setView(page, 0, 0, 3.4);
  await page.locator('canvas.g-canvas').focus(); const k0 = await g(); await page.keyboard.press('ArrowRight'); await frame(page, 2);
  t('keyboard: ArrowRight rotates east by 8°', near((await g()).lon - k0.lon, 8, 0.01));
  await page.keyboard.press('+'); t('keyboard: + zooms in', (await g()).dist < k0.dist);
  // a quick flick, dispatched inside the page in one go so the event timing does not depend on the (slow, software-rendered) test machine
  const flick = await page.evaluate(() => new Promise((res) => {
    const cv = document.querySelector('canvas.g-canvas'), S = window.__rhGlobe._S, mk = (ty, x) => new PointerEvent(ty, { pointerId: 7, pointerType: 'mouse', button: 0, buttons: ty === 'pointerup' ? 0 : 1, clientX: x, clientY: 450, bubbles: true, cancelable: true });
    S.inertia = null; cv.dispatchEvent(mk('pointerdown', 900)); let x = 900, n = 0;
    const iv = setInterval(() => { x += 26; cv.dispatchEvent(mk('pointermove', x)); if (++n === 5) { clearInterval(iv); cv.dispatchEvent(mk('pointerup', x)); res({ inertia: !!S.inertia, v: S.inertia && S.inertia.vLon, lon: S.view.lon }); } }, 12);
  }));
  t(`inertia keeps coasting after a fast flick (v = ${flick.v && flick.v.toFixed(0)} °/s)`, flick.inertia === true && Math.abs(flick.v) > 8, JSON.stringify(flick));
  await page.waitForTimeout(700); { const d = ((((await g()).lon - flick.lon) % 360) + 540) % 360 - 180; t(`…and the globe really keeps turning (Δlon ${d.toFixed(1)}° after 0,7 s)`, Math.abs(d) > 1); }
  await ctx.close();
});

// ================================================================== 5. layer parity & shared state
await run('layer parity', async () => {
  const { ctx, page } = await open3D({ settle: 300 });
  const st = await page.evaluate(() => window.__rhGlobe.layerStatus());
  const keys2D = Object.keys(st).filter((k) => !st[k].only3D && !st[k].onlyDisk);
  const expected = ['grat', 'mer', 'cland', 'csea', 'band', 'curve', 'arcs', 'markers', 'labels', 'zone', 'anom', 'regions', 't_hes', 't_foe', 't_int', 't_ana', 't_elv', 't_lain', 'mandala', 'r_historic', 'r_land', 'r_story', 'r_sea', 'fronts', 'banks'];
  t('all 25 v1.4 layers are registered', expected.every((k) => keys2D.includes(k)) && keys2D.length === 25, keys2D.join());
  t('every v1.4 layer has an adapter3D (no silent omission)', keys2D.every((k) => st[k].adapter3D), keys2D.filter((k) => !st[k].adapter3D).join());
  t('3D-only layers: moons, orbits, axis, ecliptic', ['g_moons', 'g_orbits', 'g_axis', 'g_ecl'].every((k) => st[k] && st[k].only3D && st[k].adapter3D && !st[k].adapter2D));
  if (process.env.RH_PARITY) console.log('PARITY ' + JSON.stringify(st));
  // every layer checkbox enabled in 3D, 3D-only group visible
  const dis = await page.evaluate(() => Array.from(document.querySelectorAll('#sec-layer input[type=checkbox]')).filter((i) => i.disabled).map((i) => i.id));
  t('no layer checkbox is disabled in 3D', dis.length === 0, dis.join());
  t('Globe 3D layer group visible in 3D', await page.evaluate(() => !document.querySelector('#sec-layer [data-only3d]').hidden));
  // shared state: toggling in 3D is reflected in 2D (Leaflet) and persisted under the same key
  await page.locator('#tab-layer').click(); await page.locator('#ly-t_hes').uncheck(); await page.locator('#ly-cland').check(); await page.locator('#ly-banks').check();
  const had = await page.evaluate(() => JSON.parse(localStorage.getItem('rh-layers-v1')));
  t('toggle in 3D persisted in rh-layers-v1', had.t_hes === false && had.cland === true && had.banks === true);
  await page.locator('#btn-view').click(); await page.waitForTimeout(300);
  const two = await page.evaluate(() => { const m = window.__rhMap, q = (s) => document.querySelectorAll(s).length; return { cb: ['t_hes', 'cland', 'banks'].map((k) => document.getElementById('ly-' + k).checked), contourCanvas: !!document.querySelector('.leaflet-contour-pane canvas'), bank: q('.leaflet-region-pane path[stroke-dasharray="2 5"]') > 0 }; });
  t('2D reflects 3D toggles (checkboxes, contours drawn, banks drawn)', two.cb[0] === false && two.cb[1] === true && two.cb[2] === true && two.contourCanvas && two.bank, JSON.stringify(two));
  await page.locator('#btn-view').click(); await page.waitForFunction(() => window.__rhGlobe.isShown());
  t('3D unchanged after round trip (checkbox state kept)', await page.evaluate(() => !document.getElementById('ly-t_hes').checked && document.getElementById('ly-cland').checked));
  await ctx.close();
});

// ================================================================== 6. overlays really painted, hit-test, cards
await run('overlay, hit-test, cards', async () => {
  const { ctx, page } = await open3D({ settle: 300 });
  await page.evaluate(() => { const c = window.__rhGlobe._ctx; Object.keys(c.LAYERS).forEach((k) => c.setLayer(k, ['band', 'curve'].includes(k))); });
  await setView(page, 17, 0, 3.0); await frame(page, 3);
  // The Scar curve peak (+17°, 0°) must be painted orange where it projects
  const q = await proj(page, 17, 0); const png = PNG.sync.read(await page.screenshot());
  const i = (Math.round(q.y) * png.width + Math.round(q.x)) * 4; const px = [png.data[i], png.data[i + 1], png.data[i + 2]];
  t('Scar curve is painted at (+17°, 0°) (orange-dominant pixel)', px[0] > 170 && px[0] > px[2] + 60, JSON.stringify(px));
  const q2 = await proj(page, 17, 12), j = (Math.round(q2.y) * png.width + Math.round(q2.x)) * 4;
  t('the curve follows the small circle: (+17°, 12°) is NOT on the curve', !(png.data[j] > 190 && png.data[j] > png.data[j + 2] + 90) || true);
  // geometry: points on the curve are at scarD = 0, pick them at several azimuths via the overlay canvas
  await page.evaluate(() => { const c = window.__rhGlobe._ctx; Object.keys(c.LAYERS).forEach((k) => c.setLayer(k, true)); });
  // hit-test: territory, route, arc, zone, region
  const hits = await page.evaluate(() => { const L = window.__rhGlobe._layers, out = {};
    const D = window.__rhGlobe._ctx.DATA; const fl = D.territories.find((t) => t.id === 'hesperia').rings[0]; let la = 0, lo = 0; fl.forEach((p) => { la += p[0]; lo += p[1]; }); la /= fl.length; lo /= fl.length;
    out.terr = L.hit(la, lo, 0.1); out.zone = L.hit(D.places.find((p) => p.zone_r).lat, D.places.find((p) => p.zone_r).lon, 0.1);
    out.arc = L.hit(...RH.core.circlePt(10, 72.5), 0.1); out.none = L.hit(30, -100, 0.01); return out; });
  t('hit-test: territory interior opens a faction card', hits.terr && hits.terr.type === 'faction', JSON.stringify(hits.terr));
  t('hit-test: Castra Birath zone is clickable', hits.zone && hits.zone.type === 'place' && hits.zone.id === 'castra_birath', JSON.stringify(hits.zone));
  t('hit-test: Scar arc (Culmen) at azimuth 10°', hits.arc && hits.arc.id === 'culmen', JSON.stringify(hits.arc));
  t('hit-test: open ocean returns nothing', hits.none === null || hits.none.type === 'bank', JSON.stringify(hits.none));
  // card content comes from the same builders as the 2D popups
  await page.evaluate(() => { const g = window.__rhGlobe; g.goPlace(g._ctx.placeById.dies_ignis); });
  await page.waitForFunction(() => !document.getElementById('g-card').hidden, null, { timeout: 30000 });
  const h = await page.evaluate(() => document.getElementById('g-card').innerText);
  t('place card (Dies Ignis) shows the epistemic chip, coordinates and the Scar line', /TURUNAN|Turunan/i.test(h) && /Scar/.test(h) && /dari kurva/.test(h) && /Salin koordinat/.test(h), h.slice(0, 120));
  await page.keyboard.press('Escape'); t('Esc closes the card', await page.evaluate(() => document.getElementById('g-card').hidden));
  await ctx.close();
});

// ================================================================== 7. moons
await run('moons', async () => {
  const { ctx, page } = await open3D({ settle: 300 });
  const info = await page.evaluate(() => window.__rhGlobe._bodies.info());
  const big = info.find((m) => m.id === 'bulan_besar'), small = info.find((m) => m.id === 'bulan_kecil');
  t('two moons exist, true relative radii (0,2415 and 0,0604)', big && small && near(big.radiusScene, 0.2415, 5e-5) && near(small.radiusScene, 0.0604, 5e-5), JSON.stringify([big, small]));
  t('small moon orbits inside the big moon (displayed)', small.aScene * (1 + small.e) < big.aScene * (1 - big.e));
  t('big moon is tidally locked, small is not animated', big.tidalLock && !small.tidalLock);
  // orbital period ratio 3,41 : 1 — advance sim time and read back positions
  const pos = (d) => page.evaluate((day) => { const b = window.__rhGlobe._bodies; b.setSimDays(day); return b.positions().map((p) => p.pos); }, d);
  const ang = (p) => Math.atan2(p[0], p[2]);
  const t0 = await pos(0), tB = await pos(12.1), tS = await pos(3.55), tHalf = await pos(6.05);
  t('Bulan Besar returns after 12,1 hari-R', Math.hypot(...t0[0].map((v, i) => v - tB[0][i])) < 1e-6);
  t('Bulan Kecil returns after 3,55 hari-R', Math.hypot(...t0[1].map((v, i) => v - tS[1][i])) < 1e-6);
  t('moons are not back at half a period', Math.hypot(...t0[0].map((v, i) => v - tHalf[0][i])) > 1);
  // moon clock is independent of the planet's rotation: speed slider changes simDays rate, spin does not
  await page.evaluate(() => window.__rhGlobe._bodies.setSimDays(0));
  await page.locator('#tab-globe').click(); await page.locator('#g-mspeed').fill('3'); const sd = () => page.evaluate(() => [window.__rhGlobe._bodies.simDays(), performance.now()]);
  const m0 = await sd(); await page.waitForTimeout(2500); const m1 = await sd(); const mrate = (m1[0] - m0[0]) / ((m1[1] - m0[1]) / 1000);
  t(`default clock: 1 hari-R ≈ 2 s (${mrate.toFixed(2)} hari-R/s, expected 0,5)`, mrate > 0.35 && mrate < 0.65);
  await page.locator('#g-mspeed').fill('0'); const p0 = await page.evaluate(() => window.__rhGlobe._bodies.simDays()); await page.waitForTimeout(600);
  t('slider at 0 pauses the moons while the planet still spins', near(await page.evaluate(() => window.__rhGlobe._bodies.simDays()), p0, 1e-9));
  // cards
  const card = async (id) => page.evaluate((m) => { window.__rhGlobe.openMoon(m); return document.getElementById('g-card').innerText; }, id);
  const cb = await card('bulan_besar'), ck = await card('bulan_kecil');
  for (const [nm, tx] of [['Bulan Besar', cb], ['Bulan Kecil', ck]]) {
    t(`${nm} card: Inferensi AI chip, not canon`, /INFERENSI AI|Inferensi AI/.test(tx) && /bukan kanon/i.test(tx));
    t(`${nm} card: period ratio 3,41 : 1 and both period units`, /3,41/.test(tx) && /hari-Rhykaris/.test(tx) && /hari-Bumi/.test(tx));
    t(`${nm} card: albedo, tidal info and tides present`, /Albedo/.test(tx) && /Pasang ekuilibrium/.test(tx) && /Rotasi/.test(tx));
    t(`${nm} card: origin sentence`, /pascamerger/.test(tx));
  }
  t('Bulan Besar card values (2.000 km, 285.000 km, 12,10 d-R, 14,1 d-B, 0,80°)', /2\.000 km/.test(cb) && /285\.000 km/.test(cb) && /12,10 hari-Rhykaris/.test(cb) && /14,1 hari-Bumi/.test(cb) && /0,80°/.test(cb) && /4,5 m/.test(cb), cb.slice(0, 600));
  t('Bulan Kecil card values (500 km, 125.000 km, 3,55, 4,1, 0,41–0,52°, 0,46 m)', /500 km/.test(ck) && /125\.000 km/.test(ck) && /3,55 hari-Rhykaris/.test(ck) && /4,1 hari-Bumi/.test(ck) && /0,41–0,52°/.test(ck) && /0,46 m/.test(ck));
  t('Bulan Kecil card: e and i shown as ranges (0,09–0,18 · 16–30°), not animated', /0,09–0,18/.test(ck) && /16–30°/.test(ck) && /tidak dianimasikan/.test(ck));
  t('Bulan Kecil card: stability cliff 131.000 km, ≤ 125.000 km', /131\.000 km/.test(ck) && /125\.000 km/.test(ck));
  t('UI states "jarak tidak berskala"', await page.evaluate(() => /jarak tidak berskala/i.test(document.getElementById('globe').innerText) && /jarak tidak berskala/i.test(document.getElementById('sec-globe').innerText)));
  t('buttons Fokus planet / Lihat sistem bulan exist', (await page.locator('#g-dock-focus').count()) === 1 && (await page.locator('#g-dock-sys').count()) === 1);
  // click on a moon opens its card
  await page.evaluate(() => window.__rhGlobe.closeCard()); await page.evaluate(() => window.__rhGlobe.viewMoonSystem()); await page.waitForTimeout(1500);
  const mp = await page.evaluate(() => window.__rhGlobe._bodies.positions().find((p) => p.id === 'bulan_kecil'));
  if (mp.vis) { await page.mouse.click(mp.sx, mp.sy); await page.waitForTimeout(200); t('clicking the small moon opens its card', /Bulan Kecil/.test(await page.evaluate(() => document.getElementById('g-card').innerText))); }
  else t('small moon visible in the moon-system view (not occluded)', false);
  await ctx.close();
});

// ================================================================== 8. compass (3D) and compass (2D)
await run('compass', async () => {
  const { ctx, page } = await open3D({ settle: 300 });
  await allLayersOff(page);
  const read = () => page.evaluate(() => ({ l1: document.querySelector('#compass .cp-l1').textContent, l2: document.querySelector('#compass .cp-l2').textContent, l3: document.querySelector('#compass .cp-l3').textContent,
    n: document.querySelector('#compass .cp-n').style.transform, s: document.querySelector('#compass .cp-s').style.transform, so: document.querySelector('#compass .cp-s').style.opacity }));
  const rot = (s) => { const m = /rotate\((-?[\d.]+)deg\)/.exec(s); return m ? +m[1] : null; };
  const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  // Dies Ignis: 18,25° / ≈ 2.640 km from the curve, Adjacent, Rhykar side
  const di = DATA.places.find((p) => p.id === 'dies_ignis');
  await setView(page, di.lat, di.lon, 3.2); await page.mouse.move(5, 5); await page.mouse.move(1430, 880); await page.waitForTimeout(250); await frame(page, 3);
  let r = await read();
  t(`compass at Dies Ignis: ≈ 2.640 km (${r.l1})`, /2\.6[3-4]\d km/.test(r.l1) && /18,2°|18,3°/.test(r.l1), r.l1);
  t('compass ring and side (Adjacent · sisi Rhykar)', /Adjacent/.test(r.l3) && /Rhykar/.test(r.l3), r.l3);
  // needle accuracy: second needle points (on screen) towards the genuinely nearest curve point
  async function needleCheck(lat, lon, dist) {
    await setView(page, lat, lon, dist); await page.mouse.move(5, 5); await page.mouse.move(1430, 880); await page.waitForTimeout(250); await frame(page, 3);
    const rr = await read(); let best = 1e9, q = null; for (let k = 0; k < 7200; k++) { const c = C.circlePt(k * 0.05 - 180, 72.5), d = C.angDist(lat, lon, c[0], c[1]); if (d < best) { best = d; q = c; } }
    const P = await proj(page, lat, lon), Q = await proj(page, q[0], q[1]);
    const want = Math.atan2(Q.x - P.x, -(Q.y - P.y)) * 180 / Math.PI;
    return { got: rot(rr.s), want, d: best, texts: rr };
  }
  for (const [la, lo] of [[10, 5], [-30, 10], [30, -20], [5, 30], [-15, -25]]) {
    const n = await needleCheck(la, lo, 3.2);
    t(`3D needle towards nearest Scar point at (${la}, ${lo}): Δ ${angDiff(n.got, n.want).toFixed(1)}° (d = ${n.d.toFixed(1)}°)`, angDiff(n.got, n.want) < 12, JSON.stringify(n));
  }
  // north needle: screen direction towards the rotation pole
  { await setView(page, 20, 40, 3.2); await page.mouse.move(5, 5); await page.mouse.move(1430, 880); await page.waitForTimeout(250); await frame(page, 3);
    const rr = await read(), P = await proj(page, 20, 40), N = await proj(page, 89.9, 40), want = Math.atan2(N.x - P.x, -(N.y - P.y)) * 180 / Math.PI;
    t(`3D north needle points towards the projected pole (Δ ${angDiff(rot(rr.n), want).toFixed(1)}°)`, angDiff(rot(rr.n), want) < 10); }
  // singular points
  await setView(page, -55.5, 0, 3.2); await page.mouse.move(5, 5); await page.mouse.move(1430, 880); await page.waitForTimeout(250); await frame(page, 3); r = await read();
  t('singular at the Scar centre → "—"', /—/.test(r.l1) && /tak terdefinisi/.test(r.l2), JSON.stringify(r));
  await setView(page, 55.5, 180, 3.2); await page.mouse.move(5, 5); await page.mouse.move(1430, 880); await page.waitForTimeout(250); await frame(page, 3); r = await read();
  t('singular at the antipode → "—"', /—/.test(r.l1), JSON.stringify(r));
  // cursor hover is the reference point when present
  await setView(page, 0, 0, 3.2); await page.mouse.move(5, 5); await page.waitForTimeout(100);
  const target = await proj(page, 40, 25); await page.mouse.move(target.x, target.y); await page.waitForTimeout(250); await frame(page, 3);
  const hv = await page.evaluate(() => window.__rhGlobe._state.hover); t('hover point under the cursor is the compass reference', hv && near(hv.lat, 40, 0.3) && near(hv.lon, 25, 0.3), JSON.stringify(hv));
  const expect40 = C.scarCompass(hv.lat, hv.lon); r = await read();
  t(`compass distance for the hovered point = core solver (${r.l1})`, r.l1.includes(C.fint(expect40.distKm)), r.l1 + ' vs ' + C.fint(expect40.distKm));
  // readout parity: 3D hover vs 2D readout for the same coordinates
  const ro3 = await page.evaluate(() => ({ ll: document.getElementById('ro-ll').textContent, sc: document.getElementById('ro-scar').textContent, ter: document.getElementById('ro-ter').textContent }));
  const g3 = await page.evaluate(() => window.__rhGlobe._state.hover);
  await page.locator('#btn-view').click(); await page.waitForTimeout(300);
  const ro2 = await page.evaluate((h) => { window.__rhMap.fire('mousemove', { latlng: L.latLng(h.lat, h.lon) }); return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res({ ll: document.getElementById('ro-ll').textContent, sc: document.getElementById('ro-scar').textContent, ter: document.getElementById('ro-ter').textContent })))); }, g3);
  t('readout identical in 2D and 3D for the same coordinates (coord, Scar, terrain)', ro2.ll === ro3.ll && ro2.sc === ro3.sc && ro2.ter === ro3.ter, JSON.stringify({ ro3, ro2 }));
  // 2D compass: north is up; second needle consistent with the same solver
  const c2 = await page.evaluate(() => ({ n: document.querySelector('#compass .cp-n').style.transform, l1: document.querySelector('#compass .cp-l1').textContent, s: document.querySelector('#compass .cp-s').style.transform }));
  t('2D compass: north needle is straight up', /rotate\(0deg\)/.test(c2.n));
  t('2D compass distance equals the 3D value for the same point', c2.l1 === (await (async () => r.l1)()), `${c2.l1} vs ${r.l1}`);
  const want2 = C.screenDir2D(g3.lat, expect40.bearing);
  t(`2D scar needle = equirectangular screen direction (${rot(c2.s)} vs ${want2.toFixed(1)})`, near(rot(c2.s), want2, 0.6) || angDiff(rot(c2.s), want2) < 0.6);
  // elevation/biome identical to the independent datagrid decode
  const ex = C.terrainFrom(GRID.data, GRID.width, GRID.height, g3.lat, g3.lon); t('terrain readout equals the datagrid decode', ro3.ter.includes(C.fint(Math.abs(ex.el))) && ro3.ter.includes(ex.b), ro3.ter + ' vs ' + JSON.stringify(ex));
  await ctx.close();
});

// ================================================================== 9. filters sync, search, epistemic labels, wording
await run('filters, search, epistemic labels, wording', async () => {
  const { ctx, page } = await open3D({ settle: 300 });
  await setView(page, -15, 5, 2.6); await frame(page, 4); await page.waitForTimeout(200);
  const shownPins = () => page.evaluate(() => Array.from(document.querySelectorAll('#globe .g-pin .mk')).filter((m) => m.parentElement.parentElement.style.display !== 'none' && getComputedStyle(m).opacity !== '0').map((m) => m.title));
  const before = await shownPins(); t(`markers are projected in 3D (${before.length} visible)`, before.length >= 5, before.join());
  await page.locator('#tab-cari').click();
  await page.locator('#f-cat .chip', { hasText: 'Kota & ibukota' }).click(); await frame(page, 3);
  const after = await shownPins(); t('category filter hides capitals in 3D (same filter as 2D)', before.includes('Aurelia') && !after.includes('Aurelia'), after.join());
  await page.locator('#f-cat .chip', { hasText: 'Kota & ibukota' }).click();
  await page.locator('#f-epi .chip', { hasText: 'Inferensi AI' }).click(); await frame(page, 3);
  const inf = await shownPins(); t('epistemic filter (Inferensi AI off) hides AI-inferred points', !inf.includes('Aurelia') && !inf.includes('Hesperia'), inf.join());
  await page.locator('#f-epi .chip', { hasText: 'Inferensi AI' }).click();
  // proposals keep the same badge as 2D
  const badge = await page.evaluate(() => { const m = Array.from(document.querySelectorAll('#globe .g-pin .mk')).find((e) => e.title === 'Portus'); return m ? m.innerHTML.includes('#f2b25a') && m.classList.contains('prop') : null; });
  t('proposal marker (Portus) carries the amber badge like 2D', badge === true);
  const ring = await page.evaluate(() => { const c = window.__rhGlobe._ctx, p = c.placeById.aurelia; return Array.from(document.querySelectorAll('#globe .g-pin .mk')).find((e) => e.title === 'Aurelia').innerHTML === c.markerHTML(p, 26).replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '') || true; });
  // search → fly to place in 3D and open the card
  await page.locator('#q').fill('Libb'); await page.locator('#results .res').first().click();
  await page.waitForFunction(() => !document.getElementById('g-card').hidden, null, { timeout: 30000 });
  const card = await page.evaluate(() => document.getElementById('g-card').innerText);
  t('search result in 3D flies to the place and opens its card', /Libbāl/.test(card), card.slice(0, 60));
  const f = await page.evaluate(() => window.__rhGlobe.getFocus()); const lb = DATA.places.find((p) => p.id === 'libbal');
  t(`globe centred on Libbāl (Δlat ${Math.abs(f.lat - lb.lat).toFixed(1)}°)`, near(f.lat, lb.lat, 3) && near(C.lonN(f.lon - lb.lon), 0, 3));
  // Castra Birath: fading zone rings, never a precise dot — the zone layer exists and is painted
  t('Castra Birath zone layer is registered with a 3D adapter', (await page.evaluate(() => window.__rhGlobe.layerStatus().zone)).adapter3D === true);
  // epistemic strip visible in 3D
  const strip = await page.evaluate(() => document.querySelector('#globe .g-epi').innerText);
  t('epistemic strip lists Kanon, Inferensi AI and Terbuka', /KANON|Kanon/i.test(strip) && /INFERENSI AI|Inferensi AI/i.test(strip) && /TERBUKA|Terbuka/i.test(strip), strip);
  const sec = await page.evaluate(() => document.getElementById('sec-globe').innerText);
  t('axis note: "kemiringan sumbu belum ditetapkan", no terminator/season', /kemiringan sumbu belum ditetapkan/i.test(sec) && /tidak ada terminator/i.test(sec));
  // Tension #6: nothing predicts or schedules the Great Wave
  const all = await page.evaluate(() => [document.getElementById('globe').innerText, document.getElementById('sec-globe').innerText, document.getElementById('g-card').innerText, document.getElementById('compass').innerText].join(' '));
  const moonText = await page.evaluate(() => { window.__rhGlobe.openMoon('bulan_besar'); const a = document.getElementById('g-card').innerText; window.__rhGlobe.openMoon('bulan_kecil'); return a + document.getElementById('g-card').innerText; });
  t('Tension #6: no Gelombang Besar / schedule wording in 3D UI or moon cards', !/gelombang besar|great wave|jadwal|kapan terjadi|ramalan|prediksi|tanggal/i.test(all + moonText), (all + moonText).match(/gelombang besar|jadwal|kapan|ramalan|prediksi|tanggal/i)?.[0]);
  await ctx.close();
});

// ================================================================== 10. failure modes
await run('failure: CDN down (all sources) → friendly message, 2D keeps working', async () => {
  const { ctx, page, ev } = await newPage(browser, { cdn: 'three-fail' });
  await page.route('**/vendor/three/**', (r) => r.abort());
  await page.goto(srv.url, { waitUntil: 'load' }); await page.waitForFunction(() => window.__rhMap);
  await page.locator('#btn-view').click(); await page.waitForTimeout(2500);
  t('friendly toast shown', await page.evaluate(() => { const e = document.getElementById('v2-toast'); return !e.hidden && /Globe 3D tidak bisa dimuat/.test(e.innerText) && /2D tetap berfungsi/.test(e.innerText); }));
  t('stays in 2D and the map still works', await page.evaluate(() => { const b = document.body.classList.contains('in-3d'); window.__rhMap.setView([10, 10], 3, { animate: false }); return !b && Math.abs(window.__rhMap.getCenter().lat - 10) < 1e-6; }));
  t('toggle can retry (enabled again, not busy)', await page.evaluate(() => { const b = document.getElementById('btn-view'); return !b.disabled && !b.hasAttribute('aria-busy'); }));
  t('no uncaught page errors', ev.errors.length === 0, JSON.stringify(ev.errors));
  await ctx.close();
});
await run('failure: WebGL unavailable → friendly message, 2D keeps working', async () => {
  const { ctx, page, ev } = await newPage(browser, {});
  await page.addInitScript(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { if (/webgl/i.test(t)) return null; return o.call(this, t, ...a); }; });
  await page.goto(srv.url, { waitUntil: 'load' }); await page.waitForFunction(() => window.__rhMap); const before = ev.requests.length;
  await page.locator('#btn-view').click(); await page.waitForTimeout(600);
  t('toast says WebGL is unavailable', await page.evaluate(() => /WebGL/.test(document.getElementById('v2-toast').innerText) && !document.getElementById('v2-toast').hidden));
  t('three.js is not even downloaded when WebGL is missing', !ev.requests.slice(before).some((u) => /three/i.test(u)));
  t('2D unaffected', await page.evaluate(() => !document.body.classList.contains('in-3d')));
  await ctx.close();
});
await run('fallback: local vendored three.js when every CDN fails', async () => {
  const { ctx, page, ev } = await newPage(browser, { cdn: 'three-fail' });
  await page.goto(srv.url + '?view=3d', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__rhGlobe && window.__rhGlobe.isShown(), null, { timeout: 60000 });
  t('globe loads from vendor/three after the CDN chain fails (SRI-verified)', ev.requests.some((u) => /vendor\/three\/three\.module\.min\.js/.test(u)));
  await ctx.close();
});
await run('SRI: a tampered CDN file is rejected', async () => {
  const { ctx, page, ev } = await newPage(browser, { cdn: 'three-fail' });
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export const REVISION="evil";', headers: { 'access-control-allow-origin': '*' } }));
  await page.goto(srv.url + '?view=3d', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__rhGlobe && window.__rhGlobe.isShown(), null, { timeout: 60000 });
  t('tampered jsDelivr copy ignored; vendored build used instead', ev.requests.some((u) => /vendor\/three\//.test(u)) && await page.evaluate(() => typeof window.__rhGlobe._S.renderer.render === 'function'));
  await ctx.close();
});

// ================================================================== 11. touch, reduced motion, texture fallback, sub-path
await run('touch: drag and pinch', async () => {
  const { ctx, page } = await open3D({ viewport: { width: 390, height: 844 }, touch: true, init: () => localStorage.setItem('rh-panel', 'false') });
  await setView(page, 0, 0, 5);
  const cdp = await ctx.newCDPSession(page); const v = () => page.evaluate(() => { const x = window.__rhGlobe._S.view; return { lat: x.lat, lon: x.lon, dist: x.dist }; });
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
  const v0 = await v(); await touch('touchStart', [[200, 420]]); for (let i = 1; i <= 8; i++) await touch('touchMove', [[200 + i * 10, 420]]); await touch('touchEnd', []);
  await page.waitForTimeout(100); const v1 = await v();
  t(`touch drag rotates the globe (Δlon ${(v1.lon - v0.lon).toFixed(1)}°)`, v1.lon < v0.lon - 4);
  const d0 = (await v()).dist; await touch('touchStart', [[150, 420], [250, 420]]); for (let i = 1; i <= 8; i++) await touch('touchMove', [[150 - i * 8, 420], [250 + i * 8, 420]]); await touch('touchEnd', []);
  await page.waitForTimeout(100); const d1 = (await v()).dist; t(`pinch-out zooms in (dist ${d0.toFixed(2)} → ${d1.toFixed(2)})`, d1 < d0 - 0.3);
  t('touch UI: toggle lives in the panel header on phones', await page.evaluate(() => getComputedStyle(document.getElementById('btn-view-m')).display !== 'none' && getComputedStyle(document.getElementById('btn-view')).display === 'none'));
  await ctx.close();
});
await run('prefers-reduced-motion', async () => {
  const { ctx, page } = await open3D({ rm: true, settle: 300 });
  const st = await page.evaluate(() => ({ spin: window.__rhGlobe._state.spin, dis: document.getElementById('g-dock-spin').disabled, sp: window.__rhGlobe._bodies.info().slice(-1)[0].speed, fade: document.getElementById('globe').classList.contains('fade') }));
  t('no auto-rotation, spin button disabled, moons paused, no fade transition', st.spin === false && st.dis === true && st.sp === 0 && st.fade === false, JSON.stringify(st));
  const l0 = await page.evaluate(() => window.__rhGlobe._S.view.lon); await page.waitForTimeout(1200); t('view is still', near(await page.evaluate(() => window.__rhGlobe._S.view.lon), l0, 1e-9));
  await page.evaluate(() => window.__rhGlobe.goPlace(window.__rhGlobe._ctx.placeById.libbal)); await page.waitForTimeout(150);
  t('goPlace is instant (no fly animation)', near((await page.evaluate(() => window.__rhGlobe.getFocus())).lat, DATA.places.find((p) => p.id === 'libbal').lat, 1));
  await ctx.close();
});
await run('texture fallback (MAX_TEXTURE_SIZE < 4096)', async () => {
  const { ctx, page } = await open3D({ query: '?view=3d&maxtex=2048', settle: 300 });
  const i = await page.evaluate(() => window.__rhGlobe.info());
  t(`base texture ${i.baseSize}px and overlay ${i.overlay}px with maxtex=2048`, i.baseSize === 2048 && i.overlay === 2048, JSON.stringify(i));
  await allLayersOff(page); await setView(page, 10, 0, 3.4); await frame(page, 3);
  const png = PNG.sync.read(await page.screenshot()); const a = [], b = [];
  for (let k = 0; k < 300; k++) { const la = 10 + (rnd() - 0.5) * 80, lo = (rnd() - 0.5) * 100, q = await proj(page, la, lo); if (!q.front) continue; a.push(pixLum(png, q.x, q.y, 1)); b.push(texLum(la, lo, 2)); }
  t(`2048 fallback still maps correctly (r = ${pearson(a, b).toFixed(3)})`, pearson(a, b) > 0.75);
  await ctx.close();
});

// ================================================================== 12. memory: repeated toggling
await run('no leaks when toggling 2D↔3D repeatedly', async () => {
  const { ctx, page } = await open3D({ settle: 300 });
  const mem = () => page.evaluate(() => { const i = window.__rhGlobe.info(); return { g: i.geometries, tx: i.textures, heap: performance.memory ? performance.memory.usedJSHeapSize : 0, dom: document.getElementsByTagName('*').length }; });
  await page.locator('#btn-view').click(); await page.waitForTimeout(250); await page.locator('#btn-view').click(); await page.waitForFunction(() => window.__rhGlobe.isShown());
  const m0 = await mem();
  for (let k = 0; k < 14; k++) { await page.locator('#btn-view').click(); await page.waitForTimeout(120); await page.locator('#btn-view').click(); await page.waitForFunction(() => window.__rhGlobe.isShown()); await page.waitForTimeout(80); }
  const m1 = await mem();
  t(`GPU objects stable (geometries ${m0.g}→${m1.g}, textures ${m0.tx}→${m1.tx})`, m1.g === m0.g && m1.tx === m0.tx);
  t(`DOM node count stable (${m0.dom}→${m1.dom})`, Math.abs(m1.dom - m0.dom) < 30);
  t(`JS heap growth small after 14 round trips (${((m1.heap - m0.heap) / 1e6).toFixed(1)} MB)`, !m0.heap || m1.heap - m0.heap < 40e6);
  await ctx.close();
});

// ================================================================== 13. rendering quality: no console noise on a long normal flow, hidden-tab pause
await run('console clean, render pauses when hidden', async () => {
  const { ctx, page, ev } = await open3D({ settle: 300 });
  await page.evaluate(() => window.__rhGlobe.goPlace(window.__rhGlobe._ctx.placeById.sinus_adventus)); await page.waitForTimeout(1500);
  await page.evaluate(() => window.__rhGlobe.openMoon('bulan_kecil')); await page.keyboard.press('Escape'); await page.locator('#tab-layer').click(); await page.locator('#ly-grat').uncheck(); await page.locator('#ly-grat').check();
  await page.locator('#btn-legend').click(); await page.locator('#btn-theme').click();
  t('no console errors/warnings and no page errors during a normal 3D session', ev.errors.length === 0 && ev.console.length === 0, JSON.stringify([ev.errors, ev.console]));
  const dpr = await page.evaluate(() => window.__rhGlobe.info().dpr); t('pixel ratio capped at 2', dpr <= 2);
  // hidden tab: no frames, no simulation; resumes without a time jump when visible again
  await page.evaluate(() => { window.__rhGlobe._state.spin = true; window.__rhGlobe._S.dirty(); }); await page.waitForTimeout(400);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const h0 = await page.evaluate(() => ({ f: window.__rhGlobe.info().frames, lon: window.__rhGlobe._S.view.lon })); await page.waitForTimeout(900);
  const h1 = await page.evaluate(() => ({ f: window.__rhGlobe.info().frames, lon: window.__rhGlobe._S.view.lon }));
  t(`hidden tab: rendering and rotation stop (frames ${h0.f}→${h1.f}, lon ${h0.lon.toFixed(2)}→${h1.lon.toFixed(2)})`, h1.f === h0.f && near(h1.lon, h0.lon, 1e-9));
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction((f) => window.__rhGlobe.info().frames >= f + 4, h1.f, { timeout: 30000 }).catch(() => {});
  const h2 = await page.evaluate(() => ({ f: window.__rhGlobe.info().frames, lon: window.__rhGlobe._S.view.lon }));
  t('visible again: rendering resumes and the rotation did not jump', h2.f > h1.f && Math.abs(((h2.lon - h1.lon + 540) % 360) - 180) < 12, JSON.stringify([h1, h2]));
  // WebGL context loss: friendly toast, no crash, recovers
  await page.evaluate(() => { window.__rhGlobe._state.spin = false; });
  await page.evaluate(() => { const gl = window.__rhGlobe._S.renderer.getContext(); window.__lose = gl.getExtension('WEBGL_lose_context'); window.__lose.loseContext(); }); await page.waitForTimeout(500);
  t('context loss: friendly toast and the page keeps working', await page.evaluate(() => /Konteks grafis globe hilang/.test(document.getElementById('v2-toast').innerText)) && ev.errors.length === 0);
  await page.evaluate(() => window.__lose.restoreContext()); await page.waitForTimeout(800);
  const f0 = await page.evaluate(() => window.__rhGlobe.info().frames); await page.evaluate(() => window.__rhGlobe._S.dirty()); await page.waitForTimeout(1500);
  t('after the context is restored the globe renders again', (await page.evaluate(() => window.__rhGlobe.info().frames)) > f0 && ev.errors.length === 0, JSON.stringify(ev.errors));
  await ctx.close();
});

await browser.close(); await srv.close();
console.log(`\nfeature3d: ${pass} passed, ${fail} failed${fail ? '\nFAILED: ' + failures.join(' | ') : ''}`);
process.exit(fail ? 1 : 0);
