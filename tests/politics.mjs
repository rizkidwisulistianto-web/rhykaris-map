// Political layer v3 (viewer v1.7): data contract, one shared style table and stacking order for flat map / globe / dual-disk, optional layers,
// cards, legend, in-map audit and vocabulary (Canon Index #211–#216). See docs/POLITICS_V3_NOTES.md.
//   node politics.mjs [--filter text]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { startServer, ROOT } from './lib/server.mjs';
import { launch, newPage, waitForMap } from './lib/browser.mjs';
import { loadRH, readJSON } from './lib/load.mjs';

const filter = process.argv.includes('--filter') ? process.argv[process.argv.indexOf('--filter') + 1] : null;
const RH = loadRH(), C = RH.core;
const DATA = readJSON('data/data.json'), POL = readJSON('data/politics.json');
C.configure(DATA.stats, DATA.thresholds);

let pass = 0, fail = 0; const failures = [];
function t(name, ok, detail = '') { if (ok) pass++; else { fail++; failures.push(name); console.log(`FAIL  ${name} ${detail}`); } }
let seed = 1647; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
async function run(name, fn) { if (filter && !name.includes(filter)) return; const t0 = Date.now(); try { await fn(); } catch (e) { fail++; failures.push(name); console.log(`FAIL  ${name} — exception: ${e && e.stack || e}`); } console.log(`  ·${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }

const FAC = DATA.factions, TERR = DATA.territories, byId = Object.fromEntries(TERR.map((x) => [x.id, x]));
const sha = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const IR = TERR.filter((x) => /^ir_\d+$/.test(x.id)).map((x) => x.id);

// ---------------------------------------------------------------- geometry helpers (lat/lon plane, with the ±360° world copies the viewers draw)
function inRing(lat, lon, ring) {
  for (let k = -1; k <= 1; k++) { const x = lon + 360 * k; let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1]; if ((yi > lat) !== (yj > lat) && x < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; }
    if (c) return true; }
  return false;
}
const inTerr = (x, lat, lon) => x.rings.some((rg) => inRing(lat, lon, rg));
function sample(x, n) {   // n uniform points inside the territory (rejection sampling over the bounding box of each ring), deterministic
  const out = []; let guard = 0;
  while (out.length < n && guard++ < n * 4000) {
    const rg = x.rings[Math.floor(rnd() * x.rings.length)]; let a = 90, b = -90, c0 = 1e9, d0 = -1e9;
    for (const [la, lo] of rg) { a = Math.min(a, la); b = Math.max(b, la); c0 = Math.min(c0, lo); d0 = Math.max(d0, lo); }
    const la = a + rnd() * (b - a), lo = c0 + rnd() * (d0 - c0); if (x.rings.some((r2) => inRing(la, lo, r2))) out.push([la, lo]);
  }
  return out;
}
/** Share (0..1) of sampled points of `a` that fall inside any of the territories `bs`. */
const share = (a, bs, n = 500) => { const pts = sample(a, n); return pts.filter(([la, lo]) => bs.some((b) => inTerr(b, la, lo))).length / pts.length; };
const T = (id) => byId[id];
const interregnaIds = [...IR, 'aventalia', 'tarvenna', 'cassivalla', 'nundina'];

// ================================================================== 1. no trace of the retired Vasal Commonwealth
await run('retired Vasal Commonwealth: no id, polygon, card, group or legend left', async () => {
  const RETIRED = /\bcw[_]/;   // character class: this very pattern must not show up in a repository-wide search for the retired ids
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
  const files = ['data/data.json', 'data/politics.json', 'index.html', 'README.md', ...walk('app'), ...walk('src').filter((f) => /\.py$/.test(f))];
  const hit = files.filter((f) => RETIRED.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  t('no retired Commonwealth id in data, app, src, README or the built index.html', hit.length === 0, hit.join());
  t('no territory or faction keeps a retired id', ![...TERR.map((x) => x.id), ...Object.keys(FAC), ...DATA.places.map((p) => p.id)].some((i) => /^cw/.test(i)));
  const ui = fs.readFileSync(path.join(ROOT, 'app/app.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'app/body.html'), 'utf8');
  t('layer panel and legend never call anything "vasal Commonwealth" or "Hesperia / vasal"', !/vasal Commonwealth|Hesperia \/ vasal/i.test(ui));
  t('no UI string calls Cassivalla a province ("Provincia" is data-only, as a labelled exonym)', !/Provincia/.test(ui));
  t('the three numbered polygons of the old Commonwealth are gone from the territories (50 records: 27 base + 23 Interregna)', TERR.length === 50 && !TERR.some((x) => /^cw/.test(x.id)), String(TERR.length));
});

// ================================================================== 2. contract of the new layers
await run('political data contract', async () => {
  const want = ['imperial_commonwealth', 'aventalia', 'tarvenna', 'cassivalla', 'nundina', 'hesperia', 'hes_marka', 'hes_pesisir', 'hes_transisi', 'hes_pedalaman', 'satvan_pedalaman', 'satvan_pedalaman__t1', 'satvan_pedalaman__t2',
    'kloaka', 'kloaka_zona', 'kloaka_zona__t1', 'kloaka_zona__t2', 'foedera', 'foedera_inti', 'liminara', 'ktonia', 'pylora', 'anabasim', 'emporys', 'perates', 'andura', 'anusarri'];
  const got = TERR.map((x) => x.id).filter((i) => !IR.includes(i));
  t('territory ids = 27 non-Interregna records + ir_1..ir_23', want.length === got.length && want.every((i) => got.includes(i)) && IR.length === 23, got.join());
  const tiers = TERR.filter((x) => x.of);
  t('tier records name an existing parent and a tier number (draw-only: no faction card of their own)', tiers.length === 4 && tiers.every((x) => byId[x.of] && Number.isInteger(x.tier) && x.tier >= 1 && !FAC[x.id]), tiers.map((x) => x.id).join());
  t('every other territory has a faction card (Interregna included)', TERR.filter((x) => !x.of && x.id !== 'anusarri').every((x) => FAC[x.id]), TERR.filter((x) => !x.of && !FAC[x.id]).map((x) => x.id).join());
  const styled = Object.entries(FAC).filter(([, f]) => f.style);
  t('every faction with a `style` key is understood by the shared style table (draws differently from the default look)', styled.length >= 9 && styled.every(([id, f]) => { const clone = { ...f }; delete clone.style; return JSON.stringify(C.terrStyle(f, { id })) !== JSON.stringify(C.terrStyle(clone, { id })); }), styled.map(([i]) => i).join());
  t('zone tiers get denser at deeper tiers (Satvan sparse → denser, Kloaka zone loosely → tightly dotted)', ['satvan_pedalaman', 'kloaka_zona'].every((id) => { const g = [0, 1, 2].map((k) => C.terrStyle(FAC[id], { id, tier: k }).fill.g); return g[0] > g[1] && g[1] > g[2]; }));
  t('Satvan and the Kloaka control zone are dotted with no outline; belts and the Foedera core have no outline; the Kloaka claim is thin and dashed',
    ['satvan_pedalaman', 'kloaka_zona', 'hes_pesisir', 'hes_transisi', 'hes_pedalaman', 'foedera_inti'].every((id) => C.terrStyle(FAC[id], { id }).stroke === null) &&
    C.terrStyle(FAC.satvan_pedalaman, {}).fill.k === 'dots' && C.terrStyle(FAC.kloaka_zona, {}).fill.k === 'dots' && C.terrStyle(FAC.kloaka, {}).stroke.dash && C.terrStyle(FAC.kloaka, {}).stroke.k < 1);
  t('Foedera claim is hatched (wide claim), its core is a solid tint', C.terrStyle(FAC.foedera, {}).fill.k === 'hatch' && C.terrStyle(FAC.foedera_inti, {}).fill.k === 'flat');
  t('Hesperia is ONE flat layer (no hatch, no tier); the belts are separate optional records', C.terrStyle(FAC.hesperia, {}).fill.k === 'flat' && !byId.hesperia.of && byId.hesperia.rings.length >= 1 && ['hes_pesisir', 'hes_transisi', 'hes_pedalaman'].every((i) => C.tgroupOf(byId[i]) === 'hesb'));
  // pinned: everything the task says must NOT move
  const KEEP = (x) => /^ir_\d+$/.test(x.id) || ['nundina', 'aventalia', 'tarvenna', 'cassivalla', 'hesperia', 'foedera', 'liminara', 'ktonia', 'pylora', 'anabasim', 'andura', 'emporys', 'perates', 'anusarri'].includes(x.id);
  t('Interregna mosaic, Hesperia, Foedera and the other polities keep exactly their geometry (not redone, not moved)', sha(TERR.filter(KEEP).map((x) => [x.id, x.rings])) === 'a0d2ade1d9b981b264c456bc6959f1de654cf27819af66b6116ee57a1f2b73c7');
  t('physical regions (incl. the Vasundha ring) unchanged', sha(DATA.regions.map((r) => [r.id, r.rings])) === '6d0268393c00e13a1e687d37d40bd79d5590b16db60af782e0bd9a32e9f0a05a');
  const P = (id) => { const p = DATA.places.find((q) => q.id === id); return [p.id, p.lat, p.lon, p.epi, p.conf]; };
  t('Vasundha and Kloaka keep their positions (Vasundha not moved; Kloaka Inferensi AI – Rendah, no canonical location)', sha([P('vasundha'), P('kloaka')]) === '11832f51df27d7ed351701bd7cbc5f00372d5d93e8758ebd5adb2adf2724470b');
  t('Kloaka is its own territory: not merged into Interregna, not a Hesperia–Foedera buffer in its card', TERR.some((x) => x.id === 'kloaka') && !interregnaIds.includes('kloaka') && /bukan penyangga geopolitik/.test(FAC.kloaka.facts.map((r) => r[2]).join(' ')));
});

// ================================================================== 3. one group table, one stacking order
await run('shared group table and canonical stacking order', async () => {
  t('ten groups, bottom → top: sat, ic, hes, cw, hesb, foe, int, ana, elv, lain', C.TGROUPS.join() === 'sat,ic,hes,cw,hesb,foe,int,ana,elv,lain');
  t('the Hesperia belt group is the only one that starts switched off', Object.keys(C.TDEFAULT).join() === 'hesb' && C.TDEFAULT.hesb === false);
  const grp = Object.fromEntries(TERR.map((x) => [x.id, C.tgroupOf(x)]));
  t('every territory belongs to a known group; tiers follow their parent', Object.values(grp).every((g) => C.TGROUPS.includes(g)) && TERR.filter((x) => x.of).every((x) => grp[x.id] === grp[x.of]));
  t('group assignments: umbrella → ic; Hesperia → hes; marka → cw; belts → hesb; Satvan → sat; Foedera + core + Cassivalla → foe; Kloaka + zone → lain', grp.imperial_commonwealth === 'ic' && grp.hesperia === 'hes' && grp.hes_marka === 'cw' && grp.hes_pesisir === 'hesb' && grp.satvan_pedalaman === 'sat' && grp.foedera === 'foe' && grp.foedera_inti === 'foe' && grp.cassivalla === 'foe' && grp.kloaka === 'lain' && grp.kloaka_zona === 'lain' && IR.every((i) => grp[i] === 'int'));
  const ord = C.terrOrder(TERR).map((x) => x.id), ix = (i) => ord.indexOf(i);
  t('terrOrder is a permutation of all territories', ord.length === TERR.length && new Set(ord).size === TERR.length);
  const gi = ord.map((i) => C.TGROUPS.indexOf(grp[i]));
  t('terrOrder sorts by group, then keeps data order inside a group', gi.every((g, k) => k === 0 || g >= gi[k - 1]) && C.TGROUPS.every((g) => { const mine = ord.filter((i) => grp[i] === g), data = TERR.map((x) => x.id).filter((i) => grp[i] === g); return mine.join() === data.join(); }));
  t('overlays sit above their base: the umbrella lies under Hesperia and marka; belts above Hesperia; Foedera core above the claim; Kloaka zone and its tiers above the claim and in tier order; Satvan tiers in tier order',
    ix('imperial_commonwealth') < ix('hesperia') && ix('imperial_commonwealth') < ix('hes_marka') && ix('hes_pesisir') > ix('hesperia') && ix('hes_transisi') > ix('hesperia') && ix('hes_pedalaman') > ix('hesperia') && ix('foedera_inti') > ix('foedera') && ix('kloaka_zona') > ix('kloaka') &&
    ix('kloaka_zona__t1') > ix('kloaka_zona') && ix('kloaka_zona__t2') > ix('kloaka_zona__t1') && ix('satvan_pedalaman__t1') > ix('satvan_pedalaman') && ix('satvan_pedalaman__t2') > ix('satvan_pedalaman__t1'));
  // the three views must not carry their own copies of the group list or the style table
  const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  t('globe and dual-disk take groups, order and styles from the shared core (no hard-coded group list, no private hatch)', ['app/globe/layers.js', 'app/disk.js'].every((f) => !/'t_(ic|hes|cw|hesb|sat|foe|int|ana|elv|lain)'/.test(src(f)) && /C\.TGROUPS/.test(src(f)) && /C\.terrStyle/.test(src(f)) && /C\.terrOrder/.test(src(f)) && /C\.tgroupOf/.test(src(f))) && /C\.terrStyle/.test(src('app/app.js')) && /C\.TGROUPS/.test(src('app/app.js')));
});

// ================================================================== 4. geometry: no overlap where the task forbids it, nesting where it requires it
await run('geometry rules (sampled)', async () => {
  const hes = T('hesperia'), belts = ['hes_pesisir', 'hes_transisi', 'hes_pedalaman'].map(T), others = [T('foedera'), T('kloaka'), ...interregnaIds.map(T)];
  t('Hesperia polygon is whole (belts are an overlay, never a clip): ≥ 99.5 % of belt samples lie inside it', belts.every((b) => share(b, [hes]) >= 0.995));
  t('the three belts tile Hesperia without gaps (≥ 99.5 % of Hesperia samples fall in a belt) and without overlap (< 0.6 % pairwise)', share(hes, belts, 800) >= 0.995 && [[0, 1], [0, 2], [1, 2]].every(([a, b]) => share(belts[a], [belts[b]]) < 0.006));
  const marka = T('hes_marka');
  t('marka belt: no overlap with Hesperia, Foedera, Kloaka (claim and zone) or any Interregna polity (< 0.6 %)', share(marka, [hes, T('foedera'), T('kloaka'), T('kloaka_zona'), ...interregnaIds.map(T)], 800) < 0.006);
  const sat = T('satvan_pedalaman'), vas = DATA.regions.find((r) => r.id === 'vasundha');
  const allBase = TERR.filter((x) => !x.of && !/^satvan/.test(x.id) && x.id !== 'anusarri');
  t('Satvan zone overlaps no polity polygon (Hesperia, marka, Foedera, Kloaka, Interregna, Anabasim, …) and not the Vasundha ring', share(sat, allBase, 800) === 0 && sample(sat, 800).every(([la, lo]) => !vas.rings.some((rg) => inRing(la, lo, rg))));
  t('Satvan tiers are nested (tier 2 ⊂ tier 1 ⊂ zone)', share(T('satvan_pedalaman__t2'), [T('satvan_pedalaman__t1')]) >= 0.99 && share(T('satvan_pedalaman__t1'), [sat]) >= 0.99);
  t('Kloaka claim does not overlap Hesperia, Foedera or an Interregna polity (the small overlap is fixed)', share(T('kloaka'), [hes, T('foedera'), ...interregnaIds.map(T)], 600) === 0);
  t('Kloaka control zone is one diffuse zone inside the nominal claim, tiers nested', share(T('kloaka_zona'), [T('kloaka')]) >= 0.99 && share(T('kloaka_zona__t1'), [T('kloaka_zona')]) >= 0.99 && share(T('kloaka_zona__t2'), [T('kloaka_zona__t1')]) >= 0.99);
  const ic = T('imperial_commonwealth');
  t('umbrella (Imperial Commonwealth) covers Hesperia and the marka belt (≥ 99 % of samples) and adds no land beyond them (≤ 1 % of its own samples)', share(hes, [ic], 800) >= 0.99 && share(marka, [ic], 800) >= 0.99 && share(ic, [hes, marka], 800) >= 0.99);
  t('umbrella overlaps no other polity (Foedera, Kloaka claim and zone, Interregna, Anabasim, …) beyond what Hesperia itself does (< 0.6 %; the belts are overlays inside Hesperia and are left out)', share(ic, allBase.filter((x) => !['imperial_commonwealth', 'hesperia', 'hes_marka', 'hes_pesisir', 'hes_transisi', 'hes_pedalaman'].includes(x.id)), 800) < 0.006);
  t('v3 metadata: umbrella area = Hesperia + marka (±0.05 M km²), nothing else added', Math.abs(POL.v3.ic.area_mkm2 - (POL.v3.ic.hesperia_mkm2 + POL.v3.ic.marka_mkm2)) <= 0.05 && POL.v3.ic.hesperia_mkm2 === POL.v3.belts.hesperia_mkm2 && POL.v3.ic.marka_mkm2 === POL.v3.marka.area_mkm2);
  t('Foedera core lies inside the (unclipped) claim', share(T('foedera_inti'), [T('foedera')], 800) >= 0.98);
  const m = POL.v3;
  t('v3 metadata: belts 24+19+7 = 50 provinces; shares sum to 100 %; areas sum to Hesperia', m.belts.prov.reduce((a, b) => a + b) === 50 && Math.abs(m.belts.share_pct.reduce((a, b) => a + b) - 100) < 0.2 && Math.abs(m.belts.area_mkm2.reduce((a, b) => a + b) - m.belts.hesperia_mkm2) < 0.03);
  t('v3 metadata: Satvan buffers respected (Hesperia Pedalaman ≥ 700, Interregna ≥ 990, Foedera ≥ 300, Vasundha ≥ 150 km) and the zone is Unaffected, crossing no ring', m.satvan.min_dist_km['Sabuk Pedalaman Hesperia'] >= 700 && m.satvan.min_dist_km.Interregna >= 990 && m.satvan.min_dist_km['Foedera + tetangga timur'] >= 300 && m.satvan.min_dist_km.Vasundha >= 150 && m.satvan.scar.single === 'Unaffected' && m.satvan.scar.abs_min > 32.5);
  t('v3 metadata: Satvan ring comes from the #209 rule at the centroid (recomputed here)', C.prox(C.scarD(m.satvan.scar.centroid[0], m.satvan.scar.centroid[1])) === m.satvan.scar.ring_centroid && Math.abs(Math.abs(C.scarD(m.satvan.scar.centroid[0], m.satvan.scar.centroid[1])) - Math.abs(m.satvan.scar.d_centroid)) < 0.05);
  t('v3 metadata: Hesperia is ≈12.57 M km² (Powers — Hesperia ±12.55 M) and Foedera ≈16.66 M km², both nominal jurisdiction', Math.abs(m.belts.hesperia_mkm2 - 12.55) < 0.1 && Math.abs(m.foedera.area_mkm2 - 16.6) < 0.2);
});

// ================================================================== 5. vocabulary (#214) and canon chips in the data
await run('vocabulary and epistemic labels in the data', async () => {
  const strings = [];
  const walkS = (o, p) => { if (typeof o === 'string') strings.push([p.join('/'), o]); else if (Array.isArray(o)) o.forEach((v, i) => walkS(v, [...p, i])); else if (o && typeof o === 'object') Object.entries(o).forEach(([k, v]) => { if (!['rings', 'pts', 'pts2', 'b', 'contours', 'mandala', 'regions', 'banks'].includes(k)) walkS(v, [...p, k]); }); };
  walkS({ places: DATA.places, factions: FAC, audit: DATA.audit, ledger: DATA.ledger, unmapped: DATA.unmapped, routes: DATA.routes, fronts: DATA.fronts }, []);
  const prov = strings.filter(([, s]) => /provins/i.test(s));
  const okPath = (p, s) => /^factions\/(imperial_commonwealth|hesperia|hes_pesisir|hes_transisi|hes_pedalaman)\//.test(p) || (/^factions\/(hes_marka|cassivalla)\//.test(p) && /bukan provinsi/.test(s)) ||
    (/^audit\//.test(p) && /provinsi|#21[24]/.test(s + ' ' + DATA.audit[+p.split('/')[1]].refs + ' ' + DATA.audit[+p.split('/')[1]].title));
  const stray = prov.filter(([p, s]) => !okPath(p, s));
  t('"provinsi" appears only for Hesperia direct rule (Hesperia and its belts), in explicit negations (marka, Cassivalla) and in the vocabulary / pattern cards of the audit', stray.length === 0, stray.map(([p, s]) => p + ': ' + s.slice(0, 60)).join(' | '));
  const fed = strings.filter(([, s]) => /\bfederasi\b/i.test(s) && !/bukan "federasi"/.test(s));
  t('"federasi" is never used for the Commonwealth (only inside the explicit negation)', fed.length === 0, fed.map(([p]) => p).join());
  const pc = strings.filter(([, s]) => /Provincia/.test(s));
  t('"Provincia Cassivallae" only appears as a labelled exonym (Cassivalla card, place alias, audit vocabulary card)', pc.length >= 2 && pc.every(([p, s]) => /eksonim/i.test(s) && (/^factions\/cassivalla\//.test(p) || /^places\//.test(p) || /^audit\//.test(p))), pc.map(([p]) => p).join());
  t('map, legend and card name of Cassivalla = "Cassivalla"', FAC.cassivalla.name === 'Cassivalla' && DATA.places.find((p) => p.id === 'cassivalla').name === 'Cassivalla' && byId.cassivalla && !strings.some(([p, s]) => /(\/name|\/title)$/.test(p) && /Provincia/.test(s)));
  t('Hesperia card keeps the Atlas/Powers Faction Type "Empire" (verified canon, Established)', /^Empire/.test(FAC.hesperia.kind));
  t('Kloaka card keeps Faction Type "Kingdom" and says "kerajaan nominal, tanpa penegakan"', /^Kingdom/.test(FAC.kloaka.kind) && /kerajaan nominal, tanpa penegakan/i.test(FAC.kloaka.blurb + FAC.kloaka.facts[0][2]));
  const epiOf = (id, label) => (FAC[id].facts.find((r) => r[0] === label) || [])[1];
  t('Kloaka: only the Powers-tagged statements carry the Kanon chip; the three open knobs are Terbuka; the position row is Inferensi', epiOf('kloaka', 'Status') === 'kanon' && epiOf('kloaka', 'Mengapa masih berdiri') === 'kanon' && epiOf('kloaka', 'Peran') === 'kanon' && epiOf('kloaka', 'Tidak dijawab peta') === 'terbuka' && epiOf('kloaka', 'Letak') === 'inferensi');
  const open3 = FAC.kloaka.facts.find((r) => r[0] === 'Tidak dijawab peta')[2];
  t('the map does not answer the three open Kloaka knobs (it lists them as unanswered)', /apakah ada zona yang cukup terkonsolidasi/.test(open3) && /apakah raja tahu/.test(open3) && /sumber daya tersembunyi/.test(open3) && !/Terdapat sumber daya|raja tahu bahwa/.test(JSON.stringify(FAC.kloaka)));
  t('Foedera three bonds = working labels (Inferensi), "batas antar lapis" = Turunan (Powers), no subdivision drawn', epiOf('foedera', 'Tiga lapis ikatan') === 'inferensi' && epiOf('foedera', 'Batas antar lapis') === 'turunan' && TERR.filter((x) => /^foedera/.test(x.id)).map((x) => x.id).join() === 'foedera,foedera_inti');
  t('the umbrella card says Imperial Commonwealth, names Hesperia as paramount (Kanon rows), keeps "kerajaan" off Hesperia and flags the placeholder marka edge', FAC.imperial_commonwealth.name === 'Imperial Commonwealth' && epiOf('imperial_commonwealth', 'Paramount') === 'kanon' && epiOf('imperial_commonwealth', 'Nama') === 'kanon' && epiOf('imperial_commonwealth', 'Tidak dijawab peta') === 'terbuka' && /PLACEHOLDER, bukan kanon/.test(FAC.imperial_commonwealth.tag) && /Paramount/.test(FAC.hesperia.kind) && epiOf('hesperia', 'Paramount') === 'kanon' && !/Kerajaan Hesperia/i.test(JSON.stringify(FAC)) && !/Kerajaan Hesperia/i.test(JSON.stringify(DATA.places)));
  t('placeholders are labelled "PLACEHOLDER, bukan kanon": marka, Satvan zone, Kloaka zone, Foedera core', ['hes_marka', 'satvan_pedalaman', 'kloaka_zona', 'foedera_inti'].every((i) => FAC[i].tag === 'PLACEHOLDER, bukan kanon'));
  t('the belts carry the working-label tag and every number on them is Inferensi', ['hes_pesisir', 'hes_transisi', 'hes_pedalaman'].every((i) => /Label kerja/.test(FAC[i].tag) && FAC[i].epi === 'inferensi'));
  t('Satvan card: legal status of "tidak terhitung" is Terbuka and the zone is not equated with "Satvan Perbatasan" or Vasundha', epiOf('satvan_pedalaman', 'Status hukum') === 'terbuka' && /Bukan "Satvan Perbatasan"/.test(FAC.satvan_pedalaman.facts.find((r) => r[0] === 'Bukan')[2]) && /Vasundha/.test(FAC.satvan_pedalaman.facts.find((r) => r[0] === 'Bukan')[2]));
});

// ================================================================== 6. in-map audit: blank spots, patterns, and the "Catok" card against the final geometry
await run('in-map audit cards and the "Catok tiga rahang" card', async () => {
  const A = DATA.audit, find = (kind, re) => A.filter((a) => a.kind === kind && re.test(a.title));
  t('blank-spot cards: Satvan legal status, Interregna count and names, Hesperia coastline, Kloaka position', find('blank', /Satvan.*tidak terhitung/).length === 1 && find('blank', /Jumlah dan nama polity Interregna/).length === 1 && find('blank', /Garis pantai Hesperia berhenti/).length === 1 && find('blank', /Posisi Kloaka/).length === 1);
  t('pattern cards for the decisions: nominal jurisdiction, no-line rule, one word one rule, the umbrella', find('pola', /Payung Imperial Commonwealth/).length === 1 && find('pola', /yurisdiksi nominal/).length === 1 && find('pola', /Tanpa garis bila kanon tidak menarik garis/).length === 1 && find('pola', /Satu kata, satu aturan/).length === 1);
  t('friction card: Powers Foedera still says "provinsi" (pending sweep, #214)', find('friksi', /provinsi.*Powers Foedera/).length === 1);
  t('closed card records the retirement of the numbered vassal polygons (no ids quoted)', find('tutup', /Vasal Commonwealth.*dicabut/).length === 1);
  const cat = A.find((a) => /Catok tiga rahang/.test(a.title));
  // recompute the Arc 1 split from the final polygons: length inside the Foedera polygon and in no polygon at all
  const rt = DATA.routes.find((r) => r.id === 'arc1'), R = DATA.stats.radius_km, KM = Math.PI / 180 * R;
  let tot = 0; for (let i = 1; i < rt.pts.length; i++) { const a = rt.pts[i - 1], b = rt.pts[i]; tot += Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180)) * KM; }
  const n = Math.max(2000, Math.round(tot / 0.5)); let inF = 0, none = 0, other = 0;
  const base = TERR.filter((x) => !x.of && !['hes_pesisir', 'hes_transisi', 'hes_pedalaman', 'foedera_inti', 'kloaka_zona', 'satvan_pedalaman', 'anabasim', 'emporys', 'perates', 'andura', 'anusarri'].includes(x.id));
  const at = (u) => { const f = u * (rt.pts.length - 1), i = Math.min(rt.pts.length - 2, Math.floor(f)), w = f - i; return [rt.pts[i][0] + (rt.pts[i + 1][0] - rt.pts[i][0]) * w, rt.pts[i][1] + (rt.pts[i + 1][1] - rt.pts[i][1]) * w]; };
  let prev = at(0);
  for (let k = 1; k <= n; k++) { const q = at(k / n), mid = [(prev[0] + q[0]) / 2, (prev[1] + q[1]) / 2], step = Math.hypot(q[0] - prev[0], (q[1] - prev[1]) * Math.cos(mid[0] * Math.PI / 180)) * KM; prev = q;
    const f = inTerr(T('foedera'), mid[0], mid[1]); if (f) inF += step; else if (base.some((x) => x.id !== 'foedera' && inTerr(x, mid[0], mid[1]))) other += step; else none += step; }
  const num = (re) => { const m = cat.body.match(re); return m ? +m[1].replace(/\./g, '') : NaN; };
  const cardF = num(/≈([\d.]+) km di dalam poligon Foedera/), cardN = num(/≈([\d.]+) km di tanah tak berpoligon/);
  t(`"Catok" card numbers match the final geometry (card ≈${cardF} / ≈${cardN} km; measured ${inF.toFixed(0)} in Foedera, ${none.toFixed(0)} in no polygon, ${other.toFixed(0)} in other polygons)`, Math.abs(cardF - inF) <= 15 && Math.abs(cardN - none) <= 15);
  t('"Catok" card no longer claims the route cuts exactly at a shared seam, and says Kloaka is not a jaw', !/tepat di jahitan/.test(cat.body) && /bukan rahang/.test(cat.body) && /celah, bukan garis batas bersama/.test(cat.body));
  t('ledger: Satvan row carries the zone area and its Scar ring', DATA.ledger.some((l) => /Satvan/.test(l[0]) && /Unaffected/.test(l.join(' ')) && /5,9/.test(l.join(' '))));
});

// ================================================================== 7. flat map (Leaflet)
const srv = await startServer(), browser = await launch();
const expectSeq = (on) => C.terrOrder(TERR).filter((x) => x.id !== 'anusarri' && on.has(C.tgroupOf(x))).flatMap((x) => { const f = FAC[x.of || x.id], ts = C.terrStyle(f, x), pk = C.patKey(ts.fill); return x.rings.flatMap(() => [-360, 0, 360].map(() => `${pk ? 'url(#' + pk + ')' : ts.fill.col}|${ts.stroke ? ts.stroke.col : 'none'}`)); });
const domSeq = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.leaflet-terr-pane svg g path')).map((p) => `${p.getAttribute('fill')}|${p.getAttribute('stroke')}`));
const open2D = async (o = {}) => { const { ctx, page, ev } = await newPage(browser, { viewport: o.viewport || { width: 1500, height: 950 }, reducedMotion: 'reduce' }); await page.goto(srv.url + '?view=2d', { waitUntil: 'load' }); await waitForMap(page); return { ctx, page, ev }; };
const ALL = new Set(C.TGROUPS), DEFAULT_ON = new Set(C.TGROUPS.filter((g) => g !== 'hesb'));

await run('flat map: optional belts, stacking order, patterns, persistence', async () => {
  const { ctx, page, ev } = await open2D();
  await page.locator('#tab-layer').click();
  const st = await page.evaluate(() => ['t_ic', 't_hes', 't_cw', 't_hesb', 't_sat', 't_foe', 't_int', 't_ana', 't_elv', 't_lain'].map((k) => [k, document.getElementById('ly-' + k) && document.getElementById('ly-' + k).checked]));
  t('layer panel has the new layers (umbrella t_ic, marka t_cw, belts, Satvan); belts (t_hesb) start OFF, Satvan zone (t_sat) and the rest start ON', st.every(([, v]) => v !== null) && st.filter(([, v]) => !v).map(([k]) => k).join() === 't_hesb', JSON.stringify(st));
  const lbl = await page.evaluate(() => document.getElementById('sec-layer').innerText);
  t('layer labels: "Imperial Commonwealth", "Hesperia · Paramount", "Kerajaan-kerajaan Commonwealth", "Sabuk provinsi Hesperia", "Zona persebaran Satvan Pedalaman"; no "vasal Commonwealth"; no "Provincia"', /Sabuk provinsi Hesperia/.test(lbl) && /Zona persebaran Satvan Pedalaman/.test(lbl) && /Kerajaan-kerajaan Commonwealth/.test(lbl) && /Imperial Commonwealth/.test(lbl) && /Hesperia · Paramount/.test(lbl) && !/vasal Commonwealth/i.test(lbl) && !/Provincia/.test(lbl), lbl.slice(lbl.indexOf('Wilayah kuasa'), lbl.indexOf('Wilayah kuasa') + 400));
  const s0 = await domSeq(page), e0 = expectSeq(DEFAULT_ON);
  t(`default stack = canonical order, belts absent (${s0.length} paths: fill|stroke sequence equals C.terrOrder × style)`, s0.length === e0.length && s0.every((s, i) => s === e0[i]), `${s0.length} vs ${e0.length}`);
  await page.locator('#ly-t_hesb').check();
  const s1 = await domSeq(page), e1 = expectSeq(ALL);
  t('belts switched on: they are drawn above Hesperia and the whole stack is still canonical', s1.length === e1.length && s1.every((s, i) => s === e1[i]));
  // toggling any group re-adds it on top in Leaflet; restack must put it back
  for (const g of ['hes', 'sat', 'foe', 'lain']) { await page.locator('#ly-t_' + g).uncheck(); await page.locator('#ly-t_' + g).check(); }
  const s2 = await domSeq(page);
  t('after switching four groups off and on again the stack is still canonical (restack hook)', s2.length === e1.length && s2.every((s, i) => s === e1[i]));
  await page.locator('#ly-t_hes').uncheck(); await page.locator('#ly-t_hesb').uncheck(); await page.locator('#ly-t_hes').check();
  const s3 = await domSeq(page), e3 = expectSeq(DEFAULT_ON);
  t('belts off again, Hesperia back: canonical, belts gone', s3.length === e3.length && s3.every((s, i) => s === e3[i]));
  await page.locator('#ly-t_hesb').check();
  const defs = await page.evaluate(() => { const ids = new Set(Array.from(document.querySelectorAll('.leaflet-terr-pane defs[data-rh] pattern')).map((p) => p.id)); const used = Array.from(document.querySelectorAll('.leaflet-terr-pane svg g path')).map((p) => p.getAttribute('fill')).filter((f) => /^url\(#/.test(f)).map((f) => f.slice(5, -1)); return { ids: [...ids], used: [...new Set(used)] }; });
  const patKeys = new Set(TERR.filter((x) => x.id !== 'anusarri').map((x) => C.patKey(C.terrStyle(FAC[x.of || x.id], x).fill)).filter(Boolean));
  t(`every pattern the territories use is defined once in the SVG <defs> (${[...patKeys].length} hatch/dot patterns), and every fill url resolves`, [...patKeys].every((k) => defs.ids.includes(k)) && defs.used.every((u) => defs.ids.includes(u)) && defs.ids.filter((i) => /^(hatch|dots)-/.test(i)).length === patKeys.size, JSON.stringify(defs));
  const sat = await page.evaluate(() => Array.from(document.querySelectorAll('.leaflet-terr-pane svg g path')).filter((p) => /^url\(#dots-/.test(p.getAttribute('fill'))).map((p) => p.getAttribute('stroke')));
  t(`Satvan and Kloaka zones (${e1.filter((x) => x.startsWith('url(#dots-')).length} polygons incl. world copies) are dotted fills with no stroke on the flat map`, sat.length === e1.filter((x) => x.startsWith('url(#dots-')).length && sat.length >= 18 && sat.every((x) => x === 'none'), String(sat.length));
  // persisted state survives a reload
  await page.reload({ waitUntil: 'load' }); await waitForMap(page);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('rh-layers-v1')));
  const s4 = await domSeq(page);
  t('layer state persists across a reload (belts stay on) and the stack is canonical after reload', kept.t_hesb === true && s4.length === e1.length && s4.every((s, i) => s === e1[i]), JSON.stringify(kept));
  t('no console errors or failed requests', ev.errors.length === 0 && ev.console.length === 0 && ev.failed.length === 0, JSON.stringify([ev.errors, ev.console, ev.failed]));
  await ctx.close();
});

await run('flat map: click on the map gives the topmost faction (same rule as globe and disk)', async () => {
  const { ctx, page } = await open2D();
  await page.locator('#btn-panel').click(); await page.evaluate(() => document.getElementById('ly-t_hesb').click());   // the layer tab is hidden: toggle the checkbox programmatically
  const topAt = (la, lo, on) => { const ord = C.terrOrder(TERR).filter((x) => x.id !== 'anusarri' && on.has(C.tgroupOf(x))); for (let i = ord.length - 1; i >= 0; i--) if (inTerr(ord[i], la, lo)) return FAC[ord[i].of || ord[i].id].name; return null; };
  const probes = [['hes_pedalaman', 'Hesperia · Sabuk Pedalaman'], ['hes_marka', 'Kerajaan marka'], ['satvan_pedalaman__t2', 'Satvan Pedalaman'], ['kloaka_zona__t2', 'Kloaka · zona'], ['foedera_inti', 'Foedera · inti'], ['cassivalla', 'Cassivalla']];
  let done = 0; const bad = [];
  for (const [id, label] of probes) {
    const x = T(id), cands = sample(x, 60); let ok = null;
    for (const [la, lo] of cands) {   // a probe point must be uncovered by labels / markers: the element at that pixel is a territory path
      await page.evaluate(([a, b]) => { const m = window.__rhMap; m.setView([a, b], 5, { animate: false }); }, [la, lo]);
      const pt = await page.evaluate(([a, b]) => { const m = window.__rhMap, p = m.latLngToContainerPoint([a, b]), r = m.getContainer().getBoundingClientRect(), x0 = r.left + p.x, y0 = r.top + p.y, el = document.elementFromPoint(x0, y0); return { x: x0, y: y0, path: !!(el && el.closest && el.closest('.leaflet-terr-pane') && el.tagName === 'path') }; }, [la, lo]);
      if (pt.path && topAt(la, lo, ALL) === FAC[x.of || x.id].name) { ok = pt; break; }
    }
    if (!ok) { bad.push(id + ': no clean probe point'); continue; }
    await page.mouse.click(ok.x, ok.y); await page.waitForSelector('.leaflet-popup .pp h2', { timeout: 5000 }).catch(() => {});
    const h2 = await page.evaluate(() => { const e = document.querySelector('.leaflet-popup .pp h2'); return e ? e.textContent : null; });
    done++; if (!h2 || !h2.includes(label)) bad.push(`${id} → ${h2}`);
    await page.keyboard.press('Escape');
  }
  t(`clicking a probe point of each overlay opens the card of the topmost faction (${done}/${probes.length})${bad.length ? ' — ' + bad.join(' | ') : ''}`, done === probes.length && bad.length === 0);
  await ctx.close();
});

await run('flat map: cards, legend and audit tab', async () => {
  const { ctx, page } = await open2D({ viewport: { width: 1500, height: 1000 } });
  const card = async (id, q) => {
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.leaflet-popup .pp'), null, { timeout: 5000 }).catch(() => {});
    await page.locator('#tab-cari').click(); await page.locator('#q').fill(q);
    const li = page.locator(`#results .res[data-fac="${id}"]`); await li.first().click();
    const want = FAC[id].name;
    await page.waitForFunction((n) => { const h = document.querySelector('.leaflet-popup .pp h2'); return h && h.textContent === n; }, want, { timeout: 8000 });
    return page.evaluate(() => document.querySelector('.leaflet-popup .pp').innerText);
  };
  const kl = await card('kloaka', 'Kloaka');
  t('Kloaka card: "kerajaan nominal, tanpa penegakan", Faction Type Kingdom, relief-valve role, open knobs listed as Terbuka', /kerajaan nominal, tanpa penegakan/i.test(kl) && /Kingdom/.test(kl) && /katup pelepas tekanan/i.test(kl) && /TERBUKA/.test(kl) && /KANON/.test(kl), kl.slice(0, 200));
  const sv = await card('satvan_pedalaman', 'Satvan Pedalaman');
  t('Satvan card: PLACEHOLDER, bukan kanon; not sovereign; ring rule #209 → Unaffected; legal status Terbuka', /PLACEHOLDER, bukan kanon/.test(sv) && /bukan wilayah berdaulat/i.test(sv) && /Unaffected/.test(sv) && /#209/.test(sv) && /TERBUKA/.test(sv), sv.slice(0, 200));
  const mk = await card('hes_marka', 'marka');
  t('Marka card: kerajaan (not provinsi, not federasi), PLACEHOLDER, contents Terbuka', /bukan provinsi/.test(mk) && /PLACEHOLDER, bukan kanon/.test(mk) && /TERBUKA/.test(mk));
  const hp = await card('hesperia', 'Hesperia');
  t('Hesperia card: Empire, ±50 provinsi in three belts 24/19/7, nominal jurisdiction (#215), belts optional', /Empire/.test(hp) && /±50 provinsi/.test(hp) && /24/.test(hp) && /19/.test(hp) && /yurisdiksi nominal/i.test(hp) && /opsional/i.test(hp), hp.slice(0, 200));
  const fo = await card('foedera', 'Foedera');
  t('Foedera card: unclipped nominal claim, cheap control, bonds are working labels, no subdivision drawn', /tidak dipotong/i.test(fo) && /murah/i.test(fo) && /LABEL KERJA/.test(fo) && /tidak menggambar subdivisi/i.test(fo), fo.slice(0, 200));
  const ca = await card('cassivalla', 'Cassivalla');
  t('Cassivalla card: title "Cassivalla"; "Provincia Cassivallae" only as a labelled Foedera exonym', /^Cassivalla/.test(ca) && /eksonim Foedera/i.test(ca) && (ca.match(/Provincia Cassivallae/g) || []).length === 1, ca.slice(0, 160));
  const beltCard = await card('hes_pesisir', 'Sabuk Pesisir');
  t('Belt card: working label tag (#212) and "batas provinsi tidak digambar"', /Label kerja \(#212\)/.test(beltCard) && /batas provinsi tidak digambar/i.test(beltCard));
  await page.keyboard.press('Escape');
  // legend follows the layer state
  await page.locator('#btn-legend').click();
  const lg0 = await page.evaluate(() => document.getElementById('legend').innerText);
  const sw = await page.evaluate(() => document.getElementById('legend').querySelectorAll('svg pattern').length);
  t('legend: Imperial Commonwealth (payung nominal), Hesperia · Paramount (yurisdiksi nominal), Kerajaan-kerajaan Commonwealth (marka), Satvan zone, Foedera claim + core, Cassivalla, Kloaka claim + control zone; belts absent while the layer is off',
    ['Imperial Commonwealth: payung nominal', 'Hesperia: Paramount (yurisdiksi nominal)', 'Kerajaan-kerajaan Commonwealth: sabuk marka', 'Satvan Pedalaman', 'Foedera: klaim luas', 'Foedera: inti berpenduduk tipis', 'Cassivalla', 'Kloaka: klaim nominal', 'Kloaka: zona kontrol bergeser'].every((s) => lg0.includes(s)) && !/Sabuk Pesisir/.test(lg0) && !/vasal/i.test(lg0.replace('contested / dianeksasi / vasal', '')) && !/Provincia/.test(lg0), lg0);
  await page.locator('#tab-layer').click(); await page.locator('#ly-t_hesb').check();
  const lg1 = await page.evaluate(() => document.getElementById('legend').innerText);
  t('legend shows the three belts once the belt layer is on', /Sabuk Pesisir · 24/.test(lg1) && /Sabuk Transisi · 19/.test(lg1) && /Sabuk Pedalaman · 7/.test(lg1));
  await page.locator('#ly-t_sat').uncheck(); await page.locator('#ly-t_foe').uncheck();
  const lg2 = await page.evaluate(() => document.getElementById('legend').innerText);
  t('legend drops entries of layers that are off', !/Satvan Pedalaman/.test(lg2) && !/Foedera: klaim luas/.test(lg2) && /Hesperia: Paramount \(yurisdiksi nominal\)/.test(lg2));
  t('legend swatches reuse the map patterns (hatch for the marka belt, Foedera claim and Cassivalla; dots for the Satvan and Kloaka zones)', sw === 5, String(sw));
  // audit tab
  await page.locator('#tab-audit').click();
  const au = await page.evaluate(() => Array.from(document.querySelectorAll('#sec-audit .card')).map((c) => [c.querySelector('.kind').textContent, c.querySelector('h4').textContent]));
  t(`audit tab lists all ${DATA.audit.length} cards, including the new blank-spot and pattern cards`, au.length === DATA.audit.length && au.some(([k, h]) => k === 'Blank spot' && /Satvan/.test(h)) && au.some(([k, h]) => k === 'Blank spot' && /Kloaka/.test(h)) && au.some(([k, h]) => k === 'Pola' && /Satu kata, satu aturan/.test(h)), JSON.stringify(au.map((a) => a[1].slice(0, 30))));
  const ct = await page.evaluate(() => Array.from(document.querySelectorAll('#sec-audit .card')).find((c) => /Catok/.test(c.textContent)).innerText);
  t('audit tab shows the Catok card with the measured seam numbers', /≈\d+ km di dalam poligon Foedera/.test(ct));
  await ctx.close();
});

// ================================================================== 8. globe 3D: same table, same order, same hit-test
await run('globe 3D: new layers, painting and hit-test follow the shared rules', async () => {
  const { ctx, page, ev } = await newPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(srv.url + '?view=3d', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__rhGlobe && window.__rhGlobe.isShown(), null, { timeout: 90000 });
  await page.waitForFunction(() => window.__rhGlobe.info().frames >= 6, null, { timeout: 90000 });   // steady state: textures uploaded, shaders compiled
  const st = await page.evaluate(() => window.__rhGlobe.layerStatus());
  t('globe has an adapter for the belt and Satvan layers; belts start off, Satvan on (state shared with the flat map)', st.t_hesb && st.t_hesb.adapter3D && st.t_hesb.on === false && st.t_sat && st.t_sat.adapter3D && st.t_sat.on === true, JSON.stringify([st.t_hesb, st.t_sat]));
  await page.evaluate(() => { const c = window.__rhGlobe._ctx; c.setLayer('t_hesb', true); });
  const hit = (la, lo) => page.evaluate(([a, b]) => window.__rhGlobe._layers.hit(a, b, 0.02), [la, lo]);
  const topAt = (la, lo, on) => { const ord = C.terrOrder(TERR).filter((x) => x.id !== 'anusarri' && on.has(C.tgroupOf(x))); for (let i = ord.length - 1; i >= 0; i--) if (inTerr(ord[i], la, lo)) return ord[i].of || ord[i].id; return null; };
  const probes = ['hesperia', 'hes_pesisir', 'hes_transisi', 'hes_pedalaman', 'hes_marka', 'satvan_pedalaman', 'satvan_pedalaman__t2', 'kloaka', 'kloaka_zona__t2', 'foedera', 'foedera_inti', 'cassivalla', 'ir_2', 'nundina'];
  const bad = []; let n = 0;
  for (const id of probes) for (const [la, lo] of sample(T(id), 6)) {
    const want = topAt(la, lo, ALL), h = await hit(la, lo); n++;
    // a route line or the Scar band can sit on top of a polygon (they are above the territories in both views): only compare when the hit is a faction
    if (h && h.type === 'faction' && h.id !== want) bad.push(`${id}@${la.toFixed(1)},${lo.toFixed(1)} → ${h.id} ≠ ${want}`);
    if (h && h.type !== 'faction' && !['route', 'place'].includes(h.type)) bad.push(`${id} → ${h.type}`);
  }
  t(`globe hit-test returns the topmost faction in the canonical order (${n} probes over ${probes.length} territories)${bad.length ? ' — ' + bad.slice(0, 4).join(' | ') : ''}`, bad.length === 0);
  const sh = await page.evaluate(() => { const c = window.__rhGlobe._ctx; Object.keys(c.LAYERS).forEach((k) => c.setLayer(k, false)); const L = window.__rhGlobe._layers, cv = window.__rhGlobe._S.overlayTex.image;
    const alpha = () => { L.repaint(); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i]; return s; };
    const out = { none: alpha() }; ['t_sat', 't_hesb', 't_hes', 't_foe', 't_lain'].forEach((k) => { c.setLayer(k, true); out[k] = alpha(); c.setLayer(k, false); }); return out; });
  t('each new or reworked territory layer paints the globe overlay on its own (alpha > 0; nothing when all are off)', sh.none === 0 && ['t_sat', 't_hesb', 't_hes', 't_foe', 't_lain'].every((k) => sh[k] > 0), JSON.stringify(sh));
  const noise = ev.console.filter((m) => !/willReadFrequently/.test(m));   // the test's own getImageData reads trigger that Chrome hint (same filter as disk.mjs)
  t('globe: no console errors or warnings', ev.errors.length === 0 && noise.length === 0, JSON.stringify([ev.errors, noise]));
  await ctx.close();
});

await browser.close(); await srv.close();
console.log(`\npolitics: ${pass} passed, ${fail} failed${fail ? '\nFAILED: ' + failures.join(' | ') : ''}`);
process.exit(fail ? 1 : 0);
