# Stage 2 notes — 3D globe, relief, rotation, moons, compass

Viewer **v1.5** (stage 2a), **v1.6** (stage 2b + the optional dual-disk view), **v1.6.1** (measure tool in every view, §11) and **v1.6.2** (contrast of pressed buttons, §12). Built on branch `feat/stage-2-globe` and merged to `main` in pull request #1 on 1 Oct 2026.

This file records what was built, **why each judgment call went the way it did**, and what is deliberately *not* here. Epistemic labels follow the project's four levels: **Kanon** (locked), **Turunan** (derived from canon), **Inferensi AI** (proposed, provisional), **Terbuka** (deliberately unlocked).

## 1. What changed, and what did not

| | |
|---|---|
| **Canon files — byte-identical to `main`** | `assets/base_4096.png`, `assets/base_q84.webp`, `assets/inset_40*`, `assets/datagrid.png`, the SVG preview, `data/data.json`, `data/politics.json` (hashes in `tests/canon-hashes.json`, checked by `tests/regress2d.mjs`) |
| **New files** | `app/core.js`, `app/moons.js`, `app/compass.js`, `app/disk.js`, `app/globe/*`, `data/moons.json`, `assets/3d/*`, `vendor/three/*`, `src/paths.py`, `src/make_relief.py`, `tests/*`, this file |
| **Modified** | `app/app.js` (layer registry with per-view adapters, view controller, card builders extracted), `app/body.html` (toggle buttons, globe tab — all inside `.v2-chrome`), `app/style.css` (a block appended; no pre-existing rule changed), `src/terrain.py` and `src/render.py` (repo-relative paths; `render.py --albedo`), `scripts/build_index.py` |
| **2D regression** | 16 scenes (both themes, desktop and phone, layer combinations, popups, readout, audit tab, and — since v1.6.1 — the measure tool) compared pixel by pixel against a baseline captured on `main` before any change: **0 differing pixels**; the console stays clean; **no request to three.js or to `assets/3d/` is made in 2D** |
| **Load cost in 2D** | `index.html` 1.68 → 1.86 MB (the lazy 3D code is inlined as inert `text/plain` blocks and never evaluated in 2D). Time until the map is ready, median of 25 cold loads: `main` 287 ms, branch 290 ms (+1.0 %, within noise) |
| **3D asset budget** | `assets/3d/` 9.08 MB (height 5.03 · slope 3.71 · albedo 0.33 · manifest) + three.js 0.67 MB = **9.75 MB**, under the ≈ 15 MB cap; downloaded only when a visitor enters 3D |

## 2. The views and how they share state

`rh-view` (`2d` | `3d` | `disk`, also `?view=`) remembers the last view. One **layer registry** (`reg(key, group, def)` in `app/app.js`) holds every layer once; each layer carries up to three adapters (flat Leaflet group, globe, disk). Toggling a layer in one view changes it in all (`rh-layers-v1` is the same key v1.4 used, so saved choices survive). A layer without an adapter in the current view stays visible in the panel, **disabled, with the reason written next to it**.

### Layer parity

All 25 layers of the v1.4 flat map have a globe adapter. Four layers exist only in 3D, two only on the disk.

| Layer (key) | Flat | Globe | Disk |
|---|:-:|:-:|:-:|
| Graticule 15° (`grat`) · Three meridians (`mer`) | ✓ | ✓ | ✓ |
| The Scar: 13° band (`band`) · small-circle curve (`curve`) · four arcs (`arcs`) | ✓ | ✓ | ✓ |
| Mass-anomaly pockets (`anom`) · Castra Birath zone (`zone`) · location markers (`markers`) | ✓ | ✓ | ✓ |
| Elevation contours (`cland`) · bathymetry contours (`csea`) · place and water labels (`labels`) · physical region outlines (`regions`) | ✓ | ✓ | — |
| Seven territory groups (`t_hes`, `t_foe`, `t_int`, `t_ana`, `t_elv`, `t_lain`, `mandala`) · fronts (`fronts`) | ✓ | ✓ | — |
| Four route kinds (`r_historic`, `r_land`, `r_story`, `r_sea`) · ocean banks (`banks`) | ✓ | ✓ | — |
| Two moons · orbit lines · rotation axis · ecliptic plane (`g_moons`, `g_orbits`, `g_axis`, `g_ecl`) | — | ✓ | — |
| Scar Proximity rings · Scar azimuth annotations (`d_rings`, `d_azi`) | — | — | ✓ |

`tests/feature3d.mjs` asserts the globe column from the live registry; `tests/disk.mjs` the disk column.

## 3. The globe (2a)

- **three.js r160**, pinned, loaded **lazily**: `fetch(url, {integrity})` → blob → `import()`. Sources in order: jsDelivr (serves the exact npm bytes), cdnjs, unpkg, then `vendor/three/three.module.min.js`. The SRI `sha384` is computed from the vendored file at build time and substituted into the loader. A source that fails or mismatches is skipped. cdnjs is listed second only because its path and hash could not be verified from the build sandbox; if its bytes differ, SRI makes it fall through harmlessly. No WebGL, or all sources failing → a toast says so and the viewer stays on the flat map.
- **Colour pipeline.** Colour management is switched off and output is linear-sRGB, so the canon raster is shown pixel-for-pixel as authored (a "raw sRGB" pipeline). The flat-lit globe is therefore faithful to the 2D map; no gamma shift.
- **Frame.** y = north, z toward longitude 0, x toward 90° E. The moon module works in a planet frame (x = lon 0, y = lon 90 E, z = north) and maps `(x, y, z) → (y, z, x)` into the scene.
- **Rotation.** Drag with inertia, wheel / pinch zoom, double-click to fly, keyboard. **Auto-rotation** turns the planet west → east (an illustrative direction: no canon fixes it), a full turn every 30–300 s (default 90 s), and **stops as soon as the globe is touched, clicked, dragged, or wheeled**; only the Putar button resumes it. With a *prefers-reduced-motion* system setting it is off and the button is disabled. A hidden tab stops rendering.
- **Pointer routing.** DOM pins are `pointer-events: none`; the canvas hit-tests markers itself (`pinAt`), so a drag can start on top of a marker without being swallowed.
- **Lighting.** Neutral and attached to the camera (`ambient .66 + diffuse .42`). Because **the axial tilt is unfixed (Terbuka #2)** the axis is drawn upright, the ecliptic parallel to the equator (both labelled *ilustratif*), and there is **no terminator, night side, or seasons**.
- **Epistemic honesty in 3D.** Chips stay visible (a strip at the bottom of the globe; relief = *Turunan*, moons = *Inferensi AI*). Castra Birath is a fading ring zone — a true spherical circle of the data's `zone_r`, never a point. The ocean banks are drawn as spherical caps. Nothing on the globe predicts or schedules the Great Wave (Tension #6).
- **Markers, labels, cards.** The globe reuses the flat map's declutter (`C.declutterNames`) and the same card builders (faction, mandala, route, bank, place), shown in one shared card (`#g-card`). The live readout (coordinates, distance to The Scar, elevation, biome) is the same as in 2D, fed by the point under the cursor, or by the view centre on touch screens.

## 4. The moons — parameters and provenance

All parameters are in `data/moons.json`, every value **Inferensi AI**, not canon, not in the Canon Index. They come from the owner's choice of reading *A* ("stable but wobbling") on 1 Oct 2026, from an N-body REBOUND run that survived ≥ 30,000 years.

| | Bulan Besar | Bulan Kecil |
|---|---|---|
| Origin | the Rhykar moon that survived intact; post-merger orbit | remnant of the Aëris moon; post-merger orbit, inside the big moon's |
| Radius | 2,000 km (0.2415 planet radii) | 500 km (0.0604) |
| Density · mass | 4.0 g/cm³ · 1.34 × 10²³ kg | 2.2 g/cm³ · 1.15 × 10²¹ kg |
| Semi-major axis | 285,000 km (34.4 R) | **125,000 km** (15.1 R) |
| Eccentricity | 0.04 | 0.12 (range 0.09–0.18) |
| Inclination | 4° | 20° (range 16–30°) |
| Period | 12.1 Rhykaris days = 14.1 Earth days | 3.55 Rhykaris days = 4.14 Earth days (ratio 3.41 : 1) |
| Apparent diameter | 0.80° | 0.41°–0.52° |
| Albedo · colour | 0.12 · dark iron-red grey | 0.5 · cream to milk-white |
| Rotation | tidally locked | not animated |
| Equilibrium tide | 4.5 m | 0.46 m (≈ 10 % of the big moon's) |

**Stability cliff.** The small moon's mean distance must stay **≤ 125,000 km**: the stability cliff is ≈ 131,000 km, and 133,000 km is lost within a century. The viewer never moves it outward, and `tests/unit.mjs` asserts the cap. The periods of the e and i oscillations were not measured, so those two are shown **only as ranges and are never animated**.

**Drawn *not to scale*.** True relative radii, but distances are compressed by a monotone power law `s(a) = K·a^p` (`p = ln(3.4/2.2) / ln(34.4/15.1) ≈ 0.529`, fitted so the inner orbit sits at 2.2 and the outer at 3.4 planet radii; order and ratios of the real orbits are preserved). The panel and the orbit layer say *jarak tidak berskala*. Orbital periods keep their true ratio, so the pair drifts in and out of phase correctly; Kepler's equation is solved per frame.

**Illustrative constants** (written in `moons.json` under `illustrative`, not simulation output, not canon): the orbital plane is drawn parallel to the equator (tilt is Terbuka), and ascending nodes (20°, 110°), arguments of periapsis (60°, 200°) and the initial mean anomalies (40°, 215°) are fixed, deterministic values chosen only so that the picture is reproducible and both orbits are readable. The origin text on each card is limited to the two sentences above.

## 5. The compass

`RH.compass` (`app/compass.js`) is one widget used by all three views. Two needles:

- **North** — the geodesic tangent toward the north pole at the reference point. On the globe and disk it is measured on screen from a 0.8° geodesic step, so it is right in perspective; on the flat map it is `C.screenDir2D`.
- **The Scar** — the great-circle bearing to the **nearest point of the Scar curve**, with its distance (`|d| × 144.55 km/°`). Inside the small circle (centre angle < 72.5°) the nearest point is directly *away* from the circle's centre, outside it is directly toward it; i.e. `bearing = toward-centre + 180°` inside, `toward-centre` outside. At exactly the circle's centre or its antipode there is no nearest point — the needle is hidden and says so (threshold 1 × 10⁻⁶°). Unit tests check the bearing and distance against a brute-force nearest-point search over the curve (400 random points, worst error < 0.06°), the inside/outside rule, the singular points, and the Dies Ignis and Libbāl reference values.
- The reference point is the point under the cursor, or the view centre when there is no pointer (touch). A badge notes when the point is on the far side of the globe.

## 6. Relief (2b) — Turunan

`src/make_relief.py` builds `assets/3d/`. Nothing in the canon `assets/` files is touched.

| File | Content |
|---|---|
| `height_4096.png` | land heights, 16 bit split over two 8-bit channels of a lossless PNG: **R = high byte, G = low byte**, `h = (256·R + G) / 65535 × 8192 m` (0.125 m step; tallest land point in the regenerated terrain is 7,362.6 m). Sea is 0 — the displacement is land-only and the sea stays flat |
| `slope.webp` | the surface gradient (east, north), lossless WebP, **square-root encoded** for precision near zero (`b = 127 + 127·sign(v)·√|v|`, `smax = 0.35`; 127 is exactly flat). The ocean floor carries a ×0.3 gentle slope so bathymetry is hinted, not shown |
| `albedo_q84.webp` | the v4 palette **without** baked hillshade (`render.py --albedo`), so lighting is dynamic |
| `relief.json` | manifest: sizes, constants, hashes, provenance, the verification result |

**Verification (mandatory).** The regenerated elevation (`terrain.py`, seed 1647), quantised the way `make_datagrid.py` does, was compared with the canon `assets/datagrid.png`: **100 % of pixels identical (max difference 0 codes)** — far above the ≥ 99.5 %-within-±1 requirement. The relief is therefore labelled **Turunan**. If a future regeneration fails the check, `make_relief.py` refuses it and builds a fallback from `datagrid.png` itself (bicubic ×4 plus a light Gaussian to remove the 60 m stair-steps), labelled **Turunan (diinterpolasi)**; `--force-fallback` exercises that path (run by hand, not part of the automated suite, because it needs the 190 MB intermediate). `tests/relief.mjs` covers the packed-asset side: manifest, 16-bit round trip, slope decode, and a GPU with `MAX_TEXTURE_SIZE` 2048 (the height texture is repacked at 2048 × 1024).

**In the viewer.** A custom shader displaces the sphere from the packed height (nearest-neighbour fetch plus a manual bilinear, so the two bytes are never blended), lights it with the decoded slope, and applies a **vertical-exaggeration slider, 0–60×, default 15×**, always labelled *tidak berskala* — real relief is ≈ ±10 km on a radius of 8,282 km (≈ 0.1 %). The relief light is a zero-mean perturbation on the neutral camera-attached light, so turning relief on does not darken or brighten the planet overall.

**Regenerating (≈ 5 minutes)**

```bash
pip install numpy scipy numba Pillow scikit-image
python src/terrain.py 4096 2048        # once, ~2 min → work/terrain_4096.npz (≈ 190 MB, git-ignored)
python src/make_relief.py              # → assets/3d/*  (prints the verification line first)
python scripts/build_index.py          # only if app/ changed
```

`work/` (or the folder in `$RHYKARIS_WORK`) and `terrain_*.npz` are git-ignored and must never be committed.

## 7. Dual-disk Lambert working map (optional, phase 3)

A third view for measuring and layout: the sphere as **two Lambert azimuthal equal-area disks**, **areas in true proportion**.

- Centre of the projection: the Scar's circle centre, `C = (−55.5°, 0°)`. With `a = C` as a unit vector, `u0` toward north and `u90 = u0 × a` (east), a point at angular distance θ from C and azimuth α is `P = cosθ·a + sinθ(cosα·u0 + sinα·u90)`. Disk radius `ρ = 2·Rs·sin(θ/2)`.
- Rhykar disk: rim at θ = 72.5° (ρ = 1.1826 Rs); Aëris disk: the complement, rim at 107.5° from the *antipode* (ρ = 1.6128 Rs). Areas **34.964 % : 65.036 %**, and `Σρ² = 4 Rs²` (the whole sphere). The Aëris disk is **mirrored**, because it is seen from the far side of the planet.
- Layout: landscape puts Rhykar on the left and Aëris on the right (the east slope, α = +90°, faces across the gap); portrait stacks them and rotates by 90°. A 4° faded margin continues the map past each rim.
- Radial scale is `cos(θ/2)` (≈ 0.59 at θ = 107.5°) — equal-area is not distance-true, and the footer says so.
- The texture is **reprojected** from the canon raster with a horizontal row prefilter weighted by cos(latitude) near the poles (without it the equirectangular poles alias).
- Layers: graticule, meridians, band, curve, arcs, markers, anomaly pockets, the Castra zone, plus disk-only Scar Proximity rings and azimuth annotations. The rest are disabled there with a stated reason (table in §2).

## 8. Autonomous decisions

Taken without asking, in the order the brief ranks priorities (1 no canon change · 2 no 2D change · 3 epistemic labels on every new number · 4 simplest option that works · 5 record it here).

1. **Lazy modules in one file.** The single-file `index.html` stays the delivery vehicle; globe and disk code is inlined as `text/plain` blocks and evaluated on first use. The flat map pays 0.18 MB of transfer and no execution.
2. **Direct pins vs. DOM pins.** Markers and labels on the globe are DOM elements positioned from the projection, with hit-testing done by the canvas (see §3), rather than raycast meshes: crisp text, same typography as 2D, and drags never get stuck on a marker.
3. **Moon scale.** Not to scale and labelled as such (brief); the radii ratio is kept true, only distances are compressed (§4).
4. **North needle semantics.** Geodesic tangent (not rhumb/grid north). Documented because "north" on a sphere projected onto a screen is an interpretation.
5. **Spin direction.** West → east, illustrative; no canon fixes the rotation sense.
6. **View memory.** The last view is remembered (`rh-view`), with `?view=` overriding it. New visitors always get the flat map.
7. **cdnjs second in the loader chain.** See §3.
8. **Mobile.** On phones the 3D and disk toggles live in the panel header (the top bar has no room next to the brand); the epistemic strip moves to the top, under the header; the card and the panel share the bottom sheet.
9. **Light-theme contrast.** Notes of the *new* panels got an ink-2 override so they pass 4.5:1. The pressed state of the toolbar buttons was a pre-existing 2D defect (4.02:1 in the light theme) that the Stage 2 brief did not allow touching; it is fixed in v1.6.2 (§12).
10. **Hidden tabs** do not render (`document.hidden` guard); reduced motion renders on demand.
11. **Banks as spherical caps; Castra zone as a true circle.** The globe draws what the data says (centre + radius) on the sphere, not a projected flat shape.
12. **Relief as a mode, not a replacement.** With relief off the globe shows the unmodified canon raster (`base_q84.webp`); with relief on it swaps to the unlit albedo and lights it dynamically — otherwise hillshade would be applied twice.

## 9. Tests

Run `cd tests && npm install && node run-all.mjs` (Playwright + headless Chromium, SwiftShader WebGL; ≈ 4 fps, so tests wait for steady state instead of fixed delays). CDN requests are served from the pinned `node_modules` copies, so the suite is offline and deterministic.

| Suite | Checks | What it proves |
|---|---:|---|
| `unit.mjs` | 517 | Pure maths loaded into a Node VM: great-circle helpers (round trips over random points), `scarCompass` (brute-force nearest-point check, inside/outside rule, singularities at the centre and the antipode, reference places), datagrid reader, Kepler solver (residual < 10⁻¹², converges at e = 0.18, Kepler-III period within 2 % of the table), moon parameters (small moon ≤ 125,000 km and inside the big moon's orbit, `moons.json` is *inferensi*), Lambert forward/inverse maths and area fractions |
| `feature3d.mjs` | ≈ 125 | Lazy loading (no three.js request in 2D; fallback when WebGL or the CDN fails), toggle, deep links, auto-rotation starts and stops on touch/click/wheel, pixel-vs-canon-texture correlation with shifted negative controls, moon visibility and labels, compass in 2D and 3D, layer registry parity, shared card, markers, mobile layout, theme |
| `relief.mjs` | 33 | Manifest, verification result, 16-bit round trip, slope decode, sea flat, exaggeration slider, fallback path (`--force-fallback`) |
| `disk.mjs` | 62 | Disk maths in the browser, layout in both orientations, layer adapters, equal-area ratio, Castra zone, compass |
| `a11y.mjs` | 22 | Names, roles, focus, keyboard reachability and contrast of the new controls in both themes |
| `measure.mjs` | 46 | The measure tool in every view (see §11): exact marker distances, great-circle line, dots and result box, antimeridian, rims of the working map, keyboard, phone layout, carrying a result between views |
| `regress2d.mjs` | 16 scenes | **Pixel-identical 2D** against the `main` baseline, canon file hashes, no console errors (needs `RH_BASELINE`) |

## 10. Known limitations and open items

- Needs WebGL and a web origin; `file://` works for 2D only.
- Moon parameters: Inferensi AI. The e/i oscillation periods were never measured; the orbit orientation, node, periapsis and phase are illustrative.
- The globe has no terminator, seasons or night side (axial tilt, Terbuka #2); the Great Wave is never predicted or scheduled (Tension #6).
- Dual-disk supports a subset of layers by design; richer disk layers are a possible follow-up, not a debt of this stage.
- The cdnjs path/hash of three.js could not be verified from the build sandbox; the SRI check makes a wrong guess harmless.
- ~~The pre-existing 2D pressed-button style has 4.01:1 contrast in the light theme.~~ Fixed in v1.6.2 (§12).
- Tested under SwiftShader (software GL), not on a physical GPU or phone; frame rate on real devices is unmeasured. Two moons plus a 4096 × 2048 height texture and slope map are modest, but a low-end phone may prefer relief off.

**Out of scope here (by the brief):** layer presets, hotspots, habitats, cover, the day/night terminator and tides → Stage 3; regional detail, rivers and trees → Stage 4.

## 11. Follow-up v1.6.1 — the measure tool in every view

**What was wrong.** In v1.5–v1.6 the **Ukur** button was disabled in the globe and on the working map (the tests even asserted it), and "Ukur dari sini" on a place card threw the visitor back to the flat map. The 14 regression scenes did not include the measure tool, so nothing flagged it.

**What it does now.** The button is enabled in all three views. The state machine (two points, hint card, result text, travel times) lives once in `app/app.js`; the globe (`app/globe/`) and the working map (`app/disk.js`) only (1) report the tapped point through `ctx.measureAt(lat, lon)` and (2) draw what `setMeasure(m)` hands them. The result text is built by the same two helpers as on the flat map, so the wording is identical in every view.

- **Points.** A tap on a marker (not a region label) uses the marker's exact coordinates; elsewhere it is the point under the pointer (`S.pick` on the globe, the inverse Lambert projection on the disks). Taps outside both disks are ignored. With a keyboard, Enter on a focused marker picks it while measuring instead of opening its card.
- **Line.** The great circle is sampled at 241 points (96 on the flat map, unchanged). On the globe it is painted into the overlay texture on top of every layer, with the same dashed style as the flat map, and the dots and result box are projected DOM pins that hide on the far side of the planet. On the working map the polyline is drawn per disk and stops at a rim, like the graticule; the distance is printed next to the destination.
- **Distance is the sphere's, not the picture's.** On the working map the on-screen distance is distorted (equal-area, not distance-true), so the number always comes from the great-circle formula on the two coordinates, never from pixels.
- **Between views.** A finished measurement is kept in `lastMeas` and redrawn when the visitor switches view; entering another view ends measure mode (no hint), and "Selesai" clears it everywhere. The result box on the flat map is re-created with the same code path as a live measurement.
- **Phones.** The hint card is long, so while it is open the epistemic chips move below it (`--mhint-h`) instead of hiding under it, and the duplicate result box on the globe is hidden.
- **Autonomous decisions.** Entering measure mode on the globe stops auto-rotation (aiming at a moving planet is hopeless); "Ukur dari sini" stays in the current view; the 2D code path was only refactored to share text builders — the new 2D scenes (`d-dark-measure`, `d-light-measure`) are pixel-identical to a baseline captured on the pre-Stage-2 `main`.

**Tests.** `tests/measure.mjs` (46 checks) plus the two measure scenes in `tests/regress2d.mjs`. `RH_ROOT=<folder>` lets `regress2d.mjs` capture a baseline from any other checkout.

**Known limits.** Travel times are the flat map's rough estimates (25 / 50 / 130 km per day). The measure line is not clipped to land or sea. A measurement started in one view is redrawn in the other views only after the switch completes (the working map rebuilds its texture first).

## 12. Follow-up v1.6.2 — contrast of the pressed toolbar buttons (WCAG AA)

**Finding (from the Stage 2 accessibility checks, logged in the backlog).** On the flat map, the pressed state of a toolbar button (Ukur, Legenda, …) used the page background colour as its text colour: **4.02 : 1** in the light theme (`#e9efee` on `#1d7f90`). While checking the fix, the same rule family showed a second defect: in the **dark** theme the *hover* of a pressed button used white on `--sea-2` (`#2f8fa0`) = **3.78 : 1**. Both are below the 4.5 : 1 that WCAG AA asks for normal-size text.

**Fix.** Two theme variables, `--on-sea` (text on `--sea`) and `--on-sea-2` (text on `--sea-2`), set in the four theme blocks: light `#fff` / `#fff` (4.68 / 7.18 : 1), dark `#0f1317` / `#0f1317` (8.50 / 4.94 : 1). `.tbtn[aria-pressed="true"]` and its hover use them. Backgrounds and borders are unchanged; only the text colour moved. The Stage 2 per-widget override for the new buttons became redundant and was removed (same result, one mechanism).

**Evidence.** `tests/a11y.mjs` gained four checks (both themes, at rest and hovered); they fail on the old stylesheet (4.02 and 3.78) and pass now. `tests/regress2d.mjs` run in exact mode (`RH_THRESHOLD=0`) against the baseline captured on the pre-Stage-2 `main` is byte-identical in 15 of 16 scenes; the 16th (`d-light-measure`, which shows a pressed Ukur button) differs only inside the 50 × 12 px of the button's label — the intended change.

**A note on "pixel-identical".** The 2D regression numbers quoted earlier (Stage 2 and v1.6.1) were taken with pixelmatch's default perceptual tolerance (`threshold 0.1`). The exact run above confirms those scenes are in fact byte-identical, so the claim stands; the exact mode is now one environment variable away.
