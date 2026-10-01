// Load the browser modules (app/core.js, app/moons.js, ...) into a plain Node VM context so their pure math can be unit-tested.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './server.mjs';

export function loadRH(files = ['app/core.js', 'app/moons.js', 'app/compass.js']) {
  const ctx = vm.createContext({ console, URL, Math, Date, JSON, Promise });
  ctx.window = ctx; ctx.globalThis = ctx;
  for (const f of files) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }
  return ctx.RH;
}
export const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
