// 2D regression guard.
//   node regress2d.mjs capture <dir>   → write baseline PNGs + facts.json into <dir>
//   node regress2d.mjs compare <dir>   → re-shoot, diff against <dir> (new v2 chrome is hidden with .v2-chrome), write diffs
// RH_ROOT=<folder> points the tests at another checkout of the site (e.g. an old main) instead of this repository.
// Run "capture" on a clean checkout of main, "compare" on the feature branch.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { startServer, ROOT } from './lib/server.mjs';
import { launch, newPage, waitForMap } from './lib/browser.mjs';

const [mode, dirArg] = process.argv.slice(2);
if (!['capture', 'compare'].includes(mode) || !dirArg) { console.error('usage: regress2d.mjs capture|compare <dir>'); process.exit(2); }
const DIR = path.resolve(dirArg), SITE = process.env.RH_ROOT ? path.resolve(process.env.RH_ROOT) : ROOT;
fs.mkdirSync(DIR, { recursive: true });

const HIDE_V2 = '.v2-chrome{display:none !important}';
const PRESETS = { cland: true, csea: true, banks: true };
const view = (la, lo, z) => (p) => p.evaluate(([a, b, c]) => { window.__rhMap.setView([a, b], c, { animate: false }); }, [la, lo, z]);
const wait = (ms) => (p) => p.waitForTimeout(ms);
// measure tool on the flat map: two marker taps, so the dashed line, the dots, the tooltips and the hint card are all in the picture
const PLACES = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/data.json'), 'utf8')).places.map((q) => [q.id, q]));
const measure = (a, b, z) => async (p) => {
  const A = PLACES[a], B = PLACES[b];
  await p.evaluate(([x, y, zz]) => { window.__rhMap.setView([(x[0] + y[0]) / 2, (x[1] + y[1]) / 2], zz, { animate: false }); }, [[A.lat, A.lon], [B.lat, B.lon], z]);
  await p.waitForTimeout(500); await p.click('#btn-measure'); await p.waitForTimeout(150);
  for (const q of [A, B]) {
    const pt = await p.evaluate(([la, lo]) => { const m = window.__rhMap, c = m.latLngToContainerPoint([la, lo]), r = m.getContainer().getBoundingClientRect(); return { x: r.x + c.x, y: r.y + c.y }; }, [q.lat, q.lon]);
    await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(250);
  }
  await p.waitForTimeout(300);
};
const SCENES = [
  { n: 'd-dark-world', vp: [1440, 900], scheme: 'dark' },
  { n: 'd-dark-sinus', vp: [1440, 900], scheme: 'dark', run: [view(-2.3, 0, 5), wait(500)] },
  { n: 'd-dark-scar', vp: [1440, 900], scheme: 'dark', run: [view(-55.5, 0, 3), wait(500)] },
  { n: 'd-dark-ellumat', vp: [1440, 900], scheme: 'dark', run: [view(55.5, 178, 3), wait(500)] },
  { n: 'd-dark-layers', vp: [1440, 900], scheme: 'dark', run: [(p) => p.click('#tab-layer'), wait(200)] },
  { n: 'd-dark-audit', vp: [1440, 900], scheme: 'dark', run: [(p) => p.click('#tab-audit'), wait(200)] },
  { n: 'd-dark-popup', vp: [1440, 900], scheme: 'dark', hash: '#litus_primum', run: [wait(1200)] },
  { n: 'd-dark-contours', vp: [1440, 900], scheme: 'dark', layers: PRESETS, run: [view(-10, 20, 3.5), wait(700)] },
  { n: 'd-dark-readout', vp: [1440, 900], scheme: 'dark', run: [(p) => p.mouse.move(700, 450), wait(300)] },
  { n: 'd-light-world', vp: [1440, 900], scheme: 'light' },
  { n: 'd-light-popup', vp: [1440, 900], scheme: 'light', hash: '#dies_ignis', run: [wait(1200)] },
  { n: 'm-dark-world', vp: [390, 844], scheme: 'dark', mobile: true },
  { n: 'm-light-world', vp: [390, 844], scheme: 'light', mobile: true },
  { n: 'm-dark-panel', vp: [390, 844], scheme: 'dark', mobile: true, run: [(p) => p.click('#btn-panel'), wait(400)] },
  { n: 'd-dark-measure', vp: [1440, 900], scheme: 'dark', run: [measure('litus_primum', 'aventalia', 4)] },
  { n: 'd-light-measure', vp: [1440, 900], scheme: 'light', run: [measure('aurelia', 'dies_ignis', 5)] },
];

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }

const srv = await startServer({ root: SITE });
const browser = await launch();
const facts = { hashes: {}, scenes: {}, data: null, load: null, requests2D: null };
for (const dirName of ['assets', 'data']) for (const f of walk(path.join(SITE, dirName)).sort()) facts.hashes[path.relative(SITE, f)] = sha(f);

let totalDiff = 0, failures = 0;
for (const s of SCENES) {
  const { ctx, page, ev } = await newPage(browser, { viewport: { width: s.vp[0], height: s.vp[1] }, colorScheme: s.scheme, reducedMotion: 'reduce', hasTouch: !!s.mobile, isMobile: !!s.mobile });
  await page.addInitScript(([layers, mobile]) => {
    try { localStorage.clear(); if (layers) localStorage.setItem('rh-layers-v1', JSON.stringify(layers)); if (mobile) localStorage.setItem('rh-panel', 'false'); } catch (e) {}
  }, [s.layers || null, !!s.mobile]);
  if (mode === 'compare') await page.addStyleTag({ content: '' }).catch(() => {});
  await page.goto(srv.url + (s.hash || ''), { waitUntil: 'load' });
  if (mode === 'compare') await page.addStyleTag({ content: HIDE_V2 });
  await waitForMap(page);
  for (const step of s.run || []) await step(page);
  await page.waitForTimeout(250);
  const png = await page.screenshot({ animations: 'disabled', caret: 'hide' });
  const file = path.join(DIR, s.n + '.png');
  if (mode === 'capture') { fs.writeFileSync(file, png); }
  else {
    const a = PNG.sync.read(fs.readFileSync(file)), b = PNG.sync.read(png);
    if (a.width !== b.width || a.height !== b.height) { console.log(`FAIL ${s.n}: size ${a.width}x${a.height} vs ${b.width}x${b.height}`); failures++; }
    else {
      const out = new PNG({ width: a.width, height: a.height });
      const n = pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: 0.1 });
      totalDiff += n; facts.scenes[s.n] = { diff: n };
      if (n > 0) { fs.writeFileSync(path.join(DIR, s.n + '.diff.png'), PNG.sync.write(out)); fs.writeFileSync(path.join(DIR, s.n + '.new.png'), png); }
      console.log(`${n === 0 ? 'ok  ' : 'DIFF'} ${s.n}: ${n} px`); if (n > 0) failures++;
    }
  }
  if (ev.errors.length || ev.console.length) console.log(`  console/page errors in ${s.n}:`, ev.errors.concat(ev.console).slice(0, 5));
  await ctx.close();
}

// data counts + 2D network evidence + load time (5 cold loads)
{
  const times = []; let reqs = [];
  for (let i = 0; i < 5; i++) {
    const { ctx, page, ev } = await newPage(browser, { reducedMotion: 'reduce' });
    const t0 = Date.now();
    await page.goto(srv.url, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__rhMap && Array.prototype.every.call(document.querySelectorAll('.leaflet-image-layer'), (x) => x.complete && x.naturalWidth > 0) && document.querySelectorAll('.leaflet-image-layer').length > 0);
    times.push(Date.now() - t0);
    if (i === 0) {
      await page.waitForTimeout(800);
      facts.data = await page.evaluate(() => { const d = JSON.parse(document.getElementById('rh-data').textContent);
        return { places: d.places.length, territories: d.territories.length, routes: d.routes.length, fronts: d.fronts.length, anomalies: d.anomalies.length, contours: d.contours.length,
                 markers: document.querySelectorAll('.leaflet-marker-icon').length, layerInputs: document.querySelectorAll('#sec-layer input[type=checkbox]').length }; });
      reqs = ev.requests.map((u) => u.replace(srv.origin, '').slice(0, 120));
    }
    await ctx.close();
  }
  facts.load = { ms: times, mean: Math.round(times.reduce((a, b) => a + b, 0) / times.length) };
  facts.requests2D = reqs;
  facts.threeRequested = reqs.some((u) => /three/i.test(u));
}
await browser.close(); await srv.close();

if (mode === 'capture') { fs.writeFileSync(path.join(DIR, 'facts.json'), JSON.stringify(facts, null, 1)); console.log('baseline captured →', DIR, JSON.stringify({ data: facts.data, load: facts.load })); }
else {
  const base = JSON.parse(fs.readFileSync(path.join(DIR, 'facts.json'), 'utf8'));
  // canon files must be byte-identical; NEW files (data/moons.json, assets/3d/*) are additions, not changes
  const changed = Object.keys(base.hashes).filter((f) => facts.hashes[f] !== base.hashes[f]);
  const added = Object.keys(facts.hashes).filter((f) => !(f in base.hashes));
  const sameHash = changed.length === 0;
  if (changed.length) console.log('CANON FILES CHANGED:', changed);
  if (added.length) console.log('new files (additions):', added.join(', '));
  const sameData = JSON.stringify({ ...base.data, layerInputs: 0, markers: 0 }) === JSON.stringify({ ...facts.data, layerInputs: 0, markers: 0 });
  console.log(`canon hashes identical: ${sameHash}`); console.log(`data counts identical: ${sameData}`, JSON.stringify(facts.data));
  console.log(`2D loads three.js: ${facts.threeRequested}`); console.log(`load ms baseline ${base.load.mean} → now ${facts.load.mean}`);
  console.log(`pixel diff total: ${totalDiff}; scene failures: ${failures}`);
  process.exit(sameHash && sameData && !facts.threeRequested && failures === 0 ? 0 : 1);
}
