// Tests for the distance-measure tool in every view (flat map, 3D globe, dual-disk working map): the tool, the great-circle line, the
// dots and result box, markers as exact start/end points, keyboard, mobile layout, carrying a result between views.   node measure.mjs
import { startServer } from './lib/server.mjs';
import { launch, newPage } from './lib/browser.mjs';
import { loadRH, readJSON } from './lib/load.mjs';

const RH = loadRH(), C = RH.core;
const DATA = readJSON('data/data.json'); C.configure(DATA.stats, DATA.thresholds);
const P = Object.fromEntries(DATA.places.map((p) => [p.id, p]));
let pass = 0, fail = 0; const failures = [];
const t = (name, ok, detail = '') => { if (ok) pass++; else { fail++; failures.push(name); console.log(`FAIL  ${name} ${detail}`); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const kmOf = (a, b) => C.angDist(a[0], a[1], b[0], b[1]) * C.cfg.KM_DEG;
const parseKm = (s) => { const m = /([\d.]+)\s*km/.exec(s || ''); return m ? +m[1].replace(/\./g, '') : NaN; };   // "1.818 km" (id-ID thousands dot)

const srv = await startServer(), browser = await launch();
async function open(mode, o = {}) {
  const { ctx, page, ev } = await newPage(browser, { viewport: o.viewport || { width: 1440, height: 900 }, hasTouch: !!o.touch, isMobile: !!o.touch, deviceScaleFactor: o.dpr || 1 });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(srv.url + (mode === '2d' ? '' : '?view=' + mode), { waitUntil: 'load' });
  if (mode === '3d') { await page.waitForFunction(() => window.__rhGlobe && window.__rhGlobe.isShown() && window.__rhGlobe.info().frames >= 6, null, { timeout: 90000 }); }
  else if (mode === 'disk') await page.waitForFunction(() => window.__rhDisk && window.__rhDisk.isShown() && window.__rhDisk.info().sheet, null, { timeout: 90000 });
  else await page.waitForFunction(() => window.__rhMap && document.querySelectorAll('.leaflet-image-layer').length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  return { ctx, page, ev };
}
async function run(name, fn) { const t0 = Date.now(); try { await fn(); } catch (e) { fail++; failures.push(name); console.log(`FAIL  ${name} — exception: ${e && e.stack || e}`); } console.log(`  ·${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }

// ---- helpers: client-pixel position of a place in each view
const globePx = (page, id) => page.evaluate((i) => { const g = window.__rhGlobe, S = g._S, p = g._ctx.placeById[i], v = RH.G.vec(p.lat, p.lon), o = S.toScreen(v[0], v[1], v[2], {}), r = document.querySelector('#globe canvas.g-canvas').getBoundingClientRect(); return { x: r.x + o.x, y: r.y + o.y, front: S.front(v[0], v[1], v[2], 0.1) }; }, id);
const diskPx = (page, la, lo, k = 0) => page.evaluate(([a, b, n]) => { const p = window.__rhDisk._project(a, b)[n], r = document.querySelector('#disk canvas.d-canvas').getBoundingClientRect(); return p ? { x: r.x + p.x, y: r.y + p.y, disk: p.disk } : null; }, [la, lo, k]);
const setGlobe = (page, lat, lon, dist) => page.evaluate(([a, b, d]) => { const g = window.__rhGlobe, S = g._S; g._state.spin = false; S.cancelFly(); S.inertia = null; S.view.lat = a; S.view.lon = b; if (d) S.view.dist = S.defaultDist() * d; S.dirty(); }, [lat, lon, dist || 0]);
const hintText = (page) => page.evaluate(() => { const h = document.getElementById('mhint'); return h.hidden ? null : document.getElementById('mhint-t').innerText; });
const pressed = (page) => page.locator('#btn-measure').getAttribute('aria-pressed');
const frames = (page, n = 3) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

// ================================================================== 1. globe
await run('globe: tool, markers as exact points, great-circle line, dots, result box', async () => {
  const { ctx, page, ev } = await open('3d');
  await setGlobe(page, 20, -40, 1.05); await page.waitForTimeout(500);
  const btn = page.locator('#btn-measure');
  t('the Ukur button is enabled in 3D and says "globe"', !(await btn.isDisabled()) && /globe/.test((await btn.getAttribute('title')) || ''), await btn.getAttribute('title'));
  await page.evaluate(() => { window.__rhGlobe._state.spin = true; });
  await btn.click(); await page.waitForTimeout(200);
  t('measure mode: pressed, crosshair class, hint, auto-rotation stopped', (await pressed(page)) === 'true' && await page.evaluate(() => document.getElementById('globe').classList.contains('meas') && window.__rhGlobe._state.spin === false) && /titik awal/i.test(await hintText(page) || ''));
  const A = 'litus_primum', B = 'aventalia', pa = await globePx(page, A), pb = await globePx(page, B);
  t('both markers face the camera', pa.front && pb.front, JSON.stringify([pa, pb]));
  await page.mouse.click(pa.x, pa.y); await page.waitForTimeout(250);
  t('first tap sets the start point (exactly the marker) and asks for the destination', /Titik awal terpasang/.test(await hintText(page) || '') && await page.evaluate((i) => { const m = window.__rhGlobe._layers.measure(), p = window.__rhGlobe._ctx.placeById[i]; return !!m && Math.abs(m.a[0] - p.lat) < 1e-9 && Math.abs(m.a[1] - p.lon) < 1e-9 && !m.b; }, A));
  await page.mouse.click(pb.x, pb.y); await page.waitForTimeout(700);
  const h = await hintText(page), expKm = kmOf([P[A].lat, P[A].lon], [P[B].lat, P[B].lon]);
  t(`distance = great-circle distance between the two markers (${expKm.toFixed(1)} km)`, near(parseKm(h), expKm, 0.6), h);
  t('travel times are shown (foot, horse, sailing ship)', /Jalan kaki ≈ \d+ hari/.test(h) && /berkuda/.test(h) && /kapal layar/.test(h));
  const m = await page.evaluate(() => window.__rhGlobe._layers.measure());
  t('the line has 241 points from A to B', m.pts.length === 241 && near(m.pts[0][0], P[A].lat, 1e-6) && near(m.pts[240][0], P[B].lat, 1e-6) && near(C.lonN(m.pts[240][1] - P[B].lon), 0, 1e-6));
  let worst = 0; for (let i = 0; i <= 240; i += 8) { const q = m.pts[i], d = C.angDist(P[A].lat, P[A].lon, q[0], q[1]) + C.angDist(q[0], q[1], P[B].lat, P[B].lon) - C.angDist(P[A].lat, P[A].lon, P[B].lat, P[B].lon); worst = Math.max(worst, Math.abs(d)); }
  t(`every point lies on the great circle (worst excess ${worst.toExponential(1)}°)`, worst < 1e-6);
  t('two dots and the result box are placed, the box shows the same distance', await page.evaluate(() => [...document.querySelectorAll('.g-mdot')].every((e) => e.parentNode.style.display !== 'none') && /km/.test(document.querySelector('.g-mtip').textContent) && document.querySelector('.g-mtip').parentNode.style.display !== 'none'));
  const quiet = ev.errors.length === 0 && ev.console.length === 0, quietDetail = JSON.stringify([ev.errors, ev.console]);
  // the overlay really contains the dashed line: pixels differ from a repaint without the measurement
  const o1 = await page.evaluate(() => { const g = window.__rhGlobe, L = g._layers, mm = L.measure(); L.setMeasure(null); L.repaint(); const c = g._S.overlayTex.image, x = c.getContext('2d'), d0 = x.getImageData(0, 0, c.width, c.height).data; L.setMeasure(mm); L.repaint(); const d1 = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d0.length; i += 4) if (d1[i] !== d0[i]) n++; return n; });
  t(`the overlay texture gains the measure line (${o1} changed pixels)`, o1 > 400, String(o1));
  // far side: dots and box hide
  await setGlobe(page, 20, 140, 1.05); await frames(page, 4);
  t('on the far side of the globe the dots and the box are hidden', await page.evaluate(() => [...document.querySelectorAll('.g-mdot, .g-mtip')].every((e) => e.parentNode.style.display === 'none')));
  await setGlobe(page, 20, -40, 1.05); await frames(page, 4);
  // Escape ends the mode but the drawing stays
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  t('Esc ends measure mode, keeps the drawing, hides the hint', (await pressed(page)) === 'false' && await page.evaluate(() => !document.getElementById('globe').classList.contains('meas') && !!window.__rhGlobe._layers.measure()) && (await hintText(page)) === null);
  // "Selesai" clears everything
  await btn.click(); await page.waitForTimeout(100); await page.mouse.click(pa.x, pa.y); await page.waitForTimeout(150);
  await page.locator('#mhint-x').click(); await page.waitForTimeout(250);
  t('"Selesai" clears the drawing and leaves measure mode', await page.evaluate(() => window.__rhGlobe._layers.measure() === null && [...document.querySelectorAll('.g-mdot, .g-mtip')].every((e) => e.parentNode.style.display === 'none')) && (await pressed(page)) === 'false');
  t('no console errors or warnings', quiet, quietDetail);
  await ctx.close();
});

await run('globe: free points, antimeridian, keyboard, "Ukur dari sini"', async () => {
  const { ctx, page, ev } = await open('3d');
  await setGlobe(page, 10, -40, 1.2); await page.waitForTimeout(500);
  await page.locator('#btn-measure').click();
  const cen = await page.evaluate(() => { const g = window.__rhGlobe, S = g._S, v = RH.G.vec(S.view.lat, S.view.lon), o = S.toScreen(v[0], v[1], v[2], {}), r = document.querySelector('#globe canvas.g-canvas').getBoundingClientRect(); return { x: r.x + o.x, y: r.y + o.y }; });
  const px = [[cen.x - 110, cen.y - 40], [cen.x + 90, cen.y + 70]];
  const picks = await page.evaluate((q) => q.map(([x, y]) => { const rr = document.querySelector('#globe canvas.g-canvas').getBoundingClientRect(), p = window.__rhGlobe._S.pick(x - rr.x, y - rr.y); return p ? [p.lat, p.lon] : null; }), px);
  t('both free points hit the sphere', !!picks[0] && !!picks[1]);
  await page.mouse.click(px[0][0], px[0][1]); await page.waitForTimeout(150); await page.mouse.click(px[1][0], px[1][1]); await page.waitForTimeout(500);
  t('free points (no marker underneath): distance = great-circle distance between the picked surface points', near(parseKm(await hintText(page)), kmOf(picks[0], picks[1]), 0.6), `${await hintText(page)} vs ${kmOf(picks[0], picks[1]).toFixed(1)}`);
  // across the antimeridian: the line must not wrap the long way round
  await page.evaluate(() => { const c = window.__rhGlobe._ctx; c.measureAt(0, 170); c.measureAt(0, -170); }); await page.waitForTimeout(300);
  const m = await page.evaluate(() => window.__rhGlobe._layers.measure());
  t(`across 180°: 20° of arc = ${(20 * C.cfg.KM_DEG).toFixed(0)} km`, near(parseKm(await hintText(page)), 20 * C.cfg.KM_DEG, 0.6), await hintText(page));
  let jump = 0; for (let i = 1; i < m.pts.length; i++) jump = Math.max(jump, Math.abs(m.pts[i][1] - m.pts[i - 1][1])); t(`the line is continuous across the antimeridian (largest longitude step ${jump.toFixed(2)}°)`, jump < 0.2);
  // keyboard: a focused marker becomes the point instead of opening a card
  await page.evaluate(() => window.__rhGlobe._ctx.measureAt(0, 0));   // new start point (clears nothing else)
  await setGlobe(page, 20, -40, 1.05); await page.waitForTimeout(500);
  const idx = await page.evaluate(() => { const ps = window.__rhGlobe._layers.pins.filter((n) => n.kind === 'marker' && n.shown); return ps.length; });
  t('markers are visible for the keyboard test', idx > 3, String(idx));
  const kid = await page.evaluate(() => { const n = window.__rhGlobe._layers.pins.filter((q) => q.kind === 'marker' && q.shown)[0]; const mk = n.el.firstChild; mk.focus(); return n.p.id; });
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ card: !document.getElementById('g-card').hidden, m: window.__rhGlobe._layers.measure() }));
  t('Enter on a focused marker in measure mode picks it as the point and opens no card', !after.card && !!after.m && !!after.m.b && near(after.m.b[0], P[kid].lat, 1e-9), JSON.stringify({ kid, card: after.card, b: after.m && after.m.b }));
  // place card → "Ukur dari sini" stays in the globe
  await page.keyboard.press('Escape'); await page.locator('#mhint-x').click({ trial: true }).catch(() => {});
  await page.evaluate(() => { const b = document.getElementById('btn-measure'); if (b.getAttribute('aria-pressed') === 'true') b.click(); });
  await page.evaluate((i) => RH.G.openHit({ type: 'place', id: i }), 'aurelia'); await page.waitForTimeout(250);
  await page.locator('#g-card [data-measure]').click(); await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({ in3d: document.body.classList.contains('in-3d'), card: document.getElementById('g-card').hidden, p: document.getElementById('btn-measure').getAttribute('aria-pressed'), m: window.__rhGlobe._layers.measure(), mode: document.getElementById('globe').classList.contains('meas') }));
  t('"Ukur dari sini" on a place card keeps the globe, closes the card and sets the start point', st.in3d && st.card && st.p === 'true' && st.mode && !!st.m && near(st.m.a[0], P.aurelia.lat, 1e-9) && !st.m.b && /Titik awal terpasang/.test(await hintText(page) || ''), JSON.stringify(st));
  t('no console errors or warnings', ev.errors.length === 0 && ev.console.length === 0, JSON.stringify([ev.errors, ev.console]));
  await ctx.close();
});

// ================================================================== 2. dual-disk working map
await run('disk: tool, markers on either disk, line broken at the rims, dots, label', async () => {
  const { ctx, page, ev } = await open('disk');
  const btn = page.locator('#btn-measure');
  t('the Ukur button is enabled on the working map and says "peta"', !(await btn.isDisabled()) && /peta/.test((await btn.getAttribute('title')) || ''));
  await btn.click(); await page.waitForTimeout(150);
  t('measure mode: pressed, crosshair class, hint', (await pressed(page)) === 'true' && await page.evaluate(() => document.getElementById('disk').classList.contains('meas')) && /titik awal/i.test(await hintText(page) || ''));
  const A = 'aurelia', B = 'libbal', pa = await diskPx(page, P[A].lat, P[A].lon), pb = await diskPx(page, P[B].lat, P[B].lon);
  t('markers project onto the disks', !!pa && !!pb, JSON.stringify([pa, pb]));
  await page.mouse.click(pa.x, pa.y); await page.waitForTimeout(200); await page.mouse.click(pb.x, pb.y); await page.waitForTimeout(500);
  const expKm = kmOf([P[A].lat, P[A].lon], [P[B].lat, P[B].lon]);
  t(`Rhykar marker → Aëris marker: ${expKm.toFixed(0)} km (exact great-circle distance, not the distorted pixel distance)`, near(parseKm(await hintText(page)), expKm, 0.6), await hintText(page));
  const m = await page.evaluate(() => window.__rhDisk._measure());
  t('the line has 241 points from A to B', !!m && m.pts.length === 241 && near(m.pts[0][0], P[A].lat, 1e-6) && near(m.pts[240][0], P[B].lat, 1e-6));
  const quiet = ev.errors.length === 0 && ev.console.length === 0, quietDetail = JSON.stringify([ev.errors, ev.console]);
  // pixel check on the canvas: the start dot is orange (#ff7a3d) at its centre, with a white ring
  const px = await page.evaluate(([x, y]) => { const cv = document.querySelector('#disk canvas.d-canvas'), r = cv.getBoundingClientRect(), k = cv.width / r.width, g = cv.getContext('2d'), d = g.getImageData(Math.round((x - r.x) * k), Math.round((y - r.y) * k), 1, 1).data; let ring = [0, 0, 0]; for (let o = 4; o <= 7; o++) { const q = g.getImageData(Math.round((x - r.x + o) * k), Math.round((y - r.y) * k), 1, 1).data; if (q[0] + q[1] + q[2] > ring[0] + ring[1] + ring[2]) ring = [q[0], q[1], q[2]]; } return { c: [d[0], d[1], d[2]], ring }; }, [pa.x, pa.y]);
  t('the start dot is drawn on the canvas (orange centre, white ring)', px.c[0] > 230 && near(px.c[1], 122, 14) && near(px.c[2], 61, 14) && px.ring.every((v) => v > 215), JSON.stringify(px));
  t('the distance label is drawn next to the destination (label in the state)', /km/.test(m.label || ''));
  // free points on the disks
  await btn.click(); await page.waitForTimeout(100); await btn.click(); await page.waitForTimeout(150);
  const f1 = await diskPx(page, -30, -20), f2 = await diskPx(page, 25, 150);
  const un = await page.evaluate(([a, b]) => { const r = document.querySelector('#disk canvas.d-canvas').getBoundingClientRect(); return [a, b].map((q) => { const u = window.__rhDisk._unproject(q.x - r.x, q.y - r.y); return u ? [u.lat, u.lon] : null; }); }, [f1, f2]);
  await page.mouse.click(f1.x, f1.y); await page.waitForTimeout(150); await page.mouse.click(f2.x, f2.y); await page.waitForTimeout(400);
  t('free points: distance = great-circle distance between the un-projected points', !!un[0] && !!un[1] && near(parseKm(await hintText(page)), kmOf(un[0], un[1]), 0.6), `${await hintText(page)} vs ${un[0] && un[1] ? kmOf(un[0], un[1]).toFixed(1) : '?'}`);
  // a click in the gap between the disks (no map there) is ignored
  const gap = await page.evaluate(() => { const D = window.__rhDisk, r = document.querySelector('#disk canvas.d-canvas').getBoundingClientRect(); for (let x = r.width * 0.3; x < r.width * 0.7; x += 4) for (let y = 120; y < r.height - 120; y += 40) if (!D._unproject(x, y)) return { x: r.x + x, y: r.y + y }; return null; });
  if (gap) { const before = await hintText(page); await page.mouse.click(gap.x, gap.y); await page.waitForTimeout(150); t('a tap outside both disks is ignored while measuring', (await hintText(page)) === before && /Titik awal terpasang/.test(await hintText(page) || '') === /Titik awal terpasang/.test(before || '')); }
  else t('found a spot outside both disks', false);
  t('no console errors or warnings', quiet, quietDetail);
  await ctx.close();
});

// ================================================================== 3. flat map (refactored, must stay identical) and carrying a result between views
await run('flat map: measure still works, same text as the other views; result moves between views', async () => {
  const { ctx, page, ev } = await open('2d');
  const A = 'litus_primum', B = 'aventalia';
  await page.evaluate(([a, b]) => { const m = window.__rhMap; m.setView([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 4, { animate: false }); }, [[P[A].lat, P[A].lon], [P[B].lat, P[B].lon]]);
  await page.waitForTimeout(500);
  const mp = (la, lo) => page.evaluate(([a, b]) => { const m = window.__rhMap, p = m.latLngToContainerPoint([a, b]), r = m.getContainer().getBoundingClientRect(); return { x: r.x + p.x, y: r.y + p.y }; }, [la, lo]);
  const pa = await mp(P[A].lat, P[A].lon), pb = await mp(P[B].lat, P[B].lon);
  await page.locator('#btn-measure').click(); await page.waitForTimeout(100);
  t('flat map hint wording is unchanged', /^Mode ukur aktif\. Ketuk titik awal di peta\. Ikon kota juga bisa diketuk\.$/.test((await hintText(page) || '').replace(/\s+/g, ' ').trim()), await hintText(page));
  await page.mouse.click(pa.x, pa.y); await page.waitForTimeout(250); await page.mouse.click(pb.x, pb.y); await page.waitForTimeout(500);
  const h2 = await hintText(page), expKm = kmOf([P[A].lat, P[A].lon], [P[B].lat, P[B].lon]);
  t('2D: distance matches the great-circle distance', near(parseKm(h2), expKm, 0.6) && /Jalan kaki ≈ \d+ hari · berkuda ≈ \d+ hari · kapal layar ≈ \d+ hari \(estimasi kasar\)\. Ketuk titik baru untuk mengukur lagi\./.test(h2.replace(/\s+/g, ' ')), h2);
  t('2D: three tooltips (one per world copy) and the pressed state', (await page.locator('.measure-tip').count()) === 3 && (await pressed(page)) === 'true');
  // carry the result into the globe and into the working map, then back
  await page.locator('#btn-view').click(); await page.waitForFunction(() => window.__rhGlobe && window.__rhGlobe.isShown(), null, { timeout: 90000 }); await page.waitForTimeout(800);
  const g = await page.evaluate(() => window.__rhGlobe._layers.measure());
  t('the finished measurement follows into the globe (same points, same line)', !!g && g.pts.length === 241 && near(g.a[0], P[A].lat, 1e-9) && near(g.b[0], P[B].lat, 1e-9) && near(parseKm(g.label), expKm, 0.6), JSON.stringify(g && { a: g.a, b: g.b, label: g.label }));
  t('entering another view ends measure mode (no hint, button not pressed)', (await hintText(page)) === null && (await pressed(page)) === 'false');
  await page.locator('#btn-disk').click(); await page.waitForFunction(() => window.__rhDisk && window.__rhDisk.isShown() && window.__rhDisk.info().sheet, null, { timeout: 60000 }); await page.waitForTimeout(700);
  const d = await page.evaluate(() => window.__rhDisk._measure());
  t('… and into the working map', !!d && d.pts.length === 241 && near(d.b[0], P[B].lat, 1e-9));
  await page.locator('#btn-disk').click(); await page.waitForFunction(() => !document.body.classList.contains('in-disk'), null, { timeout: 30000 }); await page.waitForTimeout(700);
  t('back on the flat map the line and the three tooltips are drawn again, without a stale hint', (await page.locator('.measure-tip').count()) === 3 && (await hintText(page)) === null);
  // "Ukur dari sini" from a flat-map popup
  await page.evaluate((i) => { document.getElementById('btn-measure').getAttribute('aria-pressed') === 'true' && document.getElementById('btn-measure').click(); }, A);
  await page.locator('#mhint-x').click({ trial: true }).catch(() => {});
  await page.evaluate(([la, lo]) => window.__rhMap.setView([la, lo], 6, { animate: false }), [P.aurelia.lat, P.aurelia.lon]); await page.waitForTimeout(500);
  const pm = await mp(P.aurelia.lat, P.aurelia.lon); await page.mouse.click(pm.x, pm.y); await page.waitForTimeout(500);
  const had = await page.locator('.act[data-measure]').count();
  if (had) { await page.locator('.act[data-measure]').first().click(); await page.waitForTimeout(300); t('2D popup "Ukur dari sini" starts a measurement from the place', (await pressed(page)) === 'true' && /Titik awal terpasang/.test(await hintText(page) || '')); }
  else t('2D popup opened for "Ukur dari sini"', false);
  t('no console errors or warnings', ev.errors.length === 0 && ev.console.length === 0, JSON.stringify([ev.errors, ev.console]));
  await ctx.close();
});

// ================================================================== 4. phone: touch, result card, epistemic strip stays visible
await run('phone: tap to measure on the globe; the epistemic strip moves below the result card', async () => {
  const { ctx, page, ev } = await open('3d', { viewport: { width: 390, height: 844 }, touch: true, dpr: 2 });
  await setGlobe(page, 15, -40, 1.3); await page.waitForTimeout(600);
  await page.locator('#btn-measure').tap(); await page.waitForTimeout(300);
  const A = 'litus_primum', B = 'aventalia', pa = await globePx(page, A), pb = await globePx(page, B);
  await page.touchscreen.tap(pa.x, pa.y); await page.waitForTimeout(300); await page.touchscreen.tap(pb.x, pb.y); await page.waitForTimeout(700);
  const expKm = kmOf([P[A].lat, P[A].lon], [P[B].lat, P[B].lon]);
  t('two taps on markers measure the exact distance', near(parseKm(await hintText(page)), expKm, 0.6), await hintText(page));
  const box = await page.evaluate(() => { const h = document.getElementById('mhint').getBoundingClientRect(), e = document.querySelector('#globe .g-epi').getBoundingClientRect(), tip = document.querySelector('.g-mtip'); return { hb: h.bottom, et: e.top, tip: getComputedStyle(tip).display, W: innerWidth, hr: h.right }; });
  t(`the epistemic chips sit below the result card (card bottom ${box.hb.toFixed(0)} ≤ chips top ${box.et.toFixed(0)})`, box.et >= box.hb - 1, JSON.stringify(box));
  t('the card fits the phone width; the duplicate result box on the globe is hidden', box.hr <= box.W && box.tip === 'none');
  await page.locator('#mhint-x').tap(); await page.waitForTimeout(300);
  t('after "Selesai" the chips return to their normal place', await page.evaluate(() => !document.body.classList.contains('has-mhint') && document.querySelector('#globe .g-epi').getBoundingClientRect().top < 140));
  t('no console errors or warnings', ev.errors.length === 0 && ev.console.length === 0, JSON.stringify([ev.errors, ev.console]));
  await ctx.close();
});

await browser.close(); await srv.close();
console.log(`\nmeasure: ${pass} passed, ${fail} failed${fail ? '\nFAILED: ' + failures.join(' | ') : ''}`);
process.exit(fail ? 1 : 0);
