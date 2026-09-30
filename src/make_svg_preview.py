"""Pratinjau statis Master Map v4 (lapisan fisik) sebagai SVG mandiri <= 200 KiB.
Base = base_4096.png (tekstur fisik kanon) di-embed sebagai JPEG base64; overlay vektor:
pita Scar 13,0 deg, kurva small circle, graticule 30 deg, label makro-geografi (Kanon/Turunan).
"""
import base64, io, sys
import numpy as np
from PIL import Image
sys.path.insert(0, '/home/claude/rhykaris_map')
from geo import curve_point, SCAR_R, BAND_HALF

W, H, FOOT = 1600, 800, 70
OUT = '/home/claude/rhykaris_map/rhykaris_master_map_v4.svg'

def X(lon): return (lon + 180.0) / 360.0 * W
def Y(lat): return (90.0 - lat) / 180.0 * H

def circle_path(r):
    al = np.linspace(-180, 180, 481)
    la, lo = curve_point(al, r)
    o = np.argsort(lo)
    return [(float(lo[i]), float(la[i])) for i in o]

im = Image.open('/home/claude/rhykaris_map/base_4096.png').convert('RGB').resize((W, H), Image.LANCZOS)
b = io.BytesIO(); im.save(b, 'JPEG', quality=70, optimize=True, progressive=True)
b64 = base64.b64encode(b.getvalue()).decode()

outer = circle_path(SCAR_R + BAND_HALF)
inner = circle_path(SCAR_R - BAND_HALF)
mid = circle_path(SCAR_R)
def pts(seq): return ' '.join('%.1f,%.1f' % (X(lo), Y(la)) for lo, la in seq)
band_poly = pts([(-180.0, outer[0][1])] + outer + [(180.0, outer[-1][1])] + [(180.0, inner[-1][1])] + inner[::-1] + [(-180.0, inner[0][1])])

s = []
s.append('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 %d %d" width="%d" height="%d">' % (W, H + FOOT, W, H + FOOT))
s.append('<title>Rhykaris — Master Map v4, lapisan fisik (kanon 29 Sep 2026)</title>')
s.append('<style>'
         '.lb{font-family:Georgia,"Times New Roman",serif;fill:#f6f1e6;stroke:#142030;stroke-width:3.2px;paint-order:stroke;stroke-linejoin:round;letter-spacing:.14em}'
         '.big{font-size:22px;font-weight:bold}.mid{font-size:15px;font-weight:bold}.sm{font-size:12.5px;letter-spacing:.05em}'
         '.it{font-style:italic;letter-spacing:.03em}'
         '.gr{font-family:Helvetica,Arial,sans-serif;font-size:10.5px;fill:#e9eef3;stroke:#142030;stroke-width:2.6px;paint-order:stroke}'
         '.ft{font-family:Helvetica,Arial,sans-serif;fill:#dfe6ec}'
         '</style>')
s.append('<rect x="0" y="0" width="%d" height="%d" fill="#0f1822"/>' % (W, H + FOOT))
s.append('<image x="0" y="0" width="%d" height="%d" preserveAspectRatio="none" xlink:href="data:image/jpeg;base64,%s"/>' % (W, H, b64))
# graticule
g = []
for lon in range(-150, 181, 30):
    g.append('M%.1f 0V%d' % (X(lon), H))
for lat in (-60, -30, 0, 30, 60):
    g.append('M0 %.1fH%d' % (Y(lat), W))
s.append('<path d="%s" stroke="#ffffff" stroke-opacity=".16" stroke-width=".8" fill="none"/>' % ' '.join(g))
s.append('<path d="M%.1f 0V%d" stroke="#ffe7a8" stroke-opacity=".55" stroke-width="1" stroke-dasharray="5 4" fill="none"/>' % (X(0), H))
# Scar band + curve
s.append('<polygon points="%s" fill="#ff5a36" fill-opacity=".16" stroke="#ff7a4d" stroke-opacity=".45" stroke-width=".8"/>' % band_poly)
s.append('<polyline points="%s" fill="none" stroke="#1b0d08" stroke-opacity=".55" stroke-width="3.4"/>' % pts(mid))
s.append('<polyline points="%s" fill="none" stroke="#ff6a3d" stroke-width="1.7"/>' % pts(mid))
# graticule labels
for lat in (-60, -30, 0, 30, 60):
    s.append('<text class="gr" x="5" y="%.1f">%s</text>' % (Y(lat) - 3, ('%s%d°' % ('−' if lat < 0 else '', abs(lat))) if lat else '0° ekuator'))
for lon in range(-150, 181, 30):
    if lon == 180: continue
    t = '0° historis' if lon == 0 else '%s%d°' % ('−' if lon < 0 else '', abs(lon))
    s.append('<text class="gr" x="%.1f" y="%d" text-anchor="middle">%s</text>' % (X(lon), H - 6, t))

def lab(lat, lon, text, cls='mid', anchor='middle', rot=None):
    x, y = X(lon), Y(lat)
    tr = ' transform="rotate(%.1f %.1f %.1f)"' % (rot, x, y) if rot else ''
    s.append('<text class="lb %s" x="%.1f" y="%.1f" text-anchor="%s"%s>%s</text>' % (cls, x, y, anchor, tr, text))

lab(-50.0, -28.0, 'FERRIA', 'big')
lab(-47.0, -28.0, '', 'sm')
lab(-79.5, 20.0, 'VASTITAS', 'mid')
lab(84.0, 40.0, 'CORONA GLACIALIS', 'mid')
lab(58.0, -158.0, 'ELLUMĀT', 'big')
lab(58.0, 152.0, 'ELLUMĀT', 'big')
lab(33.5, 78.0, 'ŠADÛMĀT', 'mid')
lab(36.0, -12.0, 'Kepulauan Nagû', 'sm it')
lab(4.0, -100.0, 'porsi lintas-sutura', 'sm it')
lab(1.2, -100.0, '(belum bernama)', 'sm it')
lab(-28.0, 128.0, 'T Â M T U', 'big')
lab(48.0, -80.0, 'T Â M T U', 'mid')
lab(9.5, 0.0, 'Sinus Adventus', 'sm it')
lab(-24.0, -122.0, 'koridor darat lintas-sutura', 'sm it', rot=-27)
# The Scar label near lon 118
la_s, lo_s = curve_point(np.array([118.0]))
lab(-13.5, 101.0, 'THE SCAR', 'mid', rot=21)
# Dies Ignis point
s.append('<circle cx="%.1f" cy="%.1f" r="3.6" fill="#ff3b1f" stroke="#1b0d08" stroke-width="1.4"/>' % (X(0), Y(-1.25)))
lab(-6.2, 1.0, 'Dies Ignis', 'sm', anchor='start')

# footer
fy = H
s.append('<rect x="0" y="%d" width="%d" height="%d" fill="#0f1822"/>' % (fy, W, FOOT))
s.append('<text class="ft" x="16" y="%d" font-size="17" font-weight="bold" letter-spacing=".12em">RHYKARIS · MASTER MAP v4 — LAPISAN FISIK</text>' % (fy + 27))
s.append('<text class="ft" x="16" y="%d" font-size="12.5">Kanon 29 Sep 2026 · seed 1647 · equirectangular 4096×2048 (pratinjau 1600×800) · darat Rhykar 23,002%% · Aëris 14,997%% · air 62,000%% · overlay Scar 3,989%%</text>' % (fy + 50))
lx = 1170
s.append('<rect x="%d" y="%d" width="22" height="11" fill="#ff5a36" fill-opacity=".35" stroke="#ff7a4d" stroke-width=".8"/>' % (lx, fy + 17))
s.append('<text class="ft" x="%d" y="%d" font-size="12">pita The Scar 13,0° (±6,5° dari kurva)</text>' % (lx + 30, fy + 27))
s.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#ff6a3d" stroke-width="2"/>' % (lx, fy + 45, lx + 22, fy + 45))
s.append('<text class="ft" x="%d" y="%d" font-size="12">kurva Scar: small circle −55,5°/0°, r 72,5°</text>' % (lx + 30, fy + 49))
s.append('</svg>')
svg = '\n'.join(x for x in s if 'class="lb sm" x' not in x or '></text>' not in x)
open(OUT, 'w', encoding='utf-8').write(svg)
print(OUT, len(svg.encode('utf-8')), 'bytes')
