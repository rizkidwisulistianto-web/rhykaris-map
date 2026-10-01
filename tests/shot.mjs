// Dev utility: open the built viewer, optionally run a snippet, save a screenshot and print console/page errors.
//   node shot.mjs out.png [--q "?view=3d"] [--vp 1440x900] [--scheme dark|light] [--wait 2500] [--eval "js"] [--touch] [--rm]
import fs from 'node:fs';
import { startServer } from './lib/server.mjs';
import { launch, newPage } from './lib/browser.mjs';
const a = process.argv.slice(2), out = a[0];
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const [w, h] = opt('--vp', '1440x900').split('x').map(Number);
const srv = await startServer(), browser = await launch();
const { ctx, page, ev } = await newPage(browser, { viewport: { width: w, height: h }, colorScheme: opt('--scheme', 'dark'), hasTouch: a.includes('--touch'), isMobile: a.includes('--touch'), reducedMotion: a.includes('--rm') ? 'reduce' : 'no-preference', cdn: opt('--cdn', 'local') });
await page.goto(srv.url + opt('--q', '?view=3d'), { waitUntil: 'load' });
await page.waitForFunction(() => window.__rhMap, null, { timeout: 30000 });
await page.waitForTimeout(+opt('--wait', 2500));
const js = opt('--eval', null);
if (js) { const r = await page.evaluate(js); if (r !== undefined) console.log('eval →', JSON.stringify(r)); await page.waitForTimeout(+opt('--wait2', 800)); }
await page.screenshot({ path: out });
console.log('errors:', JSON.stringify(ev.errors), 'console:', JSON.stringify(ev.console), 'failed:', JSON.stringify(ev.failed));
await browser.close(); await srv.close();
