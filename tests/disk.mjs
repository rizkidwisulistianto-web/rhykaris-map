// Tests for the dual-disk Lambert working map (Stage 2, optional): lazy loading without three.js/WebGL, projection on screen, overlay,
// markers/filters/cards, readout parity, compass, layer panel, orientation, mobile, memory.   node disk.mjs
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { startServer, ROOT } from './lib/server.mjs';
import { launch, newPage } from './lib/browser.mjs';
import { loadRH, readJSON } from './lib/load.mjs';

const RH = loadRH(), C = RH.core, K = RH.disk.math;
const DATA = readJSON('data/data.json'); C.configure(DATA.stats, DATA.thresholds);
const BASE = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'assets/base_4096.png')));
const GRID = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'assets/datagrid.png')));
const P = Object.fromEntries(DATA.places.map((p) => [p.id, p]));
const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
function texLum(lat, lon, r = 2) { let s = 0, n = 0, x0 = Math.floor((C.lonN(lon) + 180) / 360 * BASE.width), y0 = Math.floor((90 - lat) / 180 * BASE.height); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = (x0 + dx + BASE.width) % BASE.width, y = Math.min(BASE.height - 1, Math.max(0, y0 + dy)); s += lum(BASE.data, (y * BASE.width + x) * 4); n++; } return s / n; }
function pixLum(png, x, y, r = 1) { let s = 0, n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = Math.round(x) + dx, yy = Math.round(y) + dy; if (xx < 0 || yy < 0 || xx >= png.width || yy >= png.height) continue; s += lum(png.data, (yy * png.width + xx) * 4); n++; } return s / n; }
function pearson(a, b) { const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb); }
let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
let pass = 0, fail = 0; const failures = [];
const t = (name, ok, detail = '') => { if (ok) pass++; else { fail++; failures.push(name); console.log(`FAIL  ${name} ${detail}`); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const srv = await startServer(), browser = await launch();
async function openDisk(o = {}) {
  const { ctx, page, ev } = await newPage(browser, { viewport: o.viewport || { width: 1440, height: 900 }, hasTouch: !!o.touch, isMobile: !!o.touch, cdn: o.cdn, reducedMotion: o.rm ? 'reduce' : 'no-preference' });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  if (o.init) await page.addInitScript(o.init);
  await page.goto(srv.url + (o.query === undefined ? '?view=disk' : o.query), { waitUntil: 'load' });
  if (!o.noWait) await page.waitForFunction(() => window.__rhDisk && window.__rhDisk.isShown() && window.__rhDisk.info().sheet, null, { timeout: 60000 });
  await page.waitForTimeout(o.settle == null ? 400 : o.settle);
  return { ctx, page, ev };
}
const proj = (page, la, lo) => page.evaluate(([a, b]) => window.__rhDisk._project(a, b), [la, lo]);
const frame = (page, n = 3) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
async function run(name, fn) { const t0 = Date.now(); try { await fn(); } catch (e) { fail++; failures.push(name); console.log(`FAIL  ${name} — exception: ${e && e.stack || e}`); } console.log(`  ·${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }

await run('open, lazy loading, no three.js, no WebGL needed', async () => {
  const { ctx, page, ev } = await openDisk({ query: '', noWait: true, settle: 600 });
  t('flat map is still the default', await page.evaluate(() => !document.body.classList.contains('in-disk') && document.getElementById('disk') === null && typeof RH.disk === 'undefined'));
  const b = page.locator('#btn-disk'); t('button with aria-pressed=false and an accessible name', (await b.getAttribute('aria-pressed')) === 'false' && /Peta kerja/.test(await b.getAttribute('aria-label')));
  await b.focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__rhDisk && window.__rhDisk.isShown() && window.__rhDisk.info().sheet, null, { timeout: 60000 });
  t('keyboard activation opens the working map; aria-pressed true; remembered', (await b.getAttribute('aria-pressed')) === 'true' && (await page.evaluate(() => localStorage.getItem('rh-view'))) === '"disk"');
  t('the working map did NOT request three.js', !ev.requests.some((u) => /three/i.test(u)), ev.requests.filter((u) => /three/i.test(u)).join());
  t('2D map panes hidden, Globe tab not shown, scale bar hidden', await page.evaluate(() => getComputedStyle(document.querySelector('.leaflet-map-pane')).visibility === 'hidden' && document.getElementById('tab-globe').hidden && getComputedStyle(document.getElementById('scale')).display === 'none'));
  await b.click(); await page.waitForTimeout(300);
  t('back to 2D: pressed false, map visible, remembered', await page.evaluate(() => !document.body.classList.contains('in-disk') && localStorage.getItem('rh-view') === '"2d"' && getComputedStyle(document.querySelector('.leaflet-map-pane')).visibility !== 'hidden'));
  t('no console errors or warnings', ev.errors.length === 0 && ev.console.length === 0, JSON.stringify([ev.errors, ev.console]));
  await ctx.close();
  // works with three.js blocked everywhere and with WebGL switched off entirely
  const r = await openDisk({ cdn: 'three-fail', init: () => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (ty, ...a) { if (/webgl/i.test(ty)) return null; return o.call(this, ty, ...a); }; } });
  t('works with WebGL disabled and every three.js source blocked (Canvas 2D only)', await r.page.evaluate(() => window.__rhDisk.isShown() && !!window.__rhDisk.info().sheet));
  t('…and the 3D button still reports a friendly message instead of crashing', await (async () => { await r.page.locator('#btn-view').click(); await r.page.waitForTimeout(400); return r.page.evaluate(() => /WebGL/.test(document.getElementById('v2-toast').innerText) && document.body.classList.contains('in-disk')); })());
  await r.ctx.close();
});

await run('projection on screen: areas, reprojected pixels, Scar circle, landmarks', async () => {
  const { ctx, page } = await openDisk();
  const info = await page.evaluate(() => window.__rhDisk.info());
  const share = info.sheet.counts.R / (info.sheet.counts.R + info.sheet.counts.A) * 100;
  t(`landscape layout chosen for a wide window (${info.orient}); reprojected in ${info.sheet.ms} ms`, info.orient === 'h');
  t(`pixel areas of the two disks: ${share.toFixed(3)} % : ${(100 - share).toFixed(3)} % (canon 34,964 : 65,036)`, near(share, 34.964, 0.06));
  // pixel check: rendered screenshot vs canon texture (disable overlays so only the reprojected map shows)
  await page.evaluate(() => { const c = window.__rhDisk._ctx; Object.keys(c.LAYERS).forEach((k) => c.setLayer(k, false)); }); await frame(page, 3);
  const png = PNG.sync.read(await page.screenshot()); const a = [], b = [], cShift = []; let tries = 0;
  while (a.length < 500 && tries++ < 4000) { const x = 380 + rnd() * 1040, y = 100 + rnd() * 640, u = await page.evaluate(([px, py]) => window.__rhDisk._unproject(px, py), [x, y]); if (!u || Math.abs(u.lat) > 75 || u.theta > 72.5 && u.theta < 74 || (u.disk === 'A' && u.theta < 72.5 + 0.1)) continue;
    const inRim = u.disk === 'R' ? u.theta <= 72.5 : 180 - u.theta <= 107.5; if (!inRim) continue; a.push(pixLum(png, x, y, 1)); b.push(texLum(u.lat, u.lon, 2)); cShift.push(texLum(u.lat, u.lon + 90, 2)); }
  const r = pearson(a, b), rc = pearson(a, cShift); t(`screen pixels match the canon texture at the inverse-projected coordinates (r = ${r.toFixed(3)}, n = ${a.length}; shifted control ${rc.toFixed(3)})`, r > 0.9 && rc < r - 0.2);
  await page.evaluate(() => { const c = window.__rhDisk._ctx; ['curve', 'band', 'markers'].forEach((k) => c.setLayer(k, true)); }); await frame(page, 3);
  // Scar rim: orange pixels all around both circles
  const shot = PNG.sync.read(await page.screenshot()); const S = await page.evaluate(() => { const d = window.__rhDisk, i = d.info(), st = d._state; return { scale: i.scale, L: i.layout, cx: st.cx, cy: st.cy, W: i.W, H: i.H }; });
  const ins = await page.evaluate(() => window.__rhDisk._ctx.insets());
  const scr = (x, y) => ({ x: ins.l + (S.W - ins.l) / 2 + (x - S.cx) * S.scale, y: 64 + (S.H - (ins.b || 0) - 64) / 2 + (y - S.cy) * S.scale });
  let okR = 0, okA = 0, nR = 0, nA = 0;
  for (let al = 0; al < 360; al += 5) for (const [disk, rho, d, ctr] of [['R', K.rho(72.5), S.L.R, 'R'], ['A', K.rho(107.5), S.L.A, 'A']]) {
    const xy = K.diskXY(disk, disk === 'R' ? 72.5 : 72.5, al, 'h'), p = scr(d.cx + xy.x, d.cy + xy.y), i = (Math.round(p.y) * shot.width + Math.round(p.x)) * 4;
    if (p.x < 380 || p.x > 1430 || p.y < 70 || p.y > 880) continue; const orange = shot.data[i] > 170 && shot.data[i] > shot.data[i + 2] + 60; if (disk === 'R') { nR++; okR += orange ? 1 : 0; } else { nA++; okA += orange ? 1 : 0; }
  }
  t(`the Scar is drawn as a circle on the Rhykar disk (${okR}/${nR} sampled rim pixels orange)`, nR > 40 && okR / nR > 0.85); t(`…and on the Aëris disk (${okA}/${nA})`, nA > 40 && okA / nA > 0.85);
  // landmarks
  const lp = await proj(page, P.libbal.lat, P.libbal.lon), ct = await page.evaluate(() => { const d = window.__rhDisk, i = d.info(), L = i.layout, f = (x, y) => ({ x, y }); return L.A; });
  t('Libbāl projects onto the Aëris disk only, at its centre', lp.length === 1 && lp[0].disk === 'A');
  for (const id of ['litus_primum', 'dies_ignis']) { const q = await proj(page, P[id].lat, P[id].lon); t(`${P[id].name} lands on the Rhykar disk only`, q.length === 1 && q[0].disk === 'R'); }
  // east-slope points face each other (same screen row, Rhykar right rim ↔ Aëris left rim)
  const e = K.fromPolar(72.5, 90), ep = await proj(page, e[0], e[1]); const R_ = ep.find((q) => q.disk === 'R'), A_ = ep.find((q) => q.disk === 'A');
  t(`east-slope (α = +90°) points face each other across the gap (Δy = ${Math.abs(R_.y - A_.y).toFixed(2)} px, Rhykar x ${R_.x.toFixed(0)} < Aëris x ${A_.x.toFixed(0)})`, near(R_.y, A_.y, 0.01) && R_.x < A_.x);
  await ctx.close();
});

await run('markers, badges, filters, cards, search', async () => {
  const { ctx, page } = await openDisk();
  const shownPins = () => page.evaluate(() => Array.from(document.querySelectorAll('#disk .g-pin .mk')).filter((m) => m.parentElement.parentElement.style.display !== 'none').map((m) => m.title));
  const all = await shownPins(); t(`22 point markers shown on the disks (${all.length})`, all.length === 22, all.join());
  t('proposal badge (Portus) and status rings use the same markup as 2D', await page.evaluate(() => { const m = Array.from(document.querySelectorAll('#disk .g-pin .mk')).find((e) => e.title === 'Portus'); return !!m && m.classList.contains('prop') && m.innerHTML.includes('#f2b25a'); }));
  t('Castra Birath is drawn as a fading zone (layer registered) and as the open-status marker, not as a precise dot', (await page.evaluate(() => window.__rhDisk.layerStatus().zone.adapterDisk)) === true && await page.evaluate(() => Array.from(document.querySelectorAll('#disk .g-pin .mk')).some((e) => e.title === 'Castra Birath' && e.innerHTML.includes('#ff7a45'))));
  // click a marker (projected position) opens the same card as 2D
  const q = (await proj(page, P.aurelia.lat, P.aurelia.lon))[0]; await page.mouse.click(q.x, q.y); await page.waitForTimeout(200);
  const card = await page.evaluate(() => document.getElementById('g-card').innerText);
  t('clicking the Aurelia marker opens its place card (chip, Scar line, copy action)', /Aurelia/.test(card) && /INFERENSI AI|Inferensi AI/i.test(card) && /dari kurva/.test(card) && /Salin koordinat/.test(card), card.slice(0, 80));
  await page.keyboard.press('Escape'); t('Esc closes the card', await page.evaluate(() => document.getElementById('g-card').hidden));
  // filters
  await page.locator('#tab-cari').click(); await page.locator('#f-cat .chip', { hasText: 'Kota & ibukota' }).click(); await frame(page, 3);
  const f1 = await shownPins(); t('category filter hides capitals in the working map too', !f1.includes('Aurelia') && all.includes('Aurelia'));
  await page.locator('#f-cat .chip', { hasText: 'Kota & ibukota' }).click(); await page.locator('#f-epi .chip', { hasText: 'Terbuka' }).click(); await frame(page, 3);
  const f2 = await shownPins(); t('epistemic filter (Terbuka off) hides Castra Birath', !f2.includes('Castra Birath') && all.includes('Castra Birath'));
  await page.locator('#f-epi .chip', { hasText: 'Terbuka' }).click();
  // search → pan/zoom to the place and open the card
  await page.locator('#q').fill('Libb'); await page.locator('#results .res').first().click(); await page.waitForTimeout(700);
  t('search result pans to Libbāl and opens its card', /Libbāl/.test(await page.evaluate(() => document.getElementById('g-card').innerText)) && (await page.evaluate(() => window.__rhDisk.info().scale / window.__rhDisk.info().fit)) > 1.5);
  await ctx.close();
});

await run('hover readout parity, compass', async () => {
  const { ctx, page } = await openDisk();
  await page.evaluate(() => { const c = window.__rhDisk._ctx; ['markers', 'anom'].forEach((k) => c.setLayer(k, false)); });
  const read = () => page.evaluate(() => ({ ll: document.getElementById('ro-ll').textContent, sc: document.getElementById('ro-scar').textContent, ter: document.getElementById('ro-ter').textContent, l1: document.querySelector('#compass .cp-l1').textContent, l2: document.querySelector('#compass .cp-l2').textContent, l3: document.querySelector('#compass .cp-l3').textContent, n: document.querySelector('#compass .cp-n').style.transform, s: document.querySelector('#compass .cp-s').style.transform }));
  const rot = (s) => { const m = /rotate\((-?[\d.]+)deg\)/.exec(s); return m ? +m[1] : null; };
  // hover at Libbāl (disk centre): the readout is the same function as 2D
  const lp = (await proj(page, P.libbal.lat, P.libbal.lon))[0]; await page.mouse.move(5, 5); await page.mouse.move(lp.x, lp.y); await page.waitForTimeout(250);
  let r = await read(); const hv = await page.evaluate(() => window.__rhDisk._state.hover);
  t(`hovering the Aëris centre reads Libbāl's coordinates (${r.ll})`, near(hv.lat, 55.5, 0.1) && near(C.lonN(hv.lon), 180, 0.1) && /55,5\d° LU/.test(r.ll));
  const ex = C.terrainFrom(GRID.data, GRID.width, GRID.height, hv.lat, hv.lon); t('terrain readout equals the datagrid decode (elevation + biome)', r.ter.includes(C.fint(Math.abs(ex.el))) && r.ter.includes(ex.b), r.ter + ' vs ' + JSON.stringify(ex));
  // Libbāl is at the Scar centre's antipode → distance = 107.5° from the curve, side Aëris, Unaffected
  t('Libbāl: compass ≈ 15.540 km (107,5°), Unaffected, side Aëris', /15\.5[34]\d km/.test(r.l1) && /Unaffected/.test(r.l3) && /Aëris/.test(r.l3), JSON.stringify(r));
  // needle checks in both disks: second needle points radially OUTWARD to the rim (nearest Scar point), north needle matches the projected north step
  async function needle(lat, lon) {
    const pr = (await proj(page, lat, lon))[0]; await page.mouse.move(5, 5); await page.mouse.move(pr.x, pr.y); await page.waitForTimeout(250); await frame(page, 2);
    const rr = await read(), cen = await page.evaluate((d) => { const l = window.__rhDisk.info().layout, c = d === 'R' ? l.R : l.A; return window.__rhDisk._project(d === 'R' ? -55.5 : 55.5, d === 'R' ? 0 : 180).find((q) => q.disk === d); }, pr.disk);
    const radial = Math.atan2(pr.x - cen.x, -(pr.y - cen.y)) * 180 / Math.PI, brgNorth = await page.evaluate(([la, lo]) => { const d = window.__rhDisk, q = RH.core.destination(la, lo, 0, 0.5), a = d._project(la, lo)[0], b = d._project(q[0], q[1]).find((x) => x.disk === a.disk); return Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI; }, [lat, lon]);
    return { got: rot(rr.s), radial, northGot: rot(rr.n), northWant: brgNorth, rr };
  }
  for (const [la, lo] of [[-20, 25], [-40, -30], [10, 60], [30, 170], [70, -150], [-60, 120]]) {
    const n = await needle(la, lo), sc = C.scarCompass(la, lo), inside = sc.d < 0;
    if (sc.singular) continue;
    // inside Rhykar the nearest curve point is OUTWARD (away from centre); in the Aëris disk the nearest curve point is also outward to the rim
    t(`(${la}°, ${lo}°): scar needle radial outward (Δ ${angDiff(n.got, n.radial).toFixed(1)}°), north needle = projected north (Δ ${angDiff(n.northGot, n.northWant).toFixed(1)}°)`, angDiff(n.got, n.radial) < 3 && angDiff(n.northGot, n.northWant) < 3, JSON.stringify(n));
  }
  // singular points
  // (a pixel is never exactly the centre, so feed the exact coordinates to the same widget the view uses)
  for (const [la, lo, nm] of [[-55.5, 0, 'the Scar centre (Rhykar disk centre)'], [55.5, 180, 'the antipode (Aëris disk centre)']]) {
    r = await page.evaluate(([a, b]) => { const w = window.__rhDisk._ctx.compass; w.update({ lat: a, lon: b, northDeg: 0, scarDeg: 0, source: 'uji' }); return { l1: document.querySelector('#compass .cp-l1').textContent, l2: document.querySelector('#compass .cp-l2').textContent, so: document.querySelector('#compass .cp-s').style.opacity }; }, [la, lo]);
    t(`compass is singular at ${nm}: "—", direction undefined, second needle hidden`, /—/.test(r.l1) && /tak terdefinisi/.test(r.l2) && r.so === '0', JSON.stringify(r));
  }
  // readout identical to 2D for the same coordinates
  const g3 = { lat: 12.34, lon: -77.7 }; const q = (await proj(page, g3.lat, g3.lon))[0]; await page.mouse.move(5, 5); await page.mouse.move(q.x, q.y); await page.waitForTimeout(250);
  const hv2 = await page.evaluate(() => window.__rhDisk._state.hover), r3 = await read();
  await page.locator('#btn-disk').click(); await page.waitForTimeout(300);
  const r2 = await page.evaluate((h) => { window.__rhMap.fire('mousemove', { latlng: L.latLng(h.lat, h.lon) }); return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res({ ll: document.getElementById('ro-ll').textContent, sc: document.getElementById('ro-scar').textContent, ter: document.getElementById('ro-ter').textContent })))); }, hv2);
  t('readout identical in 2D and the working map for the same coordinates', r2.ll === r3.ll && r2.sc === r3.sc && r2.ter === r3.ter, JSON.stringify({ r3, r2 }));
  await ctx.close();
});

await run('layer panel, rings, pan/zoom, orientation, focus', async () => {
  const { ctx, page } = await openDisk();
  await page.locator('#tab-layer').click();
  const st = await page.evaluate(() => window.__rhDisk.layerStatus());
  const supported = Object.keys(st).filter((k) => st[k].adapterDisk), missing = Object.keys(st).filter((k) => !st[k].adapterDisk);
  const FLAT = Object.keys(st).filter((k) => !/^g_/.test(k)), SIDE = ['g_moons', 'g_orbits', 'g_axis', 'g_ecl'];
  t(`every flat-map layer has a working-map adapter (${supported.length}): ${supported.join(', ')}`, FLAT.every((k) => supported.includes(k)) && ['cland', 'csea', 'labels', 'regions', 'banks', 'mandala', 't_hes', 't_hesb', 't_sat', 't_foe', 't_int', 't_ana', 't_elv', 't_lain', 'r_historic', 'r_land', 'r_story', 'r_sea', 'fronts', 'd_rings', 'd_azi'].every((k) => supported.includes(k)), missing.join());
  t('only the four 3D-only layers (moons, orbits, axis, ecliptic) lack a disk adapter', missing.length === 4 && SIDE.every((k) => missing.includes(k)), missing.join());
  const dis = await page.evaluate(() => Array.from(document.querySelectorAll('#sec-layer input[type=checkbox]')).filter((i) => i.disabled).map((i) => i.id.replace('ly-', '')));
  t('no layer checkbox is disabled or marked "tak ada di peta kerja" on the working map', dis.length === 0 && (await page.evaluate(() => !/tak ada di peta kerja/i.test(document.getElementById('sec-layer').innerText))), dis.join());
  t('disk-only group visible, 3D-only group hidden', await page.evaluate(() => !document.querySelector('#sec-layer [data-onlydisk]').hidden && document.querySelector('#sec-layer [data-only3d]').hidden));
  // rings toggle changes the picture
  const shot = async () => PNG.sync.read(await page.screenshot());
  await page.evaluate(() => window.__rhDisk._ctx.setLayer('markers', false)); await frame(page, 3);
  const a = await shot(); await page.locator('#ly-d_rings').uncheck(); await frame(page, 3); const b = await shot(); let diff = 0; for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1]) diff++;
  t(`toggling the proximity rings repaints the map (${diff} px changed)`, diff > 800); await page.locator('#ly-d_rings').check();
  // pan and zoom
  const i0 = await page.evaluate(() => window.__rhDisk.info()); await page.mouse.move(900, 450); await page.mouse.wheel(0, -500); await page.waitForTimeout(150);
  const i1 = await page.evaluate(() => window.__rhDisk.info()); t('wheel zooms in about the cursor', i1.scale > i0.scale * 1.3);
  await page.mouse.move(900, 450); await page.mouse.down(); await page.mouse.move(800, 400, { steps: 6 }); await page.mouse.up(); const i2 = await page.evaluate(() => window.__rhDisk.info()); t('dragging pans the map', Math.abs(i2.cx - i1.cx) > 0.1 && Math.abs(i2.cy - i1.cy) > 0.05);
  await page.locator('canvas.d-canvas').focus(); await page.keyboard.press('0'); const i3 = await page.evaluate(() => window.__rhDisk.info()); t('key 0 / "Pas layar" refits both disks', near(i3.scale, i3.fit, 1e-6) && near(i3.cx, 0, 1e-9));
  await page.locator('#d-r').click(); const iR = await page.evaluate(() => window.__rhDisk.info()); t('"Rhykar" focuses the Rhykar disk', near(iR.cx, iR.layout.R.cx, 1e-9) && iR.scale > iR.fit);
  await page.locator('#d-a').click(); const iA = await page.evaluate(() => window.__rhDisk.info()); t('"Aëris" focuses the Aëris disk', near(iA.cx, iA.layout.A.cx, 1e-9));
  // orientation switch: portrait stacks Rhykar over Aëris, east-slope points still face each other
  await page.locator('#d-or').click(); await page.waitForFunction(() => window.__rhDisk.info().orient === 'h' && window.__rhDisk.info().sheet); await page.locator('#d-or').click(); await page.waitForFunction(() => window.__rhDisk.info().orient === 'v' && window.__rhDisk.info().sheet, null, { timeout: 30000 });
  const e = K.fromPolar(72.5, 90), ep = await proj(page, e[0], e[1]), R_ = ep.find((q) => q.disk === 'R'), A_ = ep.find((q) => q.disk === 'A');
  t(`portrait orientation: Rhykar above Aëris, east-slope points face each other vertically (Δx = ${Math.abs(R_.x - A_.x).toFixed(2)} px)`, R_.y < A_.y && near(R_.x, A_.x, 0.01));
  await page.locator('#d-or').click(); await page.waitForFunction(() => window.__rhDisk.info().orient === 'h');
  await ctx.close();
  // focus preservation: zoomed 2D view → disk → back to 2D lands near the same place
  const r = await openDisk({ query: '', noWait: true, settle: 400 });
  await r.page.evaluate(() => { window.__rhMap.setView([-2.3, 0], 5, { animate: false }); }); await r.page.waitForTimeout(300);
  const before = await r.page.evaluate(() => { const ins = window.__rhMap.getSize(), l = document.getElementById('panel').getBoundingClientRect(); const c = window.__rhMap.containerPointToLatLng([l.right + 8 + (ins.x - l.right - 8) / 2, ins.y / 2]); return { lat: c.lat, lon: c.lng }; });
  await r.page.locator('#btn-disk').click(); await r.page.waitForFunction(() => window.__rhDisk && window.__rhDisk.isShown() && window.__rhDisk.info().sheet, null, { timeout: 60000 });
  const mid = await r.page.evaluate(() => window.__rhDisk.getFocus());
  t(`2D (zoomed, Sinus Adventus) → working map keeps the focus (Δlat ${Math.abs(mid.lat - before.lat).toFixed(2)}°, Δlon ${Math.abs(mid.lon - before.lon).toFixed(2)}°)`, near(mid.lat, before.lat, 1.5) && near(C.lonN(mid.lon - before.lon), 0, 1.5));
  await r.page.locator('#btn-disk').click(); await r.page.waitForTimeout(400);
  const after = await r.page.evaluate(() => { const ins = window.__rhMap.getSize(), l = document.getElementById('panel').getBoundingClientRect(); const c = window.__rhMap.containerPointToLatLng([l.right + 8 + (ins.x - l.right - 8) / 2, ins.y / 2]); return { lat: c.lat, lon: c.lng }; });
  t(`…and back to 2D at the same place (Δlat ${Math.abs(after.lat - before.lat).toFixed(2)}°)`, near(after.lat, before.lat, 2) && near(C.lonN(after.lon - before.lon), 0, 2));
  await r.ctx.close();
});

await run('mobile (390×844, touch)', async () => {
  const { ctx, page, ev } = await openDisk({ viewport: { width: 390, height: 844 }, touch: true, init: () => localStorage.setItem('rh-panel', 'false') });
  const info = await page.evaluate(() => window.__rhDisk.info());
  t('portrait phone → vertical arrangement (Rhykar above Aëris) chosen automatically', info.orient === 'v', info.orient);
  t('toggle lives in the panel header on phones and says pressed', await page.evaluate(() => getComputedStyle(document.getElementById('btn-disk-m')).display !== 'none' && getComputedStyle(document.getElementById('btn-disk')).display === 'none' && document.getElementById('btn-disk-m').getAttribute('aria-pressed') === 'true'));
  const cdp = await ctx.newCDPSession(page); const touch = (ty, pts) => cdp.send('Input.dispatchTouchEvent', { type: ty, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
  const s0 = await page.evaluate(() => window.__rhDisk.info());
  await touch('touchStart', [[150, 400], [250, 400]]); for (let i = 1; i <= 8; i++) await touch('touchMove', [[150 - i * 8, 400], [250 + i * 8, 400]]); await touch('touchEnd', []); await page.waitForTimeout(150);
  const s1 = await page.evaluate(() => window.__rhDisk.info()); t(`pinch zooms in (scale ${s0.scale.toFixed(0)} → ${s1.scale.toFixed(0)})`, s1.scale > s0.scale * 1.3);
  await touch('touchStart', [[200, 300]]); for (let i = 1; i <= 8; i++) await touch('touchMove', [[200 - i * 8, 300 - i * 4]]); await touch('touchEnd', []); await page.waitForTimeout(150);
  const s2 = await page.evaluate(() => window.__rhDisk.info()); t('touch drag pans', Math.abs(s2.cx - s1.cx) > 0.05 || Math.abs(s2.cy - s1.cy) > 0.05);
  t('no console errors', ev.errors.length === 0 && ev.console.length === 0, JSON.stringify([ev.errors, ev.console]));
  await ctx.close();
});

await run('light theme, reduced motion, memory', async () => {
  const { ctx, page } = await openDisk({ rm: true });
  t('opens instantly with prefers-reduced-motion (no fade class)', await page.evaluate(() => !document.getElementById('disk').classList.contains('fade')));
  const mem = () => page.evaluate(() => ({ dom: document.getElementsByTagName('*').length, cv: document.getElementsByTagName('canvas').length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }));
  await page.locator('#btn-disk').click(); await page.waitForTimeout(200); await page.locator('#btn-disk').click(); await page.waitForFunction(() => window.__rhDisk.isShown());
  const m0 = await mem(); for (let k = 0; k < 12; k++) { await page.locator('#btn-disk').click(); await page.waitForTimeout(80); await page.locator('#btn-disk').click(); await page.waitForFunction(() => window.__rhDisk.isShown()); }
  const m1 = await mem(); t(`DOM and canvas counts stable after 12 round trips (${m0.dom}→${m1.dom}, canvases ${m0.cv}→${m1.cv})`, Math.abs(m1.dom - m0.dom) < 30 && m1.cv === m0.cv);
  t(`JS heap growth small (${((m1.heap - m0.heap) / 1e6).toFixed(1)} MB)`, !m0.heap || m1.heap - m0.heap < 40e6);
  await ctx.close();
});

await run('Scar arcs layer: ticks, hover tooltip, click card (both disks, both orientations)', async () => {
  // azimuth α around the C–C′ axis must equal the bearing from the Scar centre (arcs are defined by bearing in 2D/3D, tested by α here)
  let maxD = 0; for (let i = 0; i < 400; i++) { const th = 60 + rnd() * 25, al = -180 + rnd() * 360, ll = K.fromPolar(th, al), b = C.bearing(C.SC.lat, C.SC.lon, ll[0], ll[1]), pp = K.polar(ll[0], ll[1]); maxD = Math.max(maxD, angDiff(pp.alpha, b)); }
  t('polar α equals the bearing from the Scar centre (arc hit-test relies on it)', maxD < 1e-6, String(maxD));
  for (const orient of ['h', 'v']) {
    const { ctx, page } = await openDisk({ query: '?view=disk', viewport: orient === 'h' ? { width: 1440, height: 900 } : { width: 900, height: 1400 }, init: `try { localStorage.setItem('rh-d-orient', '"${orient}"'); } catch (e) {}` });
    await page.evaluate(() => { const c = window.__rhDisk._ctx; Object.keys(c.LAYERS).forEach((k) => c.setLayer(k, false)); }); await frame(page, 3);
    const info = await page.evaluate(() => window.__rhDisk.info()), tag = `[${info.orient}] `;
    const px = (x, y) => page.evaluate(([a, b]) => { const cv = document.querySelector('#disk canvas'), d = cv.getContext('2d').getImageData(Math.round(a) - 1, Math.round(b) - 1, 3, 3).data; let m = 0; for (let i = 0; i < d.length; i += 4) m = Math.max(m, 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); return m; }, [x, y]);
    const at = async (alpha, theta, disk) => { const ll = K.fromPolar(theta, alpha), pr = (await proj(page, ll[0], ll[1])).filter((q) => q.disk === disk)[0]; return pr; };
    const before = {}; const spots = [];
    for (const disk of ['R', 'A']) for (const a of [-135, -25, 25, 135]) { const pr = await at(a, disk === 'R' ? 69 : 76, disk); spots.push({ disk, a, pr }); before[disk + a] = await px(pr.x, pr.y); }
    const off = []; for (const disk of ['R', 'A']) for (const a of [0, 60, -60, 180]) { const pr = await at(a, disk === 'R' ? 69 : 76, disk); off.push({ disk, a, pr, v: await px(pr.x, pr.y) }); }
    await page.evaluate(() => window.__rhDisk._ctx.setLayer('arcs', true)); await frame(page, 3);
    for (const s of spots) { const v = await px(s.pr.x, s.pr.y); t(`${tag}tick at α=${s.a}° drawn on disk ${s.disk} (pixel brightens ${before[s.disk + s.a].toFixed(0)} → ${v.toFixed(0)})`, v > before[s.disk + s.a] + 25 && v > 140); }
    for (const o of off) t(`${tag}no tick at α=${o.a}° on disk ${o.disk} (arcs are four marks, not a ring)`, Math.abs((await px(o.pr.x, o.pr.y)) - o.v) < 6);
    // hover → tooltip with the arc name; click → card of that arc; pointer cursor class
    const names = [[0, 'Culmen Cicatricis'], [60, 'Latus Orientale'], [-60, 'Latus Occidentale'], [180, 'Ima Cicatricis'], [-160, 'Ima Cicatricis'], [160, 'Ima Cicatricis']];
    for (const [a, nm] of names) {
      for (const disk of ['R', 'A']) {
        const pr = await at(a, disk === 'R' ? 70.5 : 76, disk); const f = await page.evaluate(() => window.__rhDisk._ctx.insets()); if (pr.x < (f.l || 0) + 5 || pr.x > info.W - 5 || pr.y < 70 || pr.y > info.H - 5) continue;
        await page.mouse.move(5, 5); await page.mouse.move(pr.x, pr.y); await page.waitForTimeout(120); await frame(page, 2);
        const tip = await page.evaluate(() => { const e = document.querySelector('#disk .g-tip'); return { hidden: e.hidden, txt: e.textContent, pick: document.getElementById('disk').classList.contains('pick') }; });
        t(`${tag}hover α=${a}° on disk ${disk}: tooltip "${nm}"`, !tip.hidden && tip.txt === nm && tip.pick, JSON.stringify(tip));
      }
    }
    const pr = await at(60, 70.5, 'R'); await page.mouse.move(5, 5); await page.mouse.click(pr.x, pr.y); await page.waitForTimeout(250);
    t(`${tag}clicking an arc opens its card`, /Latus Orientale/.test(await page.evaluate(() => document.getElementById('g-card').innerText)));
    await page.keyboard.press('Escape');
    // outside the band: nothing; layer off: nothing (tooltip hidden, no card)
    const far = await at(60, 40, 'R'); await page.mouse.move(5, 5); await page.mouse.move(far.x, far.y); await page.waitForTimeout(120); await frame(page, 2);
    t(`${tag}no arc tooltip away from the Scar band`, await page.evaluate(() => document.querySelector('#disk .g-tip').hidden));
    await page.evaluate(() => window.__rhDisk._ctx.setLayer('arcs', false)); await frame(page, 3);
    const pr2 = await at(0, 70.5, 'R'); await page.mouse.move(5, 5); await page.mouse.move(pr2.x, pr2.y); await page.waitForTimeout(120); await frame(page, 2);
    t(`${tag}layer off: no tooltip on the band, tick gone`, (await page.evaluate(() => document.querySelector('#disk .g-tip').hidden)) && Math.abs((await px(spots[0].pr.x, spots[0].pr.y)) - before[spots[0].disk + spots[0].a]) < 6);
    await page.mouse.click(pr2.x, pr2.y); await page.waitForTimeout(200);
    t(`${tag}layer off: clicking the band opens no card`, await page.evaluate(() => document.getElementById('g-card').hidden));
    await ctx.close();
  }
});

await run('all flat-map layers on the working map: drawing, placement, hover, click, labels (both orientations)', async () => {
  const RD = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/data.json'), 'utf8')), inRing = (lat, lon, ring) => { for (let k = -1; k <= 1; k++) { const x = lon + 360 * k; let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1]; if ((yi > lat) !== (yj > lat) && x < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } if (c) return true; } return false; };
  // an interior point of a ring: the first grid point (1° steps over its bounding box) that lies inside it
  const interior = (ring) => { let a = 90, b = -90, c0 = 1e9, d0 = -1e9; ring.forEach(([la, lo]) => { a = Math.min(a, la); b = Math.max(b, la); c0 = Math.min(c0, lo); d0 = Math.max(d0, lo); }); let best = null, bd = -1; for (let la = a; la <= b; la += 0.5) for (let lo = c0; lo <= d0; lo += 0.5) if (inRing(la, lo, ring)) { const m = Math.min(...ring.map(([y, x]) => Math.hypot(y - la, (x - lo) * Math.cos(la * Math.PI / 180)))); if (m > bd) { bd = m; best = [la, lo]; } } return best; };
  for (const orient of ['h', 'v']) {
    const { ctx, page, ev } = await openDisk({ query: '?view=disk', viewport: orient === 'h' ? { width: 1440, height: 900 } : { width: 900, height: 1400 }, init: `try { localStorage.setItem('rh-d-orient', '"${orient}"'); } catch (e) {}` });
    const tag = `[${orient}] `, only = (keys) => page.evaluate((ks) => { const c = window.__rhDisk._ctx; Object.keys(c.LAYERS).forEach((k) => c.setLayer(k, ks.includes(k))); }, keys);
    const pix = (x, y) => page.evaluate(([a, b]) => Array.from(document.querySelector('#disk canvas').getContext('2d').getImageData(Math.round(a) - 5, Math.round(b) - 5, 11, 11).data), [x, y]);   // 11×11 window: dashed lines can leave a gap exactly on a vertex
    const dist = (u, v) => { let m = 0; for (let i = 0; i < u.length; i += 4) m = Math.max(m, Math.hypot(u[i] - v[i], u[i + 1] - v[i + 1], u[i + 2] - v[i + 2])); return m; };
    const canvasHash = async () => { await frame(page, 3); return page.evaluate(() => { const c = document.querySelector('#disk canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0, n = 0; for (let i = 0; i < d.length; i += 4) { h = (h * 31 + d[i] + 3 * d[i + 1] + 7 * d[i + 2]) | 0; } return h; }); };
    const tip = async (x, y) => { await page.mouse.move(5, 5); await page.mouse.move(x, y); await page.waitForTimeout(110); await frame(page, 2); return page.evaluate(() => { const e = document.querySelector('#disk .g-tip'); return e.hidden ? null : e.textContent; }); };
    const info = await page.evaluate(() => window.__rhDisk.info()), W = info.W, H = info.H, ins = await page.evaluate(() => window.__rhDisk._ctx.insets());
    const onScreen = (q) => q && q.x > (ins.l || 0) + 8 && q.x < W - 8 && q.y > 76 && q.y < H - (ins.b || 0) - 8;
    const where = async (lat, lon) => { const l = (await proj(page, lat, lon)).filter(onScreen); return l[0] || null; };

    // 1. every layer changes the picture
    await only([]); await frame(page, 3); const base = await canvasHash(); await page.evaluate(() => { const c = document.querySelector('#disk canvas'); window.__base = c.getContext('2d').getImageData(0, 0, c.width, c.height).data.slice(); }); let changed = 0; const names = [];
    const VEC = ['cland', 'csea', 'regions', 'banks', 'mandala', 't_hes', 't_hesb', 't_sat', 't_foe', 't_int', 't_ana', 't_elv', 't_lain', 'r_historic', 'r_land', 'r_story', 'r_sea', 'fronts'];
    for (const k of VEC) { await only([k]); const h = await canvasHash(); if (h !== base) changed++; else names.push(k); }
    t(`${tag}each of the ${VEC.length} vector layers repaints the canvas${names.length ? ' (no change: ' + names.join() + ')' : ''}`, changed === VEC.length);
    // labels are DOM: the visible count rises
    const nLbl = () => page.evaluate(() => Array.from(document.querySelectorAll('#disk .g-labels .g-pin')).filter((e) => e.style.display !== 'none' && !e.classList.contains('hide')).length);
    await only([]); const l0 = await nLbl(); await only(['labels']); await frame(page, 3); const l1 = await nLbl();
    t(`${tag}labels layer shows place and water labels (${l0} → ${l1})`, l0 === 0 && l1 >= 8);

    // 2. placement: a route / front vertex lies on the coloured line (pixel differs from the same pixel with the layer off)
    for (const r of RD.routes.concat(RD.fronts)) {
      const key = RD.routes.includes(r) ? 'r_' + r.kind : 'fronts', v = r.pts[Math.floor(r.pts.length / 2)], q = await where(v[0], v[1]); if (!q) continue;
      await only([]); await frame(page, 2); const p0 = await pix(q.x, q.y); await only([key]); await frame(page, 2); const p1 = await pix(q.x, q.y);
      t(`${tag}${r.id}: a mid-line vertex projects onto the drawn line (colour shift ${dist(p0, p1).toFixed(0)})`, dist(p0, p1) > 25);
    }
    // 3. hover and click: faction territories (topmost wins, like the flat map)
    const grp = await page.evaluate(() => Object.fromEntries(window.__rhDisk._ctx.DATA.territories.map((t) => [t.id, window.__rhDisk._ctx.styles.tgroupOf(t)])));
    // painting order = the shared canonical order (C.terrOrder: group order of C.TGROUPS, then data order); topmost wins; zone tiers answer as their parent faction
    const ord = await page.evaluate(() => window.RH.core.terrOrder(window.__rhDisk._ctx.DATA.territories).map((t) => t.id));
    const byId = Object.fromEntries(RD.territories.map((x) => [x.id, x])), terr = ord.map((id) => byId[id]).filter((x) => x.id !== 'anusarri'), TG = ['t_hes', 't_hesb', 't_sat', 't_foe', 't_int', 't_ana', 't_elv', 't_lain'];
    await only(TG); let nT = 0, bad = [];
    for (let i = 0; i < terr.length; i++) {
      const x = terr[i], pt = interior(x.rings[0]); if (!pt) continue; const q = await where(pt[0], pt[1]); if (!q) continue;
      let top = null; for (let j = terr.length - 1; j >= 0; j--) if (terr[j].rings.some((rg) => inRing(pt[0], pt[1], rg))) { top = terr[j]; break; }
      const fac = await page.evaluate((id) => { const f = window.__rhDisk._ctx.FAC[id]; return f ? f.name : null; }, top.of || top.id); const got = await tip(q.x, q.y); nT++;
      if (got !== (fac || top.name)) bad.push(`${x.id}→${got}≠${fac || top.name}`);
    }
    t(`${tag}hover over ${nT} territories gives the topmost faction name${bad.length ? ' — ' + bad.join(' | ') : ''}`, nT >= 8 && bad.length === 0);
    const hes = terr.find((x) => x.id === 'hesperia'), hp = interior(hes.rings[0]), hq = await where(hp[0], hp[1]);
    if (hq) { await page.mouse.move(5, 5); await page.mouse.click(hq.x, hq.y); await page.waitForTimeout(250); t(`${tag}clicking a territory opens the faction card`, /Hesperia/.test(await page.evaluate(() => document.getElementById('g-card').innerText))); await page.keyboard.press('Escape'); }
    await only(['t_foe']); const hq2 = await tip(hq.x, hq.y); t(`${tag}a territory in a switched-off group gives no tooltip`, grp.hesperia === 'hes' && hq2 === null, String(hq2));
    // 4. routes and fronts: tooltip with the name at a vertex, card on click
    for (const r of RD.routes.concat(RD.fronts)) {
      const key = RD.routes.includes(r) ? 'r_' + r.kind : 'fronts', v = r.pts[Math.floor(r.pts.length / 2)], q = await where(v[0], v[1]); if (!q) continue; await only([key]); const got = await tip(q.x, q.y);
      t(`${tag}hover on ${r.id}: tooltip is its name`, got === r.name, String(got));
    }
    const rt = RD.routes.find((r) => r.kind === 'sea'), rv = rt.pts[2], rq = await where(rv[0], rv[1]);
    if (rq) { await only(['r_sea']); await page.mouse.move(5, 5); await page.mouse.click(rq.x, rq.y); await page.waitForTimeout(250); t(`${tag}clicking a route opens its card`, (await page.evaluate(() => document.getElementById('g-card').innerText)).includes(rt.name.split(' ')[0])); await page.keyboard.press('Escape'); }
    // 5. mandala, banks, regions
    await only(['mandala']); const mnd = RD.mandala[RD.mandala.length - 1], mp = interior(mnd.rings[0]), mq = mp && await where(mp[0], mp[1]);
    if (mq) { let top = null; for (let i = RD.mandala.length - 1; i >= 0; i--) if (RD.mandala[i].rings.some((rg) => inRing(mp[0], mp[1], rg))) { top = RD.mandala[i]; break; } t(`${tag}hover on the Mandala names its ring`, (await tip(mq.x, mq.y)) === `Mandala Kemurnian · Ring ${top.ring}`); }
    await only(['banks']); const bk = RD.banks[0], bq = await where(bk.lat, bk.lon);
    if (bq) { t(`${tag}hover on a bank gives its tooltip`, /Bank samudra/.test(String(await tip(bq.x, bq.y)))); await page.mouse.click(bq.x, bq.y); await page.waitForTimeout(250); t(`${tag}clicking a bank opens its card`, !(await page.evaluate(() => document.getElementById('g-card').hidden))); await page.keyboard.press('Escape'); }
    await only(['regions']); const RS = await page.evaluate(() => window.__rhDisk._ctx.styles.REG_STYLE), reg = RD.regions.find((r) => RS[r.id] && RS[r.id].fill !== 'none' && interior(r.rings[0]) && true);
    if (reg) { const rp = interior(reg.rings[0]), rq2 = await where(rp[0], rp[1]); if (rq2) { const got = await tip(rq2.x, rq2.y); t(`${tag}hover inside a filled physical region (${reg.id}) gives a name`, !!got, String(got)); } }
    // 6. labels: click opens the place card; no two visible labels overlap
    await only(['labels']); await frame(page, 3);
    const lab = await page.evaluate(() => { const out = []; document.querySelectorAll('#disk .g-labels .g-pin').forEach((w) => { if (w.style.display === 'none' || w.classList.contains('hide')) return; const e = w.firstChild && w.firstChild.firstChild; if (!e) return; const r = e.getBoundingClientRect(); if (r.width) out.push({ t: e.textContent.trim(), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }); }); return out; });
    let ov = 0; for (let i = 0; i < lab.length; i++) for (let j = i + 1; j < lab.length; j++) if (lab[i].x0 < lab[j].x1 - 1 && lab[i].x1 > lab[j].x0 + 1 && lab[i].y0 < lab[j].y1 - 1 && lab[i].y1 > lab[j].y0 + 1) ov++;
    t(`${tag}no two visible labels overlap (${lab.length} shown)`, lab.length >= 8 && ov === 0, String(ov));
    const big = lab.filter((q) => q.x0 > (ins.l || 0) + 10 && q.x1 < W - 10 && q.y0 > 80 && q.y1 < H - (ins.b || 0) - 10).sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0))[0];
    if (big) { await page.mouse.move(5, 5); await page.mouse.click((big.x0 + big.x1) / 2, (big.y0 + big.y1) / 2); await page.waitForTimeout(250); const ct = await page.evaluate(() => document.getElementById('g-card').innerText); t(`${tag}clicking the label "${big.t.slice(0, 24)}" opens a place card`, ct.length > 20 && !(await page.evaluate(() => document.getElementById('g-card').hidden)), ct.slice(0, 40)); await page.keyboard.press('Escape'); }
    // 7. toggling back off removes everything (no ghost drawing), and a layer pair is independent
    await only([]); await page.waitForTimeout(300); await frame(page, 3);   // let a pending relayout after a closed card settle
    const resid = await page.evaluate(() => { const c = document.querySelector('#disk canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, b = window.__base; let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let i = 0; i < d.length; i += 4) if (d[i] !== b[i] || d[i + 1] !== b[i + 1] || d[i + 2] !== b[i + 2] || d[i + 3] !== b[i + 3]) { n++; const x = (i / 4) % c.width, y = Math.floor(i / 4 / c.width); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { n, box: [x0, y0, x1, y1], st: window.__rhDisk.info().scale }; });
    t(`${tag}all layers off returns exactly the plain base, pixel for pixel (no residue)`, resid.n === 0, JSON.stringify(resid));
    await only(['t_hes']); const hA = await canvasHash(); await only(['t_hes', 'r_land']); const hB = await canvasHash(); t(`${tag}layers are independent (territory group alone ≠ with a route layer)`, hA !== hB && hA !== base);
    const noise = ev.console.filter((m) => !/willReadFrequently/.test(m));   // the test's own getImageData reads trigger that Chrome hint
    t(`${tag}no console noise`, ev.errors.length === 0 && noise.length === 0, JSON.stringify([ev.errors, noise]));
    await ctx.close();
  }
});

await run('globe ↔ working map switching', async () => {
  const { ctx, page, ev } = await openDisk({ query: '?view=3d', noWait: true, settle: 100 });
  await page.waitForFunction(() => window.__rhGlobe && window.__rhGlobe.isShown(), null, { timeout: 60000 });
  await page.locator('#btn-disk').click(); await page.waitForFunction(() => window.__rhDisk && window.__rhDisk.isShown() && window.__rhDisk.info().sheet, null, { timeout: 60000 });
  t('3D → working map directly: globe hidden, disk shown, only one view active', await page.evaluate(() => document.body.classList.contains('in-disk') && !document.body.classList.contains('in-3d') && document.getElementById('globe').hidden && !document.getElementById('disk').hidden && document.getElementById('tab-globe').hidden));
  await page.locator('#btn-view').click(); await page.waitForFunction(() => window.__rhGlobe.isShown());
  t('working map → globe directly', await page.evaluate(() => document.body.classList.contains('in-3d') && document.getElementById('disk').hidden && !document.getElementById('tab-globe').hidden));
  t('no console noise while switching', ev.errors.length === 0 && ev.console.length === 0, JSON.stringify([ev.errors, ev.console]));
  await ctx.close();
});

await browser.close(); await srv.close();
console.log(`\ndisk: ${pass} passed, ${fail} failed${fail ? '\nFAILED: ' + failures.join(' | ') : ''}`);
process.exit(fail ? 1 : 0);
