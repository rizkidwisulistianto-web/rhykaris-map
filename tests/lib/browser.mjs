// Playwright helpers: launch Chromium (SwiftShader WebGL), serve CDN libraries from node_modules so the tests work
// offline / behind an egress proxy, and collect console + network evidence.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const nm = (p) => path.resolve(HERE, '..', 'node_modules', p);

export const LEAFLET_JS = () => fs.readFileSync(nm('leaflet/dist/leaflet.js'));
export const THREE_MODULE_MIN = () => fs.readFileSync(nm('three/build/three.module.min.js'));

const CDN_LEAFLET = /^https:\/\/(cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/leaflet\.js|unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js|cdn\.jsdelivr\.net\/npm\/leaflet@1\.9\.4\/dist\/leaflet\.js)/;
const CDN_THREE = /^https:\/\/(cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/|cdn\.jsdelivr\.net\/npm\/three@|unpkg\.com\/three@)/;
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

export async function launch({ headless = true } = {}) {
  const exe = process.env.RH_CHROMIUM || undefined;
  return chromium.launch({
    headless, executablePath: exe,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
  });
}

/**
 * @param {import('playwright-core').Browser} browser
 * @param {object} o  viewport, colorScheme, reducedMotion, hasTouch, isMobile, deviceScaleFactor
 *   cdn: 'local' (serve leaflet/three from node_modules), 'fail' (abort all CDN), 'three-fail' (leaflet ok, three aborted)
 */
export async function newPage(browser, o = {}) {
  const ctx = await browser.newContext({
    viewport: o.viewport || { width: 1440, height: 900 }, deviceScaleFactor: o.deviceScaleFactor || 1,
    colorScheme: o.colorScheme || 'dark', reducedMotion: o.reducedMotion || 'no-preference',
    hasTouch: !!o.hasTouch, isMobile: !!o.isMobile, serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const ev = { console: [], errors: [], requests: [], failed: [] };
  page.on('console', (m) => { const t = m.type(); if ((t === 'error' || t === 'warning') && !FONTS.test(m.location().url || '')) ev.console.push(`${t}: ${m.text()} (${m.location().url || ''})`); });
  page.on('pageerror', (e) => ev.errors.push(String(e && e.stack || e)));
  page.on('request', (r) => ev.requests.push(r.url()));
  page.on('requestfailed', (r) => { if (!FONTS.test(r.url())) ev.failed.push(`${r.url()} ${r.failure() && r.failure().errorText}`); });
  const cdn = o.cdn || 'local';
  await page.route(FONTS, (r) => r.abort());        // fonts are irrelevant to the tests (and keep screenshots deterministic)
  await page.route(CDN_LEAFLET, (r) => cdn === 'fail' ? r.abort() : r.fulfill({ status: 200, contentType: 'text/javascript', body: LEAFLET_JS(), headers: { 'access-control-allow-origin': '*' } }));
  await page.route(CDN_THREE, (r) => cdn === 'local' ? r.fulfill({ status: 200, contentType: 'text/javascript', body: THREE_MODULE_MIN(), headers: { 'access-control-allow-origin': '*' } }) : r.abort());
  return { ctx, page, ev };
}

export async function waitForMap(page, { timeout = 30000 } = {}) {
  await page.waitForFunction(() => window.__rhMap && document.querySelectorAll('.leaflet-image-layer').length > 0 &&
    Array.prototype.every.call(document.querySelectorAll('.leaflet-image-layer'), (i) => i.complete && i.naturalWidth > 0), null, { timeout });
  await page.waitForTimeout(500);
}
