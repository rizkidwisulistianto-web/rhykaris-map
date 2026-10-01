// Basic accessibility checks for the Stage 2 UI: accessible names, keyboard flow, focus visibility, text contrast (dark + light), reduced motion, narrow screens.
//   node a11y.mjs
import { startServer } from './lib/server.mjs';
import { launch, newPage } from './lib/browser.mjs';
let pass = 0, fail = 0; const failures = [];
const t = (name, ok, detail = '') => { if (ok) pass++; else { fail++; failures.push(name); console.log(`FAIL  ${name} ${detail}`); } };
const srv = await startServer(), browser = await launch();

// ---- in-page helpers (injected as source so they can be reused)
const HELPERS = `
window.__ax = {
  name(el) { return (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby')) && document.getElementById(el.getAttribute('aria-labelledby')).innerText) || (el.labels && el.labels[0] && el.labels[0].innerText) || (el.closest('label') && el.closest('label').innerText) || el.innerText || el.title || '').trim(); },
  parse(c) { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return [0, 0, 0, 1]; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; },
  bg(el) { let layers = []; for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor, p = this.parse(c); if (p[3] > 0) layers.push(p); if (p[3] >= 1) break; }
    let base = this.parse(getComputedStyle(document.documentElement).getPropertyValue('--void') ? '' : ''); const root = getComputedStyle(document.body).backgroundColor, b = this.parse(root); let out = [b[0], b[1], b[2]];
    const v = getComputedStyle(document.documentElement).getPropertyValue('--void').trim(); if (/^#/.test(v)) { const h = v.slice(1); out = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
    for (let i = layers.length - 1; i >= 0; i--) { const a = layers[i][3]; out = [layers[i][0] * a + out[0] * (1 - a), layers[i][1] * a + out[1] * (1 - a), layers[i][2] * a + out[2] * (1 - a)]; } return out; },
  lum(c) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); },
  ratio(el) { const fg = this.parse(getComputedStyle(el).color), bg = this.bg(el); const a = fg[3], f = [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)]; const l1 = this.lum(f), l2 = this.lum(bg); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
};`;

for (const scheme of ['dark', 'light']) {
  const { ctx, page, ev } = await newPage(browser, { colorScheme: scheme });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.addInitScript(HELPERS);
  await page.goto(srv.url + '?view=3d', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__rhGlobe && window.__rhGlobe.isShown() && window.__rhGlobe.info().frames >= 5, null, { timeout: 60000 });
  await page.locator('#tab-globe').click();
  // a. accessible names
  const unnamed = await page.evaluate(() => Array.from(document.querySelectorAll('#btn-view, #btn-disk, #btn-view-m, #btn-disk-m, #g-dock button, #sec-globe input, #sec-globe button, canvas.g-canvas, #compass, #v2-toast, #g-card')).filter((e) => !e.hidden && getComputedStyle(e).display !== 'none' && !window.__ax.name(e) && e.id !== 'g-card' && e.id !== 'v2-toast').map((e) => e.id || e.className));
  t(`[${scheme}] every new control has an accessible name`, unnamed.length === 0, unnamed.join());
  t(`[${scheme}] toast is a polite live region, compass and canvas have roles/labels`, await page.evaluate(() => document.getElementById('v2-toast').getAttribute('role') === 'status' && document.getElementById('v2-toast').getAttribute('aria-live') === 'polite' && /Kompas/.test(document.getElementById('compass').getAttribute('aria-label')) && document.querySelector('canvas.g-canvas').getAttribute('role') === 'application'));
  t(`[${scheme}] sliders and the relief checkbox are labelled`, await page.evaluate(() => ['g-period', 'g-mspeed', 'g-exag'].every((id) => !!document.getElementById(id).getAttribute('aria-label')) && !!window.__ax.name(document.getElementById('g-relief'))));
  // b. contrast of panel text (map labels carry their own halo and are theme-independent, like the 2D labels)
  const sels = ['#sec-globe .gctl .note', '#sec-globe label.row span', '#sec-globe .btn', '#globe .g-epi > span', '#compass .cp-l1', '#compass .cp-l2', '#compass .cp-l3', '#compass .cp-key', '#g-dock .tbtn', '#btn-view', '#sec-globe h3'];
  const bad = await page.evaluate((ss) => ss.flatMap((s) => Array.from(document.querySelectorAll(s)).filter((e) => !e.hidden && e.offsetParent !== null).slice(0, 3).map((e) => [s, +window.__ax.ratio(e).toFixed(2)])).filter((x) => x[1] < 4.5), sels);
  t(`[${scheme}] panel text contrast ≥ 4.5 : 1 (${bad.map((b) => b.join('=')).join(', ') || 'all pass'})`, bad.length === 0, JSON.stringify(bad));
  // c. keyboard: markers reachable and operable, focus ring visible on the dock
  await page.evaluate(() => { const g = window.__rhGlobe; g._state.spin = false; g._S.view.lat = -5; g._S.view.lon = 3; g._S.view.dist = 2.4; g._S.dirty(); }); await page.waitForTimeout(600);
  const mk = await page.evaluate(() => { const m = Array.from(document.querySelectorAll('#globe .g-pin .mk')).find((e) => e.parentElement.parentElement.style.display !== 'none'); if (m) m.focus(); return m ? m.getAttribute('aria-label') : null; });
  t(`[${scheme}] a projected marker is keyboard-focusable and labelled (${mk})`, !!mk && /status koordinat/.test(mk));
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  t(`[${scheme}] Enter on a focused marker opens its card; Esc closes it`, await page.evaluate(() => !document.getElementById('g-card').hidden) && (await page.keyboard.press('Escape'), await page.evaluate(() => document.getElementById('g-card').hidden)));
  await page.locator('#g-dock-focus').focus(); const ring = await page.evaluate(() => { const e = document.activeElement, s = getComputedStyle(e); return { w: parseFloat(s.outlineWidth), st: s.outlineStyle, id: e.id }; });
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  const ring2 = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { w: parseFloat(s.outlineWidth), st: s.outlineStyle }; });
  t(`[${scheme}] keyboard focus on a dock button shows an outline (${ring2.w}px ${ring2.st})`, ring2.w >= 2 && ring2.st !== 'none');
  t(`[${scheme}] no console errors`, ev.errors.length === 0 && ev.console.length === 0, JSON.stringify([ev.errors, ev.console]));
  await ctx.close();
}

// d. disk view: labels, names, contrast, keyboard
{
  const { ctx, page } = await newPage(browser, { colorScheme: 'dark' });
  await page.addInitScript(HELPERS);
  await page.goto(srv.url + '?view=disk', { waitUntil: 'load' }); await page.waitForFunction(() => window.__rhDisk && window.__rhDisk.isShown() && window.__rhDisk.info().sheet, null, { timeout: 60000 });
  const un = await page.evaluate(() => Array.from(document.querySelectorAll('#d-dock button, canvas.d-canvas, #btn-disk')).filter((e) => !window.__ax.name(e)).map((e) => e.id));
  t('[disk] dock, canvas and toggle are named', un.length === 0, un.join());
  const bad = await page.evaluate(() => ['#disk .d-note > span', '#d-dock .tbtn'].flatMap((s) => Array.from(document.querySelectorAll(s)).slice(0, 4).map((e) => [s, +window.__ax.ratio(e).toFixed(2)])).filter((x) => x[1] < 4.5));
  t(`[disk] note chips and dock contrast ≥ 4.5 : 1 (${bad.map((b) => b.join('=')).join(', ') || 'all pass'})`, bad.length === 0);
  await page.locator('canvas.d-canvas').focus(); const c0 = await page.evaluate(() => window.__rhDisk.info().cx); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
  t('[disk] arrow keys pan the map from the keyboard', (await page.evaluate(() => window.__rhDisk.info().cx)) > c0);
  await ctx.close();
}

// e. reduced motion and narrow screens
{
  const { ctx, page } = await newPage(browser, { reducedMotion: 'reduce' });
  await page.goto(srv.url + '?view=3d', { waitUntil: 'load' }); await page.waitForFunction(() => window.__rhGlobe && window.__rhGlobe.isShown(), null, { timeout: 60000 });
  t('[reduced motion] needle transitions and the fade are disabled', await page.evaluate(() => getComputedStyle(document.querySelector('#compass .cp-needle')).transitionDuration.split(',')[0].trim() === '0s' && !document.getElementById('globe').classList.contains('fade')));
  await ctx.close();
  for (const mode of ['3d', 'disk']) {
    const r = await newPage(browser, { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
    await r.page.addInitScript(() => { try { localStorage.setItem('rh-panel', 'false'); } catch (e) {} });
    await r.page.goto(srv.url + '?view=' + mode, { waitUntil: 'load' }); await r.page.waitForFunction((m) => (m === '3d' ? window.__rhGlobe && window.__rhGlobe.isShown() : window.__rhDisk && window.__rhDisk.isShown() && window.__rhDisk.info().sheet), mode, { timeout: 60000 }); await r.page.waitForTimeout(400);
    const ov = await r.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    t(`[320 px wide, ${mode}] no horizontal page scroll (${ov.sw} ≤ ${ov.iw})`, ov.sw <= ov.iw);
    await r.ctx.close();
  }
}
await browser.close(); await srv.close();
console.log(`\na11y: ${pass} passed, ${fail} failed${fail ? '\nFAILED: ' + failures.join(' | ') : ''}`); process.exit(fail ? 1 : 0);
