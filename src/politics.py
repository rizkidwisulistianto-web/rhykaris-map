"""Rhykaris Master Map — partisi teritorial AS 1647 (sadar-medan) + poligon region -> JSON lat/lon.

CATATAN (02 Okt 2026): blok Interregna di bawah (aventalia, tarvenna, ir_1..ir_7) adalah GENERASI LAMA. Batas Interregna di
data/politics.json kini digambar oleh src/interregna.py (mozaik v2: 13 kerajaan, 6 kota merdeka, 3 wilayah adat, 3 mikro-polity,
enklaf, eksklaf; tabel di src/interregna_table.py). Footprint-nya dipinjam dari keluaran skrip ini, jadi blok lama tetap
dibutuhkan sebagai acuan. Kalau politics.py dijalankan ulang, jalankan `python src/interregna.py --write` sesudahnya;
lihat docs/INTERREGNA_V2_NOTES.md.
"""
import numpy as np, sys, json, heapq, time
from numba import njit
from scipy import ndimage as ndi
from skimage import measure
sys.path.insert(0, '/home/claude/rhykaris_map')
from geo import *
from noise import make_perm, fbm

Z = dict(np.load('/home/claude/rhykaris_map/terrain_4096.npz'))
land = Z['land'].astype(bool); elev = Z['elev']; acc = Z['acc']; d = Z['d']; al = Z['al']; pr = Z['pr']
H, W = land.shape
LAT, LON = grid(W, H)
DEG = 180.0 / H
THR = np.percentile(acc[land], 98.6)

def ij(lat, lon):
    return int(np.clip((90 - lat) / DEG, 0, H - 1)), int(((lon + 180) / 360 * W)) % W

# ---------- biaya gerak (km) ----------
@njit(cache=True)
def dijkstra(cost, allowed, seeds_i, seeds_j, H, W, i0, j0, h, w, coslat, pxkm, maxc):
    """Dijkstra multi-sumber pada sub-jendela [i0:i0+h, j0:j0+w]. cost = pengali per sel."""
    out = np.full(h * w, np.inf)
    heap = [(0.0, np.int64(0))]; heap.pop()
    for s in range(seeds_i.size):
        k = (seeds_i[s] - i0) * w + (seeds_j[s] - j0)
        out[k] = 0.0; heapq.heappush(heap, (0.0, np.int64(k)))
    while len(heap) > 0:
        c, k = heapq.heappop(heap)
        if c > out[k] or c > maxc:
            continue
        i = k // w; j = k % w
        for di in range(-1, 2):
            ii = i + di
            if ii < 0 or ii >= h:
                continue
            for dj in range(-1, 2):
                if di == 0 and dj == 0:
                    continue
                jj = j + dj
                if jj < 0 or jj >= w:
                    continue
                kk = ii * w + jj
                if not allowed[kk]:
                    continue
                dx = dj * coslat[ii + i0]; step = np.sqrt(dx * dx + di * di) * pxkm
                nc = c + step * 0.5 * (cost[k] + cost[kk])
                if nc < out[kk]:
                    out[kk] = nc; heapq.heappush(heap, (nc, np.int64(kk)))
    return out

# jendela regional (zona manusia Ferria)
LAT1, LAT0, LON0, LON1 = 16.0, -56.0, -82.0, 50.0
i0, j0 = ij(LAT1, LON0); i1, j1 = ij(LAT0, LON1)
h, w = i1 - i0, j1 - j0
sub = (slice(i0, i1), slice(j0, j1))
pxkm = 2 * np.pi * R_KM / W
coslat = np.cos(np.radians(LAT[:, 0])).astype(np.float64)
e_s = elev[sub]; a_s = acc[sub]; land_s = land[sub]; d_s = d[sub]; al_s = al[sub]; LAT_s = LAT[sub]; LON_s = LON[sub]
river_big = (a_s > THR * 6)
cost = 1.0 + 2.6 * np.clip((e_s - 1400) / 1800, 0, 1.5) + 2.2 * river_big + 3.0 * (np.abs(d_s) <= 6.5)
cost = cost.astype(np.float64).ravel()

notband = d_s < -6.5
# Silva Nullius: hutan tak bertuan (bukan milik kerajaan mana pun)
sx, sy = azeq(LAT_s, LON_s, -9.6, 3.1)
perm = make_perm(99)
X, Y, Z3 = [v.ravel().astype(np.float64) for v in unit(LAT_s, LON_s)]
nsil = fbm(X, Y, Z3, perm, 18.0, 4, 2.0, 0.5, 1.0, 2.0, 3.0).reshape(h, w)
silva = land_s & (np.sqrt((sx / 1.45) ** 2 + (sy / 2.9) ** 2) + 0.9 * nsil < 1.0)
nbord = fbm(X, Y, Z3, perm, 9.0, 5, 2.0, 0.55, -4.0, 7.0, 2.0).reshape(h, w)
cost = (cost.reshape(h, w) * (1.0 + 0.45 * nbord).clip(0.5, 2.0)).ravel()

# id, nama, seeds, bias_km, range_km, (pusat zona, radius zona deg), batasan keras tambahan
POL = [
 ('hesperia', 'Hesperia', [(-5.49, -8.31), (-4.5, -18.0), (-6.8, -27.0), (-9.5, -36.0), (-12.5, -44.0)], 900, 2600, ((-9.0, -26.0), 17.0), notband & ~silva),
 ('cw_a', 'Vasal Commonwealth (tak bernama) I', [(-27.0, -60.0), (-28.0, -66.0)], 250, 1500, ((-29.0, -63.0), 8.0), notband),
 ('cw_b', 'Vasal Commonwealth (tak bernama) II', [(-21.0, -48.0)], 250, 1300, ((-23.0, -48.0), 7.0), notband),
 ('cw_c', 'Vasal Commonwealth (tak bernama) III', [(-21.5, -31.0)], 250, 1300, ((-23.0, -31.0), 7.0), notband),
 ('kloaka', 'Kloaka', [(-3.8, -4.3)], 0, 480, ((-3.8, -4.3), 2.4), ~silva),
 ('aventalia', 'Aventalia', [(-12.5, -7.5)], 0, 850, ((-12.5, -7.5), 4.0), ~silva),
 ('tarvenna', 'Tarvenna', [(-13.5, -1.8)], 60, 850, ((-13.5, -1.8), 4.2), ~silva),
 ('cassivalla', 'Cassivalla (Provincia Cassivallae)', [(-15.8, 5.0)], 60, 850, ((-15.8, 5.0), 4.2), ~silva),
 ('ir_1', 'Kerajaan Interregna (tak bernama) I', [(-18.5, -9.5)], 0, 750, ((-18.5, -9.5), 4.0), ~silva),
 ('ir_2', 'Kerajaan Interregna (tak bernama) II', [(-20.0, -3.0)], 0, 750, ((-20.0, -3.0), 4.0), ~silva),
 ('ir_3', 'Kerajaan Interregna (tak bernama) III', [(-21.5, 3.5)], 0, 750, ((-21.5, 3.5), 4.0), ~silva),
 ('ir_4', 'Kerajaan Interregna (tak bernama) IV', [(-25.0, -8.5)], 0, 750, ((-25.0, -8.5), 4.0), ~silva),
 ('ir_5', 'Kerajaan Interregna (tak bernama) V', [(-26.0, -1.5)], 0, 750, ((-26.0, -1.5), 4.0), ~silva),
 ('ir_6', 'Kerajaan Interregna (tak bernama) VI', [(-27.0, 5.5)], 0, 750, ((-27.0, 5.5), 4.0), ~silva),
 ('ir_7', 'Kerajaan Interregna (tak bernama) VII', [(-8.3, -3.2)], 0, 450, ((-8.3, -3.2), 2.6), ~silva),
 ('nundina', 'Nundina (kota merdeka)', [(-9.80, 1.19)], 400, 95, ((-9.8, 1.19), 0.8), ~silva),
 ('foedera', 'Foedera', [(3.03, 25.53), (-8.13, 5.05), (-3.5, 13.0), (-12.0, 17.0), (3.5, 12.0), (-16.0, 22.0)], 700, 2300, ((-4.0, 18.0), 13.5), notband & ~silva),
 # Liminara landlocked (P&F: "kondisi landlocked"): ring final di data/politics.json dipangkas manual (ketok 01 Okt 2026) --
 # lobus pesisir dibuang sehingga batas poligon >= ~125 km dari sel laut mana pun (sebelumnya simpul terdekat ~7 km dari laut).
 # Pipeline Dijkstra ini belum dijalankan ulang; rebuild penuh perlu batasan keras jarak-ke-laut (>= 150 km) agar tidak
 # menumbuhkan lobus pesisir lagi. Luas ring: ~1,25 juta km2 (86% dari semula).
 ('liminara', 'Liminara', [(-3.0, 37.5), (-8.5, 38.5)], 300, 1000, ((-4.0, 38.0), 6.5), notband),
 # Ktonia direlokasi (ketok A, 01 Okt 2026): titik lama Altiplano (-45.0, -12.0) jatuh 8.715 km dari Liminara dan
 # bertentangan dengan Ecology §3 (iridescent "ditambang dari zona yang bersinggungan dengan The Scar"). Titik baru =
 # massif timur-dalam Ferria, d = -12,26 deg (Adjacent), ~400 km dari Liminara. [Inferensi AI]
 # CATATAN: ring final di data/politics.json digambar manual dari raster tanah bebas (d -19..-7, elev >= 1800 m,
 # >= 150 km dari laut, CNT == 0, bebas dari wilayah lain) -- pipeline Dijkstra ini belum dijalankan ulang untuk Ktonia,
 # dan dengan bias Liminara 300 km ia mungkin tidak mereproduksi ring itu. Cek dulu sebelum rebuild penuh.
 ('ktonia', 'Ktonia', [(-4.39, 39.90)], 0, 350, ((-4.39, 39.90), 3.0), notband),
 # Pylora (kerajaan gerbang sungai timur; ketok Opsi A, 01 Okt 2026): titik kursi (-4.31, 44.69), d = -10,11 deg (Adjacent).
 # CATATAN: ring final di data/politics.json digambar manual dari raster tanah bebas (CNT == 0, d <= -7, <= 150 km dari
 # alur sungai timur, dikurangi poligon Ktonia + celah 0,14 deg, disederhanakan ke 16 simpul) -- pipeline Dijkstra ini
 # belum dijalankan ulang untuk Pylora, dan mungkin tidak mereproduksi ring itu. Cek dulu sebelum rebuild penuh.
 ('pylora', 'Pylora', [(-4.31, 44.69)], 0, 300, ((-4.31, 44.69), 2.5), notband),
]

t0 = time.time()
costs = []
for pid, name, seeds, bias, rng, (zc, zr), hard in POL:
    si = np.array([ij(a, b)[0] for a, b in seeds]); sj = np.array([ij(a, b)[1] for a, b in seeds])
    dz = gc_dist_deg(LAT_s, LON_s, zc[0], zc[1])
    pen = 1.0 + 3.0 * smoothstep(zr, zr * 1.7, dz)
    cst = (cost.reshape(h, w) * pen).ravel()
    allow = land_s.copy()
    if hard is not None: allow &= hard
    allow = allow.ravel()
    for a, b in seeds:
        ii, jj = ij(a, b); allow[(ii - i0) * w + (jj - j0)] = True
    c = dijkstra(cst, allow, si, sj, H, W, i0, j0, h, w, coslat, pxkm, rng + 50).reshape(h, w)
    c[c > rng] = np.inf
    costs.append(c - bias)
print(f'dijkstra {len(POL)} polity: {time.time()-t0:.1f}s')
C = np.stack(costs)
lab = np.argmin(C, 0) + 1
lab[~np.isfinite(C.min(0))] = 0
lab[~land_s] = 0
# rapikan: buang pecahan kecil (enklave < 60 px) -> gabung ke tetangga dominan
for k in range(1, len(POL) + 1):
    m = lab == k
    cc, n = ndi.label(m)
    if n > 1:
        sizes = ndi.sum(m, cc, index=np.arange(1, n + 1))
        for q, s in enumerate(sizes, start=1):
            if s < 60:
                lab[cc == q] = 0

# ---------- poligon ----------
def mask_to_rings(mask, sigma=1.1, tol=0.9, min_px=25, offset=(0, 0), wrap=False):
    if mask.sum() < min_px: return []
    m = ndi.gaussian_filter(mask.astype(np.float32), sigma)
    m = np.pad(m, 1)
    rings = []
    for cnt in measure.find_contours(m, 0.5):
        if len(cnt) < 8: continue
        cnt = measure.approximate_polygon(cnt, tol)
        if len(cnt) < 4: continue
        # piksel -> lat/lon
        ii = cnt[:, 0] - 1 + offset[0] + 0.5; jj = cnt[:, 1] - 1 + offset[1] + 0.5
        la = 90 - ii * DEG; lo = -180 + jj * 360 / W
        area = 0.5 * abs(np.dot(jj, np.roll(ii, 1)) - np.dot(ii, np.roll(jj, 1)))
        if area < min_px: continue
        rings.append([[round(float(a), 3), round(float(b), 3)] for a, b in zip(la, lo)])
    return rings

OUT = {'territories': [], 'regions': []}
for k, (pid, name, seeds, bias, rng, zone, hard) in enumerate(POL, start=1):
    rings = mask_to_rings(lab == k, offset=(i0, j0))
    OUT['territories'].append({'id': pid, 'name': name, 'rings': rings, 'px': int((lab == k).sum())})
    print(f'{pid:11s} px={int((lab==k).sum()):7d} rings={len(rings)}')

# Silva Nullius (region, hutan tak bertuan)
OUT['regions'].append({'id': 'silva_nullius', 'rings': mask_to_rings(silva, offset=(i0, j0), min_px=10)})
# Interregna (garis payung = gabungan kerajaan koridor tengah + Nundina + Silva)
ir_ids = [k for k, p in enumerate(POL, start=1) if p[0] in ('aventalia', 'tarvenna', 'cassivalla', 'nundina') or p[0].startswith('ir_')]
irm = np.isin(lab, ir_ids) | silva
OUT['regions'].append({'id': 'interregna', 'rings': mask_to_rings(ndi.binary_closing(irm, iterations=2), sigma=1.6, tol=1.2, offset=(i0, j0))})

# Zona Anabasim (Latus Orientale): daratan pita alpha 22..70 + pijakan zona penyangga (Fase 1)
anab = land & (((np.abs(d) <= 6.5) & (al > 22) & (al < 70)) | ((d > -9.5) & (d <= -6.5) & (al > 29) & (al < 47)))
OUT['territories'].append({'id': 'anabasim', 'name': 'Anabasim (zona konsolidasi Birath–Satvan)', 'rings': mask_to_rings(anab, min_px=10)})
# Emporys & Perates (enklave kecil)
def disk(lat, lon, r):
    return land & (gc_dist_deg(LAT, LON, lat, lon) < r)
OUT['territories'].append({'id': 'emporys', 'name': 'Emporys', 'rings': mask_to_rings(disk(18.55, 16.75, 0.85), sigma=0.8, tol=0.6, min_px=5)})
OUT['territories'].append({'id': 'perates', 'name': 'Peratēs (pelabuhan induk)', 'rings': mask_to_rings(disk(7.78, -16.04, 0.9), sigma=0.8, tol=0.6, min_px=5)})

# ---------- Aeris: Ellumat (mandala) & Zona Ambang ----------
ell = Z['comp_ell'].astype(bool) & land
dL = gc_dist_deg(LAT, LON, 55.5, 180.0)
bx, by = azeq(LAT, LON, 55.5, 180.0)
bear = (np.degrees(np.arctan2(bx, by)) + 360) % 360
ambang = ell & (dL > 18.5) & (bear > 195) & (bear < 300)
rings_m = []
for r0, r1, lvl in [(0, 5.0, 0), (5.0, 11.0, 1), (11.0, 18.5, 2), (18.5, 40, 3)]:
    m = ell & (dL >= r0) & (dL < r1)
    if lvl == 3: m &= ~ambang
    rings_m.append({'ring': lvl, 'rings': mask_to_rings(m, sigma=1.4, tol=1.2, min_px=20)})
OUT['mandala'] = rings_m
OUT['territories'].append({'id': 'andura', 'name': 'Andurā (Zona Ambang)', 'rings': mask_to_rings(ambang, sigma=1.3, tol=1.0)})
OUT['territories'].append({'id': 'anusarri', 'name': 'Anušarri', 'rings': mask_to_rings(ell & (dL < 18.5), sigma=1.4, tol=1.2)})
OUT['regions'].append({'id': 'zona_ambang', 'rings': mask_to_rings(ambang, sigma=1.3, tol=1.0)})

# ---------- region fisik ----------
sad = Z['comp_sad'].astype(bool) & land
OUT['regions'].append({'id': 'pegunungan_sadumat', 'rings': mask_to_rings(sad & (Z['mas'] > 0.35) & (elev > 1500), sigma=2.0, tol=1.5, min_px=40)})
OUT['regions'].append({'id': 'sabuk_pohon_raksasa', 'rings': mask_to_rings(sad & (pr > 1.25) & (elev < 1600), sigma=2.0, tol=1.5, min_px=40)})
OUT['regions'].append({'id': 'vastitas', 'rings': mask_to_rings(land & (Z['pol'] > 0.5) & (d < 0), sigma=1.5, tol=1.5, min_px=200)})
sea = ~land
OUT['regions'].append({'id': 'sinus_adventus', 'rings': mask_to_rings(sea & (Z['bay'] > 0.45) & (d < -3.0), sigma=1.5, tol=1.2, min_px=50)})
OUT['regions'].append({'id': 'mare_internum', 'rings': mask_to_rings(sea & (Z['mare'] > 0.45), sigma=1.5, tol=1.2, min_px=50)})
lobe = Z['comp_lobe'].astype(bool) & land & (d > 6.5)
OUT['regions'].append({'id': 'lobus', 'rings': mask_to_rings(lobe, sigma=2.0, tol=1.6, min_px=200)})
# es Corona Glacialis (sama dengan renderer)
Xf, Yf, Zf = [v.ravel().astype(np.float64) for v in unit(LAT, LON)]
p4711 = make_perm(4711)
nz = lambda f, o, oc=4: fbm(Xf, Yf, Zf, p4711, f, oc, 2.0, 0.5, o, -o, o * 0.5).reshape(H, W)
ice_edge = 77.5 + 2.2 * nz(3.0, 5.0, 4) + 1.2 * nz(14.0, 9.0, 4)
OUT['regions'].append({'id': 'corona_glacialis', 'rings': mask_to_rings(sea & (LAT > ice_edge), sigma=2.0, tol=2.0, min_px=200)})
# Nagu: garis putus gugus pulau koridor Puncak (bukan batas politik)
isl = Z['comp_isl'].astype(bool) & land
dens = ndi.gaussian_filter(isl.astype(np.float32), 18)
nag = (dens > 0.02) & (LAT > 14) & (LAT < 45) & (LON > -55) & (LON < 45)
OUT['regions'].append({'id': 'nagu', 'rings': mask_to_rings(nag, sigma=3, tol=3, min_px=300)})
nag2 = (dens > 0.02) & (LAT > 18) & (LAT < 50) & (LON > 75) & (LON < 150)
OUT['regions'].append({'id': 'nagu_timur', 'rings': mask_to_rings(nag2, sigma=3, tol=3, min_px=300)})
# Vasundha: zona suku (tanpa batas tegas) — elips
vx, vy = azeq(LAT, LON, -25.0, 26.0)
OUT['regions'].append({'id': 'vasundha', 'rings': mask_to_rings(land & (np.sqrt((vx / 6.5) ** 2 + (vy / 4.5) ** 2) < 1), sigma=2, tol=1.5)})

# ---------- kontur elevasi & batimetri (1024x512, halus) ----------
q = 4
eq = ndi.gaussian_filter(elev[::q, ::q].astype(np.float32), 1.0)
landq = land[::q, ::q]
cont = []
for lvl, kind in [(1000, 'land'), (2500, 'land'), (4500, 'land'), (-200, 'sea'), (-3000, 'sea'), (-6000, 'sea')]:
    arr = np.pad(eq, 1, mode='edge')
    for c in measure.find_contours(arr, lvl):
        if len(c) < 14: continue
        c = measure.approximate_polygon(c, 0.7)
        if len(c) < 5: continue
        ii = (c[:, 0] - 1 + 0.5) * q; jj = (c[:, 1] - 1 + 0.5) * q
        la = 90 - ii * DEG; lo = -180 + jj * 360 / W
        cont.append({'lvl': lvl, 'pts': [[round(float(a), 2), round(float(b), 2)] for a, b in zip(la, lo)]})
OUT['contours'] = cont
print('contours', len(cont), 'pts', sum(len(c['pts']) for c in cont))
json.dump(OUT, open('/home/claude/rhykaris_map/politics.json', 'w'), separators=(',', ':'))
import os; print('politics.json', os.path.getsize('/home/claude/rhykaris_map/politics.json') // 1024, 'KB')

# preview
from PIL import Image, ImageDraw
im = Image.open('/home/claude/rhykaris_map/base_4096.png').convert('RGB')
crop = im.crop((j0, i0, j1, i1))
ov = Image.new('RGBA', crop.size, (0, 0, 0, 0)); dr = ImageDraw.Draw(ov)
rng_ = np.random.default_rng(3)
for t in OUT['territories']:
    col = tuple(int(x) for x in rng_.integers(60, 255, 3))
    for r in t['rings']:
        pts = [((b + 180) / 360 * W - j0, (90 - a) / DEG - i0) for a, b in r]
        dr.polygon(pts, outline=col + (255,), fill=col + (70,))
Image.alpha_composite(crop.convert('RGBA'), ov).convert('RGB').resize((crop.size[0] // 1, crop.size[1] // 1)).save('/home/claude/rhykaris_map/pol_prev.jpg', quality=88)
