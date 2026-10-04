# Political layer v3 — Vasal Commonwealth retired, Hesperia belts, Satvan zone, two-layer Foedera and Kloaka

Political-layer change of 2 Oct 2026 (AS 1647 snapshot), built on branch `feat/politics-v3`, viewer **v1.7.0**. It finishes the overhaul that began with the Interregna mosaic ([`INTERREGNA_V2_NOTES.md`](INTERREGNA_V2_NOTES.md)): the three numbered *Vasal Commonwealth* polygons are retired, and the big powers are redrawn to say what the canon says about them — how much of a polygon is *claimed* and how much is *ruled*. Epistemic labels follow the project's four levels: **Kanon** (locked), **Turunan** (derived from canon), **Inferensi AI** (proposed, provisional), **Terbuka** (deliberately unlocked).

Nothing here is canon unless it says so. Every number below that is not a canon value is a **placeholder**, labelled *usulan* / *Inferensi AI* in the viewer, and is recorded in the project's Kontrak Data. Canon flows one way: vault → map.

## 1. What changed, and what did not

| | |
|---|---|
| **Physical layer** | untouched: `assets/*` are byte-identical to `main`, and the six physical-layer hashes in `tests/canon-hashes.json` did not change |
| **Interregna mosaic (25 polities, PR #9)** | not redone, not moved: every Interregna ring in `data/politics.json` is byte-identical to `main` |
| **Geometry that did not change** | Hesperia, Foedera, Cassivalla, Nundina, Aventalia, Tarvenna, Liminara, Ktonia, Pylora, Anabasim, Emporys, Peratēs, Andurā, the Mandala, every region (Vasundha included), every route, contour and ocean bank. Checked against `main` ring by ring |
| **Retired** | the three *Vasal Commonwealth* polygons (ids with the prefix `cw`): data, faction cards, legend group, popups, audit text. They were drawn on the assumption that Hesperia is an empire under a wide umbrella of vassals; that is not canon (Canon Index #213). They are **not** merged into Hesperia |
| **New polygons** | `hes_marka` (the *kerajaan marka* belt), `hes_pesisir` / `hes_transisi` / `hes_pedalaman` (Hesperia's three belts), `satvan_pedalaman` (dispersal zone), `foedera_inti` (thin-populated core), `kloaka_zona` (shifting control zone) |
| **Changed** | `kloaka`: its polygon is cut free of its neighbours (§5.5). Text only: Hesperia, Foedera, Cassivalla and Kloaka cards; the Cassivalla alias and the Foedera and Florian-front notes (vocabulary, §3) |
| **Records** | territories 41 → **49** records = 45 drawn polygons + 4 draw-only *tier* records (see §4); factions 42 → **46** (−3 retired, +7 new cards) |
| **Audit tab** | 11 → **20** cards: four new blank spots, one friction card, three pattern cards, one closure; *Catok tiga rahang* rewritten with measured numbers |
| **Viewer** | v1.6.5 → **1.7.0**: 25 → **27** layers; one shared style / order table for the flat map, the globe and the dual-disk map (§4) |
| **Canon hashes** | `data/data.json` and `data/politics.json` are **re-pinned** in `tests/canon-hashes.json` (the political layer is a snapshot that may change without a physical-layer version, see `ARCHIVE_NOTES_v4.md`) |
| **Code** | new `src/politics_v3.py` (generator + validator), new `tests/politics.mjs`; `src/build_data.py` and `src/places_data.py` (cards, audit, vocabulary); `app/core.js`, `app/app.js`, `app/globe/layers.js`, `app/disk.js`, `app/style.css`; `index.html` rebuilt with `scripts/build_index.py` |
| **Not added** | no marker, no place, no capital, no name for any new polygon. No new Canon Index entry, no edit to any Atlas or Powers page |

## 2. Canon basis, and what stays open

Tiers are the Canon Index's own: **T2** (in force, revisable with justification) and **T3** (working canon, still being developed). Nothing below is T1.

- **Kanon, locked at the source (*Established*)**
  - Atlas and Powers — Hesperia: Faction Type *Empire* (Senate + Imperator); the Commonwealth is a confederation of vassal kingdoms under Hesperia's umbrella; the non-aligned kingdoms sit in the central corridor between Hesperia and Foedera.
  - Powers — Kloaka: a hollow kingdom, a nominal king who still exists, no enforcement, zones of influence whose borders move with the last fight; Faction Type *Kingdom* kept on purpose; Kloaka is the system's pressure-release valve, a space and not a player — **not** a geopolitical buffer.
- **Canon Index entries the map follows**
  - #208 (T2) — the physical layer is stable; the political layer is an AS 1647 snapshot that may move.
  - #209 (T2) — the Scar ring rule: *Within* ≤ 6.5°, *Adjacent* ≤ 19.5°, *Peripheral* ≤ 32.5°, *Unaffected* beyond.
  - #211 (T2) — Foedera's three bonds (Marka Inti / Komunitas Berpakta / Wilayah Caplokan). The names are **working labels**; the map draws no subdivision.
  - #212 (T2) — Hesperia's provinces come in three belts by distance to the sea, with no civil level above the province. The figure of about 50, the split **24 / 19 / 7**, the size of each belt and the belt names are *Inferensi AI — Sedang* and working labels, even though they sit inside a T2 entry.
  - #213 (T3) — the political map is read again: Commonwealth I / II / III retired as a vassal block; the central corridor filled by the Interregna; the remaining vassals a narrow *kerajaan marka* belt; the southern interior a Satvan Pedalaman dispersal zone (very low density, not sovereign). The Geographic Range of Satvan Pedalaman stays a proposal.
  - #214 (T2) — vocabulary (§3).
  - #215 (T3) — a Hesperia or Foedera polygon is **nominal jurisdiction**, not settled land; the asymmetry is the cost of control per km².
  - #216 (T3) — Kloaka stands because nobles of several jurisdictions back it (the core is an owner decision; the mechanism is *Inferensi AI — Sedang*).
- **Turunan**: the belt boundaries are computed from the physical coastline (distance to the sea); the Satvan zone's ring against the Scar follows from #209 and the polygon.
- **Inferensi AI**: every width, buffer, threshold, tier and density in §4 and §5 — the *kerajaan marka* width, the Satvan band, the Foedera core, the Kloaka zone — and all colours and patterns. The figures of Powers — Hesperia (≈ 12.55 Mkm², median distance to the sea ≈ 1,050 km, ≈ 140 / 300 / 550 k km² per province, 26.2 / 44.9 / 28.8 %, ≈ 5,300 km of coast) are *Inferensi AI — Sedang* too; the map uses them as targets, not as facts.
- **Terbuka — deliberately not answered here**: the number and identity of the kingdoms inside the *marka* belt; the legal status of Satvan *inside* Hesperian or Foedera jurisdiction ("tidak terhitung", an open fauna-law label); the open knob *Satvan Perbatasan* (this zone is **not** it); the three open Powers — Kloaka knobs (a mini-kingdom zone? hidden resources? does the king know what his title is worth?); who the Kloaka nobles are; whether Kloaka is a geopolitical buffer between Hesperia and Foedera (canon says pressure valve, and the map does not canonise the other reading); the number and names of the Interregna; the names of the provinces, the exact belt borders and the in-world terms for the belts.

## 3. Vocabulary (#214), enforced in data, legend and cards

| Word | Used for | Never for |
|---|---|---|
| **provinsi** | land ruled directly by Hesperia (the 24 / 19 / 7) | Cassivalla, Commonwealth members, anything of Foedera |
| **kerajaan** | a member of the Commonwealth (a confederation of vassal kingdoms) | "provinsi", "federasi" |
| **kerajaan marka** | the vassal kingdoms on the edge of Hesperia's direct land | — |
| **Cassivalla** | the name on the map, in the legend and on the card | — |
| *Provincia Cassivallae* | **only** as a labelled Foedera exonym in Cassivalla's popup | a title, a layer or a legend entry |

Powers — Foedera still says "provinsi" in two places (Founded; Structure). That is a vault page the map may not edit, so it is recorded as a **friction card** in the audit tab; the map's own notes use "wilayah".

## 4. The composition

`px` = labelled pixels of the 4096 × 2048 grid (12.7 km/px; ≈ 150 km² per px at these latitudes); the area is computed on the sphere. Rows are in **drawing order** (bottom → top): the same order is used on the flat map, the globe, the dual-disk map, and in hover and click.

| group (layer) | id | what it is | px | ≈ Mkm² | drawn as |
|---|---|---|--:|--:|---|
| `sat` | `satvan_pedalaman` (+ `__t1`, `__t2`) | dispersal zone, not sovereign | 46,717 · 32,531 · 16,266 | 5.92 · 4.14 · 2.06 | three nested dot densities, **no outline** |
| `hes` | `hesperia` | nominal jurisdiction, **one** polygon, not clipped | 80,159 | 12.57 | as before |
| `hes` | `hes_marka` | *kerajaan marka* belt | 14,543 | 2.17 | hatching, thin outline |
| `hesb` | `hes_pesisir` | belt 1 — 24 provinces | 20,601 | 3.29 | flat tint, no outline — **off by default** |
| `hesb` | `hes_transisi` | belt 2 — 19 provinces | 35,744 | 5.65 | flat tint, no outline — **off by default** |
| `hesb` | `hes_pedalaman` | belt 3 — 7 provinces | 23,751 | 3.63 | flat tint, no outline — **off by default** |
| `foe` | `foedera` | wide claim, **not clipped** | 105,235 | 16.66 | light hatching |
| `foe` | `foedera_inti` | thin-populated core along the waterways | 12,643 | 2.04 | flat tint, no outline |
| `foe` | `cassivalla` | annexed (unchanged geometry) | 5,641 | 0.87 | hatching, as before |
| `lain` | `kloaka` | nominal claim | 1,328 | 0.21 | thin **dashed** outline, almost no fill |
| `lain` | `kloaka_zona` (+ `__t1`, `__t2`) | shifting control zone, *inside* the claim | 1,076 · 801 · 462 | 0.17 · 0.13 · 0.07 | three nested dot densities, **no hard edge** |
| `int`, `ana`, `elv`, `lain` | the rest | unchanged | | | unchanged |

*Tier records* (`__t1`, `__t2`) exist only so that a dot pattern can be denser towards the middle of a zone. They carry `of` (their parent) and `tier`, are never listed, searched or counted as a polity, and answer a click or a hover as their parent.

Group order bottom → top (`C.TGROUPS` in `app/core.js`): Satvan zone, Hesperia + *marka*, Hesperia belts, Foedera (claim, then core, then Cassivalla), Interregna, Anabasim, Andurā + Anušarri, the rest. Before this change the flat map's stacking depended on the order in which layers were toggled; it now comes from one table that the three views share.

## 5. How each piece is drawn

`src/politics_v3.py` is deterministic (seed 1647) and repo-relative; it needs `work/terrain_4096.npz` (step 1 of the pipeline). It reads `data/politics.json`, rewrites only the blocks listed in §1 and records its parameters and measurements in a `v3` block of that file.

### 5.1 Hesperia — one polygon, three optional belts

Hesperia stays **one** polygon, not clipped (#215): Hesperia is expensive to rule (governors, census, taxes), so the number of governors bounds the land, but the polygon is the jurisdiction on paper. The three belts are a *layer*, default off, computed from the distance to the sea (Mare Internum + Sinus Adventus):

| belt | provinces | threshold | area | share | mean province |
|---|--:|---|--:|--:|--:|
| Pesisir | 24 | ≤ 603 km | 3.29 Mkm² | 26.2 % | ≈ 137 k km² |
| Transisi | 19 | 603 – 1,499 km | 5.65 Mkm² | 44.9 % | ≈ 297 k km² |
| Pedalaman | 7 | > 1,499 km | 3.63 Mkm² | 28.9 % | ≈ 519 k km² |

The median distance to the sea is 1,056 km (the vault says ≈ 1,050). The belts tile the Hesperia polygon (≥ 99.5 % covered, ≤ 0.5 % overlap). **No per-province border is drawn** — the data does not say where a province ends.

### 5.2 Kerajaan marka — a narrow belt, not a country

One connected belt on the south and south-west land edge of Hesperia's direct land, **250 km** wide nominal (± 35 % variation), 2.17 Mkm² (17 % of Hesperia's area). It touches Hesperia and overlaps nothing: not Hesperia, not the Interregna, not Foedera, not Kloaka. The number and identity of the kingdoms inside it is Terbuka, so no line is drawn inside the belt. Hatching marks vassal land, as everywhere else on the map.

### 5.3 Satvan Pedalaman — a dispersal zone, not a territory

A band **800 km** wide in the southern interior (centroid ≈ 39.3° S, 9.0° W), 5.92 Mkm², drawn as dot density only: **no outline**, because the canon draws no line and the Satvan are not sovereign here. Buffers, with the validator's one-pixel (12.7 km) tolerance:

| from | required | measured minimum |
|---|--:|--:|
| Hesperia's *Sabuk Pedalaman* (iron and nickel mines) | 700 km | 751 km |
| the Interregna | 1,000 km | 999 km |
| Foedera and its eastern neighbours | 300 km | 1,348 km |
| Vasundha (not moved) | 150 km | 803 km |

The distance to the *kerajaan marka* is ≥ 426 km (warning threshold 300 km). Against the Scar the whole zone is **Unaffected** (37.6° – 61.8° from the curve; centroid 55.2°), by the #209 ring rule — **Inferensi AI**. The zone is not the open knob *Satvan Perbatasan*, and it makes no statement about the legal status of Satvan inside Hesperian or Foedera jurisdiction.

### 5.4 Foedera — big claim, thin core

The polygon is **not clipped**: control is cheap (garrisons on the line), unlike Hesperia, so a claim much wider than the settled land is plausible. Two layers: the whole polygon as light hatching (the claim), and a flat tint for a **thin-populated core** of 2.04 Mkm² (12 % of the claim) along the waterways — rivers whose flow accumulation exceeds 2 × the river threshold, with a width that grows with the flow (2 px + 1.2 px per doubling, capped at 6 px), plus 130 km strips along the sea and lakes of ≥ 40 px. Synodia must lie inside the core (validated). The three bonds of #211 are a working label on the card and in the legend; **no subdivision is drawn**.

### 5.5 Kloaka — a kingdom that does not enforce

Position **unchanged** (Inferensi AI — Rendah: the canon has no location). Two layers: a thin dashed polygon (the *nominal claim*) and, inside it, a dotted zone with no hard edge (the *shifting control*; three nested tiers eroded 2 / 5 / 9 px from the claim's edge, with 2.2 px noise at the border so no tier looks like a line). The popup says **"kerajaan nominal, tanpa penegakan"**. The old polygon overlapped its neighbours by 11 px (9 with Hesperia, 1 with Foedera, 1 with `ir_7`); the claim is cut free of them — the neighbours are **not** touched — and went from 1,348 to 1,328 px, both rasterised from the rings (IoU with the old drawing ≥ 0.96, enforced; the old record's `px` field said 1,366, a label count from before the rings were traced, so it is not the like-for-like figure). Kloaka is not merged into the Interregna and is not drawn or described as a Hesperia–Foedera buffer.

## 6. The viewer

- **Shared table.** `C.TGROUPS`, `C.TDEFAULT`, `C.tgroupOf`, `C.terrOrder`, `C.terrStyle`, `C.patKey` / `patSVG` / `patTile` in `app/core.js` are the single source for group, order and style; the flat map, the globe and the dual-disk map all read them, so the three views cannot drift apart. That includes the dual-disk map's table of layers that have an adapter (it is built from `C.TGROUPS`; a hard-coded list had left the two new groups without one, which `tests/disk.mjs` caught). The flat map restacks its SVG after every toggle (`LAYERS[k].after`).
- **Two new layers**, 25 → 27: *Sabuk provinsi Hesperia · Pesisir / Transisi / Pedalaman (usulan, opsional)* — default off — and *Zona persebaran Satvan Pedalaman (usulan · bukan wilayah berdaulat)*. The choice is persisted like every layer.
- **Patterns**: *arsir* = claimed, contested, annexed or vassal land; *bintik* (dots) = a diffuse zone with no edge. The dot spacing is constant on screen and does not follow the zoom. The legend swatches use the same patterns.
- **Cards and popups** are data-driven: each new card carries its epistemic chips, its own *method* line (how the shape was made — the default sentence about the terrain-aware partition would be wrong for a belt or a dot zone) and the canon facts it rests on, each with its chip. Long popups scroll (`maxHeight`) instead of running off the screen.
- **Hit-test** is "topmost wins" in the shared order on all three views; tier records answer as their parent.

## 7. Guard rails — what the validator enforces

`python src/politics_v3.py` prints the report; **`--write` refuses to write if any check fails.**

- no id with the prefix `cw`; every ring is closed (≥ 4 points), in range, and each record has at least one;
- ring versus source mask IoU ≥ 0.985 (the three belts), 0.97 (marka, Satvan, core), 0.95 (the tiers, the Kloaka zone);
- `hes_marka`: zero overlap with any other polygon, ≥ 400 px of contact with Hesperia, one connected component;
- the Kloaka claim: zero overlap with any other polygon; the zone and its tiers sit inside the claim (≥ 97 %) and nest; the pre-v3 state is pinned (1,348 px, 11 px overlap) so that `--write` stays idempotent;
- the three belts cover Hesperia (≥ 99.5 %), overlap ≤ 0.5 %, leak ≤ 0.3 %; the area shares are within 0.5 point of 26.2 / 44.9 / 28.8 %; the median distance to the sea within 50 km of 1,050 km; the mean province size of each belt within 12 % of ≈ 140 / 300 / 550 k km²; Hesperia within 0.15 Mkm² of 12.55 and Foedera within 0.2 Mkm² of 16.6;
- the Foedera core: inside the polygon (≥ 98.5 %), overlapping no other polygon, containing Synodia, 8–25 % of the claim;
- Satvan: overlapping nothing (including the *marka* belt), the four buffers above, a consistent Scar ring, nested tiers.

`tests/politics.mjs` (84 checks, run by `tests/run-all.mjs`) re-checks the same promises on the *committed* data and on the three views: no retired id anywhere in the repo, the pinned hashes, group table and order, sampled geometry rules, vocabulary and chips, the audit cards and the *Catok tiga rahang* numbers, flat-map stacking / persistence / click, cards, legend, and the globe's hit-test and painting. `tests/disk.mjs` and `tests/feature3d.mjs` were updated for 27 layers and the shared order.

## 8. Re-running it

```
python src/terrain.py                 # only if work/terrain_4096.npz is missing (≈ 190 MB, bit-identical)
python src/politics_v3.py             # dry run: report only
python src/politics_v3.py --preview v3.png      # polygon preview
python src/politics_v3.py --write     # rewrites the v3 blocks of data/politics.json, nothing else
```

`build_data.py` still carries the archive's absolute paths (see the README), so mirror that folder, build, and copy back — and restore the two `elev` values (§9) before rebuilding the index:

```
mkdir -p /home/claude/rhykaris_map && cd /home/claude/rhykaris_map
ln -s <repo>/src/*.py .  &&  ln -s <repo>/work/terrain_4096.npz .  &&  cp <repo>/data/politics.json .
python build_data.py && cp data.json <repo>/data/data.json
# restore Ktonia elev 2940 and Pylora elev 1140 in data/data.json (§9)
python <repo>/scripts/build_index.py
```

`--write` is idempotent (a second run yields the same bytes), and `build_index.py` reproduces the committed `index.html` byte for byte from an unchanged tree. **To change a parameter**, edit the knobs at the top of `src/politics_v3.py` (`MARKA_KM`, `SAT_*`, `FCORE_*`, `KLZ_ERODE`), run the dry run, fix what the validator reports, then `--write`, rebuild and re-pin the two data hashes.

## 9. Limits, defaults taken, and what was left alone

- **Defaults.** Where the brief left something undecided, the most conservative and most reversible choice was taken: belts off by default; no per-province lines; no subdivision inside Foedera; no name for any new polygon; Kloaka not moved; the three open Powers Kloaka knobs left open.
- **"Empire" on the Hesperia card — verified, kept.** Atlas — Hesperia and Powers — Hesperia give Faction Type *Empire*, status *Established*. The label that was *not* canon was the wide vassal umbrella, which is what was retired.
- **Pre-existing discrepancy, not touched.** Rebuilding `data.json` from the committed sources gives `elev` 3055 for Ktonia and 1234 for Pylora, whereas the committed `data.json` carries 2940 and 1140. As in the Interregna change, the committed values are restored so that this diff is only the political layer; whichever is right belongs in a separate change.
- **Hesperia's coast.** The polygon stops ≈ 13 km (one grid pixel; p90 ≈ 18 km) short of the physical coast, and its coastal side measures ≈ 6,800 – 7,200 km against the ≈ 5,300 km of Powers — Hesperia (itself *Inferensi AI — Sedang*, and Powers notes that it depends on the tolerance of a political polygon that stops short of the physical coast). The polygon is **not** clipped (#215) and the physical coast is not moved; it is a blank-spot card in the audit tab.
- **Tiny pre-existing overlaps, left alone.** 42 pairs of older polygons overlap by 6,200 px in all, 4,096 px of it Foedera–Anabasim. They predate this change and are not part of it (the validator lists them as information).
- **Documentation screenshots retaken.** All eleven pictures in `docs/images/` (`01`–`10` and `social-preview.jpg`) were rebuilt with `tests/docshots.mjs`, which now also covers `01`–`05` (the flat map, light theme) and the social card (`sp`), writes JPEG directly, and freezes the moon clock so that a slow software renderer cannot move the phase it picked. The production families (Cinzel, Cormorant Garamond, IBM Plex Sans and Mono) came from the `@fontsource` npm packages, which are packaged from Google Fonts (latin and latin-ext subsets), through the script's local font cache; the recipe for that cache is in the script's header. The pictures therefore show the v1.7.0 interface (Globe 3D and Peta kerja buttons, compass, Ferrea and Errans) together with the new political drawing, and the old caveats about `06`, `07` and `10` no longer apply. The footer of the old `social-preview.jpg` carried a wrong repository name (`rhykaris-master-map`); it now reads `rhykaris-map`.
- **Not done.** No place, label or name; no change to the physical map or the 3D relief; nothing in the vault's canon pages. Factions without an address are not mapped. Every new coordinate or area above is a **proposal**.

## 10. Addendum, viewer v1.8.0 (3 Oct 2026) — the Imperial Commonwealth umbrella

**Request.** The big label *Hesperia* is replaced by **Imperial Commonwealth**, and Hesperia gets its own polygon described as the **Paramount** of that Commonwealth. (Hesperia + *marka* confirmed with the project owner; the *marka* belt moves to a layer of its own, *Kerajaan-kerajaan Commonwealth*.)

**What the canon says (and what is quoted, not decided).** Atlas — Hesperia: *wilayah asal Imperial Commonwealth, kursi paramount* — [Kanon]. Powers — Hesperia: Faction Type *Empire*, a Senate + an Imperator over a confederation of vassal kingdoms that shrinks when some leave but has not collapsed. So the *name* and the *paramount role* are Kanon rows on the new card. The vocabulary (#214) is kept: *kerajaan* is the word for Commonwealth members, so Hesperia is **never** called *Kerajaan Hesperia*; it is *Hesperia · Paramount*.

| piece | what it is | label |
|---|---|---|
| `imperial_commonwealth` (new, group `ic`) | the **union** of Hesperia and the *marka* belt, closed by at most 2 px so that no sliver is left between them, nothing else added. Drawn **beneath** both, dashed outline, light fill. It is nominal jurisdiction (#215), as every polygon on this map | name, paramount = Kanon · composition = Turunan · the *marka* side of the edge = PLACEHOLDER, bukan kanon |
| `hesperia` (group `hes`) | unchanged geometry (ring by ring identical to v1.7): the directly ruled land. Its card now opens with *Paramount* | Kanon (role) |
| `hes_marka` (group `cw`, new layer *Kerajaan-kerajaan Commonwealth*) | unchanged geometry; only the layer changed. Still PLACEHOLDER, bukan kanon | PLACEHOLDER |
| label place `imperial_commonwealth` (−18.0°, −26.0°) | the big label, a little south-west of where *HESPERIA* used to sit (moved so that it clears the Interregna and Mare Internum labels on a phone screen); no marker | the position = Inferensi AI |
| label place `hesperia` | moved to (−9.0°, −27.0°), caption *Paramount* | the position = Inferensi AI |

**Numbers.** Umbrella 94,726 px, two rings (the outer edge and Hesperia's lake hole) ≈ **14.75 Mkm²** = Hesperia 12.57 + *marka* 2.17 (the validator pins the sum within 0.05 Mkm²). Added by the closing step: ≤ 0.4 % of the umbrella.

**Why Hesperia was not redrawn.** Shrinking Hesperia to a "core" would leave land that belongs to nobody on the map. Who rules what outside the directly ruled land is a Worldbuilding decision, not a map decision, so the polygon stays as it was and the umbrella is built *around* it.

**Labels on a phone.** Two big labels over the same land do not fit side by side on a 390 px screen at the farthest zoom (measured: four label-box collisions, against one tiny one before). So at zoom 0–2 (flat map, globe and working map alike) only the umbrella name shows, a little smaller and without its caption; from zoom 3 the *Hesperia · Paramount* label and the caption *payung nominal* appear (CSS classes `minor2` and `sub3`, set from `LBL_MINOR2` / `LBL_SUB3` in `app/app.js`). The umbrella's label point was moved to −18.0°, −26.0° for the same reason; after that the only remaining overlap at 390 px is 2 px wide, none at zoom ≥ 3 on a phone or desktop.

**Layer order and hit-test.** `C.TGROUPS` is now `sat, ic, hes, cw, hesb, foe, int, ana, elv, lain`. The umbrella lies under Hesperia and the *marka* in all three views, so a click or hover on the land gives the Hesperia or *marka* card (topmost wins); the umbrella's own card opens from its label, the legend and the search. Layers 27 → 29; groups 8 → 10.

**Validator (`src/politics_v3.py`).** New block: IoU ≥ 0.985 against Hesperia ∪ *marka*; ≥ 99.5 % of each of them covered; added pixels ≤ 0.4 %; no overlap with another polygon beyond Hesperia's own (tolerance 25 px); one connected component; the same number of rings as Hesperia (a first version dropped the lake hole through the minimum-ring-size filter; the check now catches it). `--write` stays idempotent and every other record in `data/politics.json` is byte-identical to v1.7.

**Open (not decided here; questions for the Worldbuilding space).** How many vassal kingdoms there are and who they are; whether any vassal land lies beyond the *marka* belt; whether the umbrella has a capital or any other seat than the Paramount. Until then the umbrella's outer edge on the vassal side is the placeholder belt.

**Records after this change.** places 44 → **45**, factions 46 → **47**, territories 49 → **50** records (46 drawn polygons + 4 tier records), audit cards 20 → **21** (*Payung Imperial Commonwealth = Hesperia (paramount) + kerajaan vassal, bukan satu wilayah*). `data/data.json` and `data/politics.json` are re-pinned in `tests/canon-hashes.json`; the six physical-layer hashes are unchanged. As in §9, Ktonia (2940) and Pylora (1140) keep the committed elevations.

## 11. Update 4 Oct 2026 — the lake inside Hesperia (viewer v2.0.3)

**The report.** From a phone, zoomed in near 19° S · 16° W: a red polygon in the middle of Hesperia, with no name and no card of its own ("what is this?").

**What it was.** Not an entry and not a polity. It is the **second ring of `hesperia`** (8 points, about 7,000 km²) and of `imperial_commonwealth` (10 points, about 5,200 km²): the outline of an unnamed lake where several rivers meet, wholly inside both outer rings. It entered the data as a by-product of the land mask the polygons were cut from (§5.1): this one water body is coded as sea in the physical grid, while every other lake inside a polygon is coded land with the biome *Danau*, so only this one left a hole. The viewers draw each ring of a territory as its own filled shape, so the hole came out as a second, stacked red polygon.

**The decision.** A polygon is a nominal jurisdiction (#215) and is not cut by water; the other 14 or so lakes inside polygons are covered by them. So the lake is covered here too: **a ring that lies wholly inside another ring of the same territory is not drawn.** Two alternatives were rejected: drawing it as a true hole (a hole would claim "no jurisdiction here" for one lake out of fifteen, which is a Worldbuilding statement, and it would break the rule that rings are never holes, see the Interregna notes §10), and editing the geometry (the generator cannot run outside the author's machine, and `data/politics.json` would need a re-pin for a display-only reason).

**How.** `C.drawRings(territory)` in `app/core.js` returns the rings to draw: the territory's own array when it has one ring, otherwise the rings that are not wholly inside a larger ring of the same territory (cached per territory). The flat map, the globe overlay and the working map call it instead of reading `t.rings`. Today it drops exactly two rings, the two lake rings; `ir_14`, `anabasim` and `andura` keep every ring because their extra rings are separate parts. A unit test fails if any other territory starts to lose a ring, so a new case needs a decision.

**What did not change.** `data/` and the geometry are byte-identical, the validator still requires the umbrella to have as many rings as Hesperia, and the hit-test is unchanged (a click on the lake gives the Hesperia card, as before). Other readers of `rings` (the mandala, the regions, zoom-to-faction bounds) are untouched. No canon parameter is added and none changes status; the display convention is logged in the Data Contract (D2).

**Left open.**

- *The lake has no name.* There is no canon entry for it in the Atlas. Whether it gets a name or an Atlas entry is a Worldbuilding decision; the map has not invented one.
- *The readout.* The position readout over the lake still says "Paparan / laut dangkal, −101 m", because the physical datagrid codes the lake as shallow sea. The physical layer is canon-stable (v4), so the correction waits for the next physical version.

**Tests.** `tests/unit.mjs`: `C.drawRings` (only Hesperia and the umbrella lose a ring, the dropped ring lies inside the drawn one and encloses water in the datagrid, separate parts keep all rings, data not modified; fails on v2.0.2). `tests/politics.mjs`: flat map (two polygons over the lake centre, three world copies each, Akṣata still six, a click gives the Hesperia card), globe and working map (canvas path calls of one repaint: lake vertices absent, outer rings and the exclave present). Four of these fail against the v2.0.2 build.
