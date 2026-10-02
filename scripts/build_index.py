#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bundle the Master Map viewer into ONE self-contained ``index.html``.

Inputs (all inside this repository):
    app/body.html, app/style.css               viewer markup and styles
    app/core.js, moons.js, compass.js, app.js  viewer logic, concatenated in this order into one classic script
    app/globe/*.js                             3D globe (Stage 2); inlined but inert until the user enters 3D
    app/disk.js                                dual-disk Lambert working map (Stage 2, optional); inert until opened, no three.js needed
                                               (the relief assets in assets/3d/ are NOT inlined: fetched only when relief is switched on)
    data/data.json                             places, factions, territories, routes, audit, ...
    data/moons.json                            the two moons (AI inference, not canon) — single source of moon parameters
    assets/base_q84.webp                       global physical layer (4096 x 2048, equirectangular)
    assets/inset_40_q84.webp                   Sinus Adventus inset (40 px/deg)
    assets/datagrid.png                        R = elevation code, G = biome class (terrain readout)
    vendor/leaflet/leaflet.css                 Leaflet 1.9.4 stylesheet (BSD-2-Clause), inlined + minified
    vendor/three/three.module.min.js           three.js r160 (MIT): NOT inlined; only its SRI hash is computed here

Output:
    index.html                                 open by double-click, or serve the folder (GitHub Pages ready)

Only the Python standard library is needed. The bundling logic is a repo-relative port of
``src/build_html.py`` from the original archive (which uses absolute sandbox paths).

Usage:
    python scripts/build_index.py              # index.html with favicon + social-preview meta tags
    python scripts/build_index.py --no-meta    # exactly what the original archive build produced
    python scripts/build_index.py --out /tmp/preview.html
"""
import argparse
import base64
import hashlib
import json
import re
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Public URL of the deployed map. Used only for Open Graph / Twitter card tags.
# Change it if you fork the repository under another name.
SITE_URL = "https://rizkidwisulistianto-web.github.io/rhykaris-map"

FONTS = ('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700'
         '&family=Cormorant+Garamond:ital,wght@0,500;1,500;1,600'
         '&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap')

LOADER = """<script>
(function(){var srcs=['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js','https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'],i=0;
window.__rhFallback=function(){if(window.L)return;if(i>=srcs.length){if(window.__rhFail)window.__rhFail();return;}
var s=document.createElement('script');s.src=srcs[i++];s.onload=function(){if(window.__rhBoot)window.__rhBoot();};s.onerror=window.__rhFallback;document.head.appendChild(s);};})();
</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js" onerror="__rhFallback()"></script>"""

# Viewer version shown in the UI (Metode tab) and exposed as window.RH.version.
VIEWER_VERSION = "1.7.0"

# Order matters: each file extends the shared window.RH namespace created by the previous ones.
APP_JS = ["app/core.js", "app/moons.js", "app/compass.js", "app/app.js"]
# Inlined as inert text and only evaluated when the user first enters 3D (so the flat map never pays for it).
LAZY_JS = [("rh-disk", ["app/disk.js"]), ("rh-globe", ["app/globe/kit.js", "app/globe/scene.js", "app/globe/layers.js", "app/globe/bodies.js", "app/globe/relief.js", "app/globe/ui.js"])]
THREE_VENDOR = "vendor/three/three.module.min.js"

DESCRIPTION = ("Peta induk interaktif dunia Rhykaris — proyeksi equirectangular, The Scar, "
               "wilayah kuasa AS 1647, dan status epistemik tiap koordinat.")

SOCIAL_DESCRIPTION = ("Interactive atlas of Rhykaris, an original fantasy world: equirectangular master map, "
                      "The Scar, faction territories (AS 1647) and searchable lore. "
                      "Peta interaktif dunia fiksi Rhykaris.")

FAVICON_SVG = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>"
               "<rect width='32' height='32' rx='7' fill='#10161c'/>"
               "<path d='M3 17c4-7.5 8.6-10.5 13-10.5S25 9.5 29 17' fill='none' stroke='#ff6433' "
               "stroke-width='2.6' stroke-linecap='round'/>"
               "<circle cx='16' cy='22' r='1.9' fill='#f4ecd8'/></svg>")


def read_text(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def data_uri(rel, mime):
    return f"data:{mime};base64," + base64.b64encode((ROOT / rel).read_bytes()).decode()


def sri384(rel):
    return "sha384-" + base64.b64encode(hashlib.sha384((ROOT / rel).read_bytes()).digest()).decode()


def app_js():
    """core.js ... app.js as one script, with the SRI of the pinned three.js build substituted in."""
    js = "\n".join(read_text(f) for f in APP_JS)
    assert "sha384-__THREE_SRI__" in js, "core.js lost its THREE_SRI placeholder"
    return js.replace("sha384-__THREE_SRI__", sri384(THREE_VENDOR))


def lazy_blocks():
    out = []
    for sid, files in LAZY_JS:
        src = "\n".join(read_text(rel) for rel in files)
        # the source sits in <script type="text/plain">: it must not be able to close the element or open an HTML comment
        assert "</script" not in src.lower() and "<!--" not in src, f"{sid} contains a sequence that would break inline embedding"
        out.append(f'<script id="{sid}-src" type="text/plain">{src}</script>')
    return "\n".join(out)


def leaflet_css():
    css = read_text("vendor/leaflet/leaflet.css")
    # drop rules that reference relative images (default marker icons / layers control are unused)
    css = re.sub(r'[^{}]*\{[^{}]*url\(images/[^{}]*\}', '', css)
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    return (re.sub(r'\s+', ' ', css)
            .replace('; ', ';').replace(' {', '{').replace('{ ', '{').replace(' }', '}'))


def social_meta():
    icon = "data:image/svg+xml," + urllib.parse.quote(FAVICON_SVG, safe="/:=' ")
    img = f"{SITE_URL}/docs/images/social-preview.jpg"
    return (f'<link rel="icon" href="{icon}">\n'
            f'<meta property="og:type" content="website">\n'
            f'<meta property="og:title" content="Master Map Rhykaris">\n'
            f'<meta property="og:description" content="{SOCIAL_DESCRIPTION}">\n'
            f'<meta property="og:url" content="{SITE_URL}/">\n'
            f'<meta property="og:image" content="{img}">\n'
            f'<meta name="twitter:card" content="summary_large_image">\n'
            f'<meta name="twitter:title" content="Master Map Rhykaris">\n'
            f'<meta name="twitter:description" content="{SOCIAL_DESCRIPTION}">\n'
            f'<meta name="twitter:image" content="{img}">\n')


def build(with_meta=True):
    css_leaf = leaflet_css()
    css_app = read_text("app/style.css")
    body = read_text("app/body.html")
    js = app_js()

    dj = json.loads(read_text("data/data.json"))
    dj["inset"] = {"b": [[-32.0, -40.0], [23.0, 46.0]], "ppd": 40}
    data = json.dumps(dj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    moons = json.dumps(json.loads(read_text("data/moons.json")), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    inset = data_uri("assets/inset_40_q84.webp", "image/webp")
    base = data_uri("assets/base_q84.webp", "image/webp")
    grid = data_uri("assets/datagrid.png", "image/png")

    extras = social_meta() if with_meta else ""
    inner_head = f"""<title>Master Map Rhykaris</title>
<meta name="description" content="{DESCRIPTION}">
{extras}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<style>
/* Leaflet 1.9.4 — BSD-2-Clause */
{css_leaf}
/* Master Map Rhykaris */
{css_app}
</style>"""

    payload = f"""{body}
<script id="rh-data" type="application/json">{data}</script>
<script id="rh-moons" type="application/json">{moons}</script>
<script id="rh-base" type="text/plain">{base}</script>
<script id="rh-grid" type="text/plain">{grid}</script>
<script id="rh-inset" type="text/plain">{inset}</script>
{LOADER}
{lazy_blocks()}
<script>
window.RH = {{ version: "{VIEWER_VERSION}" }};
{js}
</script>"""

    return f"""<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{inner_head}
</head>
<body>
{payload}
</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=str(ROOT / "index.html"), help="output path (default: ./index.html)")
    ap.add_argument("--no-meta", action="store_true", help="omit favicon and Open Graph / Twitter tags")
    args = ap.parse_args()
    html = build(with_meta=not args.no_meta)
    with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)
    print(f"wrote {args.out}  ({len(html.encode('utf-8')) / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
