// Run every test file in sequence. 2D regression needs a baseline directory captured on main:
//   RH_BASELINE=/path/to/baseline node run-all.mjs        (capture it with: node regress2d.mjs capture /path/to/baseline  on a clean main)
import { spawnSync } from 'node:child_process';
const steps = [['unit', ['unit.mjs']], ['politics', ['politics.mjs']], ['feature3d', ['feature3d.mjs']], ['relief', ['relief.mjs']], ['disk', ['disk.mjs']], ['a11y', ['a11y.mjs']], ['measure', ['measure.mjs']]];
if (process.env.RH_BASELINE) steps.push(['regress2d', ['regress2d.mjs', 'compare', process.env.RH_BASELINE]]);
let bad = 0;
for (const [name, args] of steps) { console.log(`\n=== ${name} ===`); const r = spawnSync('node', args, { stdio: 'inherit', cwd: new URL('.', import.meta.url).pathname }); if (r.status !== 0) { bad++; console.log(`>>> ${name} FAILED`); } }
console.log(bad ? `\n${bad} suite(s) failed` : '\nall suites passed'); process.exit(bad ? 1 : 0);
