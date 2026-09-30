import base64, json, re, sys
ROOT = '/home/claude/rhykaris_map/'
css_leaf = open(ROOT + 'vendor/node_modules/leaflet/dist/leaflet.css').read()
# buang referensi gambar relatif (ikon default & layers control tidak dipakai)
css_leaf = re.sub(r'[^{}]*\{[^{}]*url\(images/[^{}]*\}', '', css_leaf)
css_leaf = re.sub(r'/\*.*?\*/', '', css_leaf, flags=re.S)
css_leaf = re.sub(r'\s+', ' ', css_leaf).replace('; ', ';').replace(' {', '{').replace('{ ', '{').replace(' }', '}')
css_app = open(ROOT + 'app/style.css').read()
body = open(ROOT + 'app/body.html').read()
js = open(ROOT + 'app/app.js').read()
DJ = json.load(open(ROOT + 'data.json'))
DJ['inset'] = {'b': [[-32.0, -40.0], [23.0, 46.0]], 'ppd': 40}
data = json.dumps(DJ, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
inset = 'data:image/webp;base64,' + base64.b64encode(open(ROOT + 'inset_40_q84.webp', 'rb').read()).decode()
base = 'data:image/webp;base64,' + base64.b64encode(open(ROOT + sys.argv[1] if len(sys.argv) > 1 else ROOT + 'base_q84.webp', 'rb').read()).decode()
grid = 'data:image/png;base64,' + base64.b64encode(open(ROOT + 'datagrid.png', 'rb').read()).decode()
FONTS = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;1,500;1,600&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap'
loader = """<script>
(function(){var srcs=['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js','https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'],i=0;
window.__rhFallback=function(){if(window.L)return;if(i>=srcs.length){if(window.__rhFail)window.__rhFail();return;}
var s=document.createElement('script');s.src=srcs[i++];s.onload=function(){if(window.__rhBoot)window.__rhBoot();};s.onerror=window.__rhFallback;document.head.appendChild(s);};})();
</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js" onerror="__rhFallback()"></script>"""
inner_head = f"""<title>Master Map Rhykaris</title>
<meta name="description" content="Peta induk interaktif dunia Rhykaris — proyeksi equirectangular, The Scar, wilayah kuasa AS 1647, dan status epistemik tiap koordinat.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<style>
/* Leaflet 1.9.4 — BSD-2-Clause */
{css_leaf}
/* Master Map Rhykaris */
{css_app}
</style>"""
payload = f"""{body}
<script id="rh-data" type="application/json">{data}</script>
<script id="rh-base" type="text/plain">{base}</script>
<script id="rh-grid" type="text/plain">{grid}</script>
<script id="rh-inset" type="text/plain">{inset}</script>
{loader}
<script>
{js}
</script>"""
full = f"""<!doctype html>
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
open(ROOT + 'master_map_rhykaris.html', 'w').write(full)
open(ROOT + 'artifact_page.html', 'w').write(inner_head + '\n' + payload + '\n')
print('full', len(full.encode()) / 1e6, 'MB')
