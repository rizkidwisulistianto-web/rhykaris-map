// Documentation screenshots for README / PR (docs/images/01…10, JPEG). Deterministic states, production fonts if a font cache is given.
//   RH_FONTS=/path/to/fonts-cache node docshots.mjs <outdir>        (cache = fonts.css + map.json + *.woff2: the families the viewer asks Google Fonts for)
// The cache can be built from the @fontsource npm packages (cinzel, cormorant-garamond, ibm-plex-sans, ibm-plex-mono; latin + latin-ext,
// weights/styles as in the <link> of index.html): one @font-face per file, src = a fake https://fonts.gstatic.com/… URL, map.json = URL → file.
// 01–05 are the light-theme flat-map pictures (world, place popup, territory card + Layer tab, Audit tab, phone); 06–10 are the dark 3D/disk ones.
// 'sp' makes social-preview.jpg (1280×640): a chrome-free capture of the world map behind a shade, plus the title card (needs Cormorant Garamond 700 in the cache).
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './lib/server.mjs';
import { launch, newPage, waitForMap } from './lib/browser.mjs';
const out = path.resolve(process.argv[2] || '.'); fs.mkdirSync(out, { recursive: true });
const fontsDir = process.env.RH_FONTS;
const only = process.argv[3] ? process.argv[3].split(',') : null;   // optional: node docshots.mjs <outdir> 01,05,09  (02 makes 02 and 03)
const want = (n) => !only || only.includes(n);
const srv = await startServer(), browser = await launch();

async function page(vp, o = {}) {
  const r = await newPage(browser, { viewport: vp, deviceScaleFactor: o.dsf || 1, hasTouch: !!o.touch, isMobile: !!o.touch, colorScheme: o.scheme || 'dark' });
  if (fontsDir) {   // serve the Google Fonts CSS and files from the local cache (later routes win over the abort in newPage)
    const map = JSON.parse(fs.readFileSync(path.join(fontsDir, 'map.json'), 'utf8'));
    await r.page.route(/^https:\/\/fonts\.googleapis\.com\//, (rt) => rt.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(fontsDir, 'fonts.css'), 'utf8').replace(/url\((https:\/\/fonts\.gstatic\.com[^)]*)\)/g, (_, u) => `url(${u})`) }));
    await r.page.route(/^https:\/\/fonts\.gstatic\.com\//, (rt) => { const f = map[rt.request().url()]; if (!f) return rt.abort(); rt.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(path.join(fontsDir, f)), headers: { 'access-control-allow-origin': '*' } }); });
  }
  await r.page.addInitScript((pm) => { try { localStorage.clear(); if (pm) localStorage.setItem('rh-panel', 'false'); } catch (e) {} }, !!o.touch || !!o.closed);
  return r;
}
const ready = (p, which = '3d') => p.waitForFunction((w) => (w === '3d' ? window.__rhGlobe && window.__rhGlobe.isShown() && window.__rhGlobe.info().frames >= 8 : window.__rhDisk && window.__rhDisk.isShown() && window.__rhDisk.info().sheet), which, { timeout: 90000 });
const settle = (p, ms = 900) => p.evaluate(() => document.fonts && document.fonts.ready).then(() => p.waitForTimeout(ms));
const still = (p) => p.evaluate(() => { const g = window.__rhGlobe; g._state.spin = false; g._S.cancelFly(); g._S.inertia = null; g._bodies.setSpeed(0); g._bodies.setSimDays(7.4); });   // moon clock frozen too, so a slow software renderer cannot drift the chosen phase
const moonAt = (p, box) => p.evaluate(([x0, x1, y0, y1]) => { const g = window.__rhGlobe, b = g._bodies, S = g._S; let best = 7.4; for (let d = 0; d < 12.1; d += 0.1) { b.setSimDays(d); S.render(); if (b.positions().some((m) => m.vis && m.sx > x0 && m.sx < x1 && m.sy > y0 && m.sy < y1)) { best = d; break; } } b.setSimDays(best); S.dirty(); return best; }, box);   // first phase with a moon inside the box (screen px)
const phase = (p, maxX) => p.evaluate(async (mx) => {   // illustrative phase: both moons visible, left of x = mx, clear of the planet disc (centre ≈ 985,450) and its label
  const g = window.__rhGlobe, b = g._bodies, S = g._S; let best = null;
  for (let d = 0; d < 12.1; d += 0.35) { b.setSimDays(d); S.render(); const pos = b.positions(); if (pos.every((q) => q.vis && q.sx < mx && q.sx > 400 && q.sy > 90 && q.sy < 780 && Math.hypot(q.sx - 985, q.sy - 450) > 230)) { best = d; break; } }
  if (best == null) best = 7.4; b.setSimDays(best); S.dirty(); return best; }, maxX);
const shot = (p, name) => p.screenshot({ path: path.join(out, name + '.jpg'), type: 'jpeg', quality: 90 });
const frame = (p, n = 4) => p.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

const flat = (p) => waitForMap(p, { timeout: 90000 });
const popup = (p) => p.waitForFunction(() => { const e = document.querySelector('.leaflet-popup'); return e && getComputedStyle(e).opacity === '1' && !window.__rhMap._animatingZoom; }, null, { timeout: 30000 }).then(() => p.waitForTimeout(900));   // open, fully faded in, map no longer panning
if (want('01')) { // 01 — the whole map, panel closed
  const { ctx, page: p } = await page({ width: 1600, height: 900 }, { scheme: 'light', closed: true });
  await p.goto(srv.url); await flat(p); await p.mouse.move(30, 880); await settle(p, 1500);
  await shot(p, '01-world-map'); await ctx.close();
}
if (want('02')) { // 02 — a place popup found through the search (Litus Primum), and 03 — a territory card beside the Layer tab (Hesperia), one session
  const { ctx, page: p } = await page({ width: 1600, height: 900 }, { scheme: 'light' });
  await p.goto(srv.url); await flat(p);
  await p.locator('#q').fill('Litus'); await p.locator('#results .res').first().click(); await popup(p);
  await p.waitForTimeout(1500); await p.mouse.move(30, 880); await settle(p, 1200);
  await shot(p, '02-popup-lore');
  await p.locator('.leaflet-popup-close-button').first().click(); await p.locator('#tab-layer').click();
  await p.evaluate(() => { window.__rhMap.setView([-20, -20], 3.4, { animate: false }); }); await p.waitForTimeout(1200);
  const [x, y] = await p.evaluate(() => { const c = window.__rhMap.latLngToContainerPoint([-14, -26]); return [c.x, c.y]; });
  await p.mouse.click(x, y); await popup(p);   // inside Hesperia's direct land (not the marka belt)
  await p.mouse.move(30, 880); await settle(p, 1200);
  await shot(p, '03-territories'); await ctx.close();
}
if (want('04')) { // 04 — the Audit tab
  const { ctx, page: p } = await page({ width: 1600, height: 900 }, { scheme: 'light' });
  await p.goto(srv.url); await flat(p); await p.locator('#tab-audit').click(); await p.mouse.move(30, 880); await settle(p, 1500);
  await shot(p, '04-audit'); await ctx.close();
}
if (want('05')) { // 05 — the flat map on a phone (bottom-sheet panel collapsed)
  const { ctx, page: p } = await page({ width: 390, height: 844 }, { dsf: 2, touch: true, scheme: 'light' });
  await p.goto(srv.url); await flat(p);
  await p.evaluate(() => { window.__rhMap.setView([-14, -4], 2.6, { animate: false }); }); await p.waitForTimeout(1200); await settle(p, 1200);
  await shot(p, '05-mobile'); await ctx.close();
}
if (want('sp')) { // social-preview — the world map (chrome hidden, dark) behind a shade, with the title card; 1280×640
  const cap = await page({ width: 1920, height: 1080 }, { closed: true });
  await cap.page.goto(srv.url); await flat(cap.page);
  await cap.page.addStyleTag({ content: '#app > *:not(#map), .leaflet-control-container { display: none !important }' }); await settle(cap.page, 1500);
  const bg = (await cap.page.screenshot({ type: 'jpeg', quality: 92 })).toString('base64'); await cap.ctx.close();
  const { ctx, page: p } = await page({ width: 1280, height: 640 });
  const sigil = '<svg class="sigil" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" stroke-opacity=".35"/><path d="M1.8 16.5c4.2-7.9 9.1-11 14.2-11s10 3.1 14.2 11" fill="none" stroke="#ff6433" stroke-width="2.2" stroke-linecap="round"/><path d="M1.8 16.5c4.2-7.9 9.1-11 14.2-11s10 3.1 14.2 11" fill="none" stroke="#ffab6b" stroke-width=".8" stroke-linecap="round"/><circle cx="16" cy="21.5" r="1.6" fill="currentColor"/></svg>';
  await p.setContent(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,700;1,500&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@500&display=swap">
<style>html,body{margin:0;width:1280px;height:640px;overflow:hidden;background:#0a1018}
.bg{position:absolute;left:-121px;top:-263px;width:1920px;height:1080px}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,13,21,.95) 0,rgba(8,13,21,.9) 38%,rgba(8,13,21,.55) 62%,rgba(8,13,21,.22) 100%),linear-gradient(0deg,rgba(8,13,21,.55),rgba(8,13,21,0) 45%)}
.frame{position:absolute;inset:18px;border:1px solid rgba(255,255,255,.2);border-radius:12px}
.sigil{position:absolute;left:76px;top:66px;width:52px;height:52px;color:#e9e4da}
.kicker{position:absolute;left:77px;top:156px;font:500 16px/1 'IBM Plex Mono',monospace;letter-spacing:.26em;color:#ff8a4c}
h1{position:absolute;left:77px;top:190px;margin:0;font:700 88px/83px 'Cormorant Garamond',serif;text-transform:uppercase;letter-spacing:.01em;color:#f4ead6}
.sub{position:absolute;left:77px;top:384px;font:italic 500 32px/1 'Cormorant Garamond',serif;color:#eadfca}
.chips{position:absolute;left:77px;top:451px;display:flex;gap:11px}
.chip{font:500 15px/1 'IBM Plex Sans',sans-serif;color:#e8e4dc;padding:10px 14px;border:1px solid rgba(255,255,255,.35);border-radius:999px}
.url{position:absolute;left:77px;top:577px;font:400 16px/1 'IBM Plex Mono',monospace;color:#a9b0b9}</style>
<img class="bg" src="data:image/jpeg;base64,${bg}"><div class="shade"></div><div class="frame"></div>${sigil}
<div class="kicker">INTERACTIVE ATLAS · ORIGINAL FANTASY WORLD</div><h1>Master Map<br>Rhykaris</h1>
<div class="sub">Two hemispheres. One scar. A world you can measure.</div>
<div class="chips"><span class="chip">Equirectangular · 12.7 km/px</span><span class="chip">Territories · AS 1647</span><span class="chip">Search &amp; lore popups</span></div>
<div class="url">github.com/rizkidwisulistianto-web/rhykaris-map</div>`);
  await settle(p, 1200);
  await shot(p, 'social-preview'); await ctx.close();
}
if (want('06')) { // 06 — the globe (with a moon in frame)
  const { ctx, page: p } = await page({ width: 1600, height: 900 });
  await p.goto(srv.url + '?view=3d'); await ready(p); await still(p);
  await p.locator('#tab-globe').click();
  await p.evaluate(() => { const S = window.__rhGlobe._S; S.view.lat = 22; S.view.lon = -4; S.view.dist = S.defaultDist() * 1.12; S.dirty(); }); await frame(p);
  await moonAt(p, [1200, 1290, 130, 680]);
  await p.mouse.move(30, 880); await frame(p); await settle(p);
  await shot(p, '06-globe-3d'); await ctx.close();
}
if (want('07')) { // 07 — the two moons (not to scale) and a moon card
  const { ctx, page: p } = await page({ width: 1600, height: 900 });
  await p.goto(srv.url + '?view=3d'); await ready(p); await still(p);
  await p.evaluate(() => { window.__rhGlobe.viewMoonSystem(); }); await p.waitForTimeout(2200); await still(p);
  await p.evaluate(() => { const S = window.__rhGlobe._S; S.view.dist *= 0.82; S.dirty(); }); await frame(p);
  await phase(p, 1000);
  await p.evaluate(() => { window.__rhGlobe.openMoon('bulan_besar'); }); await p.mouse.move(30, 880); await frame(p); await settle(p);
  await shot(p, '07-moons'); await ctx.close();
}
if (want('08')) { // 08 — relief
  const { ctx, page: p } = await page({ width: 1600, height: 900 });
  await p.goto(srv.url + '?view=3d'); await ready(p); await still(p);
  await p.locator('#tab-globe').click(); await p.locator('#g-relief').check(); await p.waitForFunction(() => /^aktif/.test(document.getElementById('g-relief-st').textContent), null, { timeout: 120000 });
  await p.locator('#g-exag').fill('32');
  await p.evaluate(() => { const c = window.__rhGlobe._ctx, S = window.__rhGlobe._S; ['markers', 'labels', 'g_moons', 'g_orbits', 'g_axis', 'g_ecl', 'grat', 'mer', 'anom'].forEach((k) => c.setLayer(k, false)); S.view.lat = 19; S.view.lon = 60; S.view.dist = 1.9; S.dirty(); document.querySelector('#sec-globe').scrollIntoView(); document.querySelector('.pbody').scrollTop = 9999; });
  await p.mouse.move(30, 880); await frame(p, 5); await settle(p);
  await shot(p, '08-relief'); await ctx.close();
}
if (want('09')) { // 09 — dual-disk working map
  const { ctx, page: p } = await page({ width: 1600, height: 900 });
  await p.goto(srv.url + '?view=disk'); await ready(p, 'disk'); await settle(p, 1200);
  await p.mouse.move(1400, 90);
  await shot(p, '09-dual-disk'); await ctx.close();
}
if (want('10')) { // 10 — globe on a phone
  const { ctx, page: p } = await page({ width: 390, height: 844 }, { dsf: 2, touch: true });
  await p.goto(srv.url + '?view=3d'); await ready(p); await still(p);
  await p.evaluate(() => { const S = window.__rhGlobe._S; S.view.lat = 14; S.view.lon = 4; S.dirty(); }); await frame(p); await moonAt(p, [30, 260, 540, 640]); await frame(p); await settle(p);
  await shot(p, '10-mobile-globe'); await ctx.close();
}
await browser.close(); await srv.close(); console.log('screenshots →', out);
