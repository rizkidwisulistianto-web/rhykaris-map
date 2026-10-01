// Documentation screenshots for README / PR (docs/images/06…10). Deterministic states, production fonts if a font cache is given.
//   RH_FONTS=/path/to/fonts-cache node docshots.mjs <outdir>        (cache = fonts.css + map.json + *.woff2 downloaded from Google Fonts)
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './lib/server.mjs';
import { launch, newPage } from './lib/browser.mjs';
const out = path.resolve(process.argv[2] || '.'); fs.mkdirSync(out, { recursive: true });
const fontsDir = process.env.RH_FONTS;
const srv = await startServer(), browser = await launch();

async function page(vp, o = {}) {
  const r = await newPage(browser, { viewport: vp, deviceScaleFactor: o.dsf || 1, hasTouch: !!o.touch, isMobile: !!o.touch });
  if (fontsDir) {   // serve the Google Fonts CSS and files from the local cache (later routes win over the abort in newPage)
    const map = JSON.parse(fs.readFileSync(path.join(fontsDir, 'map.json'), 'utf8'));
    await r.page.route(/^https:\/\/fonts\.googleapis\.com\//, (rt) => rt.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(fontsDir, 'fonts.css'), 'utf8').replace(/url\((https:\/\/fonts\.gstatic\.com[^)]*)\)/g, (_, u) => `url(${u})`) }));
    await r.page.route(/^https:\/\/fonts\.gstatic\.com\//, (rt) => { const f = map[rt.request().url()]; if (!f) return rt.abort(); rt.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(path.join(fontsDir, f)), headers: { 'access-control-allow-origin': '*' } }); });
  }
  await r.page.addInitScript((pm) => { try { localStorage.clear(); if (pm) localStorage.setItem('rh-panel', 'false'); } catch (e) {} }, !!o.touch);
  return r;
}
const ready = (p, which = '3d') => p.waitForFunction((w) => (w === '3d' ? window.__rhGlobe && window.__rhGlobe.isShown() && window.__rhGlobe.info().frames >= 8 : window.__rhDisk && window.__rhDisk.isShown() && window.__rhDisk.info().sheet), which, { timeout: 90000 });
const settle = (p, ms = 900) => p.evaluate(() => document.fonts && document.fonts.ready).then(() => p.waitForTimeout(ms));
const still = (p) => p.evaluate(() => { const g = window.__rhGlobe; g._state.spin = false; g._S.cancelFly(); g._S.inertia = null; g._bodies.setSimDays(7.4); });
const phase = (p, maxX) => p.evaluate(async (mx) => {   // illustrative phase: both moons visible, left of x = mx, not behind the planet
  const g = window.__rhGlobe, b = g._bodies, S = g._S; let best = null;
  for (let d = 0; d < 12.1; d += 0.35) { b.setSimDays(d); S.render(); const pos = b.positions(); if (pos.every((q) => q.vis && q.sx < mx && q.sx > 400 && q.sy > 90 && q.sy < 780)) { best = d; break; } }
  if (best == null) best = 7.4; b.setSimDays(best); S.dirty(); return best; }, maxX);
const frame = (p, n = 4) => p.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

{ // 06 — the globe (with a moon in frame)
  const { ctx, page: p } = await page({ width: 1600, height: 900 });
  await p.goto(srv.url + '?view=3d'); await ready(p); await still(p);
  await p.locator('#tab-globe').click();
  await p.evaluate(() => { const S = window.__rhGlobe._S; S.view.lat = 22; S.view.lon = -4; S.view.dist = S.defaultDist() * 1.12; S.dirty(); }); await frame(p);
  await p.evaluate(() => { const g = window.__rhGlobe, b = g._bodies, S = g._S; let best = 7.4; for (let d = 0; d < 12.1; d += 0.3) { b.setSimDays(d); S.render(); if (b.positions().some((m) => m.vis && m.sx > 1220 && m.sx < 1500 && m.sy > 130 && m.sy < 680)) { best = d; break; } } b.setSimDays(best); S.dirty(); });
  await p.mouse.move(30, 880); await frame(p); await settle(p);
  await p.screenshot({ path: path.join(out, '06-globe-3d.png') }); await ctx.close();
}
{ // 07 — the two moons (not to scale) and a moon card
  const { ctx, page: p } = await page({ width: 1600, height: 900 });
  await p.goto(srv.url + '?view=3d'); await ready(p); await still(p);
  await p.evaluate(() => { window.__rhGlobe.viewMoonSystem(); }); await p.waitForTimeout(2200); await still(p);
  await p.evaluate(() => { const S = window.__rhGlobe._S; S.view.dist *= 0.82; S.dirty(); }); await frame(p);
  await phase(p, 1000);
  await p.evaluate(() => { window.__rhGlobe.openMoon('bulan_besar'); }); await p.mouse.move(30, 880); await frame(p); await settle(p);
  await p.screenshot({ path: path.join(out, '07-moons.png') }); await ctx.close();
}
{ // 08 — relief
  const { ctx, page: p } = await page({ width: 1600, height: 900 });
  await p.goto(srv.url + '?view=3d'); await ready(p); await still(p);
  await p.locator('#tab-globe').click(); await p.locator('#g-relief').check(); await p.waitForFunction(() => /^aktif/.test(document.getElementById('g-relief-st').textContent), null, { timeout: 120000 });
  await p.locator('#g-exag').fill('32');
  await p.evaluate(() => { const c = window.__rhGlobe._ctx, S = window.__rhGlobe._S; ['markers', 'labels', 'g_moons', 'g_orbits', 'g_axis', 'g_ecl', 'grat', 'mer', 'anom'].forEach((k) => c.setLayer(k, false)); S.view.lat = 19; S.view.lon = 60; S.view.dist = 1.9; S.dirty(); document.querySelector('#sec-globe').scrollIntoView(); document.querySelector('.pbody').scrollTop = 9999; });
  await p.mouse.move(30, 880); await frame(p, 5); await settle(p);
  await p.screenshot({ path: path.join(out, '08-relief.png') }); await ctx.close();
}
{ // 09 — dual-disk working map
  const { ctx, page: p } = await page({ width: 1600, height: 900 });
  await p.goto(srv.url + '?view=disk'); await ready(p, 'disk'); await settle(p, 1200);
  await p.mouse.move(1400, 90);
  await p.screenshot({ path: path.join(out, '09-dual-disk.png') }); await ctx.close();
}
{ // 10 — globe on a phone
  const { ctx, page: p } = await page({ width: 390, height: 844 }, { dsf: 2, touch: true });
  await p.goto(srv.url + '?view=3d'); await ready(p); await still(p);
  await p.evaluate(() => { const S = window.__rhGlobe._S; S.view.lat = 14; S.view.lon = 4; S.dirty(); }); await frame(p); await settle(p);
  await p.screenshot({ path: path.join(out, '10-mobile-globe.png') }); await ctx.close();
}
await browser.close(); await srv.close(); console.log('screenshots →', out);
