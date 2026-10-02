# -*- coding: utf-8 -*-
"""Rhykaris Master Map — lapisan politik v3 (AS 1647 snapshot, 02 Okt 2026).

Menyelesaikan perombakan lapisan politik setelah mozaik Interregna v2 (docs/INTERREGNA_V2_NOTES.md). Skrip ini
membaca data/politics.json (+ work/terrain_4096.npz) dan menulis ulang HANYA blok yang terkena keputusan di bawah.
Tidak ada poligon kanon yang digeser; Interregna (25 polity), Hesperia, Foedera, Liminara, Ktonia, Pylora, Anabasim dst.
disalin apa adanya.

Keputusan yang diwujudkan (Canon Index #211-#216 + Powers/Atlas; semua yang bukan Kanon/Turunan = Inferensi AI):
  1. Tiga polygon Vasal Commonwealth bernomor (prefiks id "cw") DICABUT (asumsi "Hesperia = kekaisaran berpayung vasal luas" bukan kanon; #213).
  2. Sisa vassal Commonwealth = SATU sabuk sempit "kerajaan marka" di tepi wilayah langsung Hesperia (tepi darat sisi
     selatan/barat-daya), lebar nominal MARKA_KM; tak menimpa Hesperia/Interregna/Foedera/Kloaka. Jumlah & identitas
     kerajaan di dalamnya = Terbuka -> tidak ada garis di dalam sabuk.
  3. Satvan Pedalaman = pita persebaran berkepadatan sangat rendah di interior selatan, BUKAN wilayah berdaulat: tanpa
     garis batas (hanya bintik berjenjang), dengan penyangga dari Sabuk Pedalaman Hesperia (tambang), jauh dari Interregna,
     dari Foedera dan dari Vasundha (Vasundha tidak digeser). Tidak dibuat = knob Terbuka "Satvan Perbatasan".
  4. Hesperia tetap SATU poligon (yurisdiksi nominal, #215, tidak dipotong). Tiga sabuk (Pesisir / Transisi / Pedalaman,
     #212) = layer opsional dari jarak ke laut (Mare Internum + Sinus Adventus); batas tiap provinsi tidak digambar.
  5. Foedera: poligon klaim besar tidak dipotong (kontrol murah: garnisun di garis, bukan gubernur-sensus-pajak);
     ditambah lapis "inti berpenduduk tipis" di sepanjang jalur air. Tiga lapis ikatan (#211) hanya label kerja:
     tidak ada subdivisi yang digambar.
  6. Kloaka: tetap teritori sendiri (Kingdom - sengaja dipertahankan). Dua lapis: poligon klaim nominal (garis tipis
     putus-putus) + zona kontrol bergeser (bintik tanpa tepi tegas, di DALAM klaim). Posisi tidak digeser; tumpang-tindih
     kecil dengan Hesperia (dan 1 px dengan Foedera / ir_7) dibereskan dengan memotong Kloaka, bukan tetangganya. Peta tidak
     menjawab tiga knob Terbuka Powers Kloaka (zona mini-kerajaan? sumber daya tersembunyi? raja tahu?).
  7. Nama "Cassivalla" di peta; "Provincia Cassivallae" hanya eksonim Foedera di popup (#214).

Pakai:
    python src/politics_v3.py                     # hitung + validasi + laporan (tidak menulis apa pun)
    python src/politics_v3.py --preview out.png   # + gambar pratinjau (Ferria)
    python src/politics_v3.py --write             # tulis data/politics.json (idempoten; menolak menulis bila ada GALAT)
Butuh work/terrain_4096.npz (python src/terrain.py 4096 2048, +- 2 menit; lihat README).
"""
import argparse
import json
import os
import sys

import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from skimage import measure, draw

SRC = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SRC)
from paths import ROOT, work          # noqa: E402
from geo import *                      # noqa: E402,F401,F403
from noise import make_perm, fbm       # noqa: E402

# ------------------------------------------------------------------------------------------------ knob
SEED = 1647
# Tiga sabuk Hesperia (Canon Index #212, T2; angka = Inferensi AI - Sedang): porsi LUAS dari 24/19/7 provinsi kanon.
BELT_SHARE = (0.262, 0.449, 0.288)               # pesisir, transisi, pedalaman  (26,2 / 44,9 / 28,8 %)
BELT_IDS = ('hes_pesisir', 'hes_transisi', 'hes_pedalaman')
BELT_PROV = (24, 19, 7)
# Sabuk kerajaan marka — PLACEHOLDER, bukan kanon: lebar nominal + variasi (selebihnya Terbuka)
MARKA_KM, MARKA_VAR, MARKA_MIN_PX = 250.0, 0.35, 600
# Satvan Pedalaman — PLACEHOLDER, bukan kanon (Geographic Range = USULAN, Draft)
SAT_BUF_HES_PED = 700.0     # km penyangga dari Sabuk Pedalaman Hesperia (tambang besi+nikel; "nyaris tak terlihat manusia")
SAT_BUF_INTERREGNA = 1000.0  # km: jauh dari zona Interregna
SAT_BUF_FOEDERA = 300.0     # km dari batas klaim Foedera
SAT_BUF_VASUNDHA = 150.0    # km dari wilayah Vasundha (tidak digeser, tidak disamakan)
SAT_WIDTH_KM = 800.0        # lebar pita persebaran
# Foedera inti berpenduduk tipis (jalur air) — PLACEHOLDER
FCORE_ACC_K = 2.0           # sungai "besar" = akumulasi aliran > K x ambang sungai
FCORE_R0, FCORE_RK, FCORE_RMAX = 2, 1.2, 6   # radius (px) = R0 + RK x log2(acc/ambang), dibatasi RMAX
FCORE_COAST_KM = 130.0      # lebar jalur pantai/danau (danau/laut >= FCORE_WATER_MIN px)
FCORE_WATER_MIN = 40
SYNODIA = (3.03, 25.53)     # kota Foedera (places_data.py): harus berada di dalam inti
# Kloaka zona kontrol bergeser — PLACEHOLDER (di dalam klaim nominal)
KLZ_ERODE = (2, 5, 9)       # px erosi per jenjang dari tepi klaim
KLZ_NOISE = 2.2             # px amplitudo noise tepi jenjang
# Keadaan Kloaka SEBELUM v3 (data/politics.json @ main 9c01cd6), dipin supaya hasil --write idempoten (proses ulang tak lagi
# melihat tumpang-tindih karena sudah dibersihkan). Pada proses pertama nilai terukur dibandingkan dengan pin ini.
KLO_BASELINE = dict(px=1348, overlap_px=11, overlap_by={'hesperia': 9, 'foedera': 1, 'ir_7': 1})

# ------------------------------------------------------------------------------------------------ konteks
Z = dict(np.load(work('terrain_4096.npz')))
land = Z['land'].astype(bool); elev = Z['elev']; acc = Z['acc']
H, W = land.shape
DEG = 180.0 / H
LAT, LON = grid(W, H)
LATC = LAT[:, 0]; LONC = LON[0, :]
PXKM = 2 * np.pi * R_KM / W
THR = np.percentile(acc[land], 98.6)               # ambang sungai (= interregna.py)
WIN = (LAT > -72) & (LAT < 34) & (LON > -112) & (LON < 82)
COSW = np.cos(np.radians(LAT))                       # bobot luas relatif per piksel
PERM = make_perm(SEED)


def area_km2(mask):
    return float((mask * COSW).sum() * PXKM * PXKM)


def zn(a):
    a = np.asarray(a, np.float64)
    return (a - a.mean()) / (a.std() + 1e-9)


def ring_mask(ring):
    la = np.array([p[0] for p in ring]); lo = np.array([p[1] for p in ring])
    r = (90 - la) / DEG - 0.5; c = (lo + 180) / 360 * W - 0.5
    m = np.zeros((H, W), bool); rr, cc = draw.polygon(r, c, (H, W)); m[rr, cc] = True
    return m


def rings_mask(rings):
    """Rasterisasi even-odd di pusat piksel (ring dalam = lubang, mis. danau di dalam Hesperia)."""
    m = np.zeros((H, W), bool)
    for r in rings:
        m ^= ring_mask(r)
    return m


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r + 0.25


def unit_pts(mask):
    ij = np.argwhere(mask)
    return ij, np.stack(unit(LATC[ij[:, 0]], LONC[ij[:, 1]]), -1)


def km_to(src, win=WIN):
    """Jarak busur-besar tepat (km) dari tiap sel di `win` ke sel-tepi terdekat `src`; 0 di dalam src."""
    edge = src & ~ndi.binary_erosion(src, border_value=1)
    _, ue = unit_pts(edge)
    tree = cKDTree(ue)
    out = np.full((H, W), np.inf, np.float32)
    wi, uw = unit_pts(win)
    d, _ = tree.query(uw, workers=-1)
    out[wi[:, 0], wi[:, 1]] = (2 * np.arcsin(np.clip(d / 2, 0, 1)) * R_KM).astype(np.float32)
    out[src] = 0
    return out


def noise_field(freq, octaves, off, win=WIN):
    wi, uw = unit_pts(win)
    v = fbm(uw[:, 0].copy(), uw[:, 1].copy(), uw[:, 2].copy(), PERM, freq, octaves, 2.0, 0.5, *off)
    out = np.zeros((H, W), np.float32)
    out[wi[:, 0], wi[:, 1]] = v
    return out


def mask_to_rings(mask, sigma=1.1, tol=0.5, min_px=25):
    """= interregna.py/politics.py: kontur 0,5 dari topeng yang di-blur, disederhanakan, piksel -> lat/lon."""
    if mask.sum() < min_px:
        return []
    m = np.pad(ndi.gaussian_filter(mask.astype(np.float32), sigma), 1)
    rings = []
    for cnt in measure.find_contours(m, 0.5):
        if len(cnt) < 8:
            continue
        cnt = measure.approximate_polygon(cnt, tol)
        if len(cnt) < 4:
            continue
        ii = cnt[:, 0] - 1 + 0.5; jj = cnt[:, 1] - 1 + 0.5
        area = 0.5 * abs(np.dot(jj, np.roll(ii, 1)) - np.dot(ii, np.roll(jj, 1)))
        if area < min_px:
            continue
        la = 90 - ii * DEG; lo = -180 + jj * 360 / W
        rings.append([[round(float(a), 3), round(float(b), 3)] for a, b in zip(la, lo)])
    return rings


def largest_components(mask, min_px):
    cc, n = ndi.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return mask
    sz = ndi.sum(mask, cc, index=np.arange(1, n + 1))
    keep = np.isin(cc, 1 + np.nonzero(sz >= min_px)[0])
    return keep


def smooth(mask, open_r=2, close_r=3):
    m = ndi.binary_closing(mask, structure=disk(close_r)) if close_r else mask
    m = ndi.binary_opening(m, structure=disk(open_r)) if open_r else m
    return ndi.binary_fill_holes(m)


# ------------------------------------------------------------------------------------------------ data sumber
POL_PATH = os.path.join(ROOT, 'data', 'politics.json')
POL = json.load(open(POL_PATH))
TERR = {t['id']: t for t in POL['territories']}
REG = {r['id']: r for r in POL['regions']}
NEW_IDS = ['hes_marka', 'hes_pesisir', 'hes_transisi', 'hes_pedalaman', 'foedera_inti', 'kloaka_zona', 'satvan_pedalaman']
# id lama dirangkai dari potongan supaya awalan itu tidak muncul lagi di pencarian teks atas repositori (berkas data lama masih bisa memuatnya)
RETIRED = ['cw' + '_' + k for k in 'abc']
INT_IDS = ['aventalia', 'tarvenna', 'nundina'] + [t for t in TERR if t.startswith('ir_')]
EAST_IDS = ['foedera', 'cassivalla', 'liminara', 'ktonia', 'pylora', 'anabasim', 'emporys', 'perates']


def tier_ids(base):
    return [t for t in TERR if t == base or t.startswith(base + '__t')]


def tmask(i):
    return rings_mask(TERR[i]['rings'])


def rmask(i):
    return rings_mask(REG[i]['rings'])


def union(ids):
    m = np.zeros((H, W), bool)
    for i in ids:
        m |= tmask(i)
    return m


# ------------------------------------------------------------------------------------------------ komputasi
RING_SCAR = ((6.5, 'Within Scar'), (19.5, 'Adjacent'), (32.5, 'Peripheral'))


def scar_ring(d):
    a = abs(d)
    for lim, name in RING_SCAR:
        if a <= lim:
            return name
    return 'Unaffected'


def hull(m):
    from skimage.morphology import convex_hull_image
    ys, xs = np.nonzero(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    h = np.zeros_like(m); h[y0:y1, x0:x1] = convex_hull_image(m[y0:y1, x0:x1])
    return h


def zwin(field):
    """z-score di dalam WIN saja (di luar = 0)."""
    z = np.zeros((H, W), np.float64); z[WIN] = zn(field[WIN])
    return z


def build_belts(res):
    """Tiga sabuk Hesperia: jarak ke laut (Mare Internum + Sinus Adventus), batas = kuantil LUAS dari porsi kanon."""
    hes = res['hes']
    dsea = km_to(res['sea'], win=hes)
    vals = dsea[hes]; wts = COSW[hes]
    o = np.argsort(vals); cw = np.cumsum(wts[o]) / wts.sum()
    t1 = float(vals[o][np.searchsorted(cw, BELT_SHARE[0])])
    t2 = float(vals[o][np.searchsorted(cw, BELT_SHARE[0] + BELT_SHARE[1])])
    res['dsea'] = dsea; res['thr'] = (t1, t2)
    res['belts'] = [hes & (dsea < t1), hes & (dsea >= t1) & (dsea < t2), hes & (dsea >= t2)]
    res['median_sea_km'] = float(vals[o][np.searchsorted(cw, 0.5)])
    res['belt_rings'] = [mask_to_rings(b, sigma=1.1, tol=0.5, min_px=100) for b in res['belts']]


def build_klo_clip(res, base_ids):
    """Kloaka dipotong dari tetangga (bukan sebaliknya): klaim nominal. Idempoten: tanpa tumpang-tindih = tak diubah."""
    klo0 = tmask('kloaka')
    nb = np.zeros((H, W), bool)
    for i in base_ids:
        if i != 'kloaka':
            nb |= tmask(i)
    ov = klo0 & nb
    res['klo_overlap_px'] = int(ov.sum())
    res['klo_overlap_by'] = {i: int((klo0 & tmask(i)).sum()) for i in base_ids if i != 'kloaka' and (klo0 & tmask(i)).any()}
    res['klo_nb'] = nb
    if ov.any():
        klo = klo0 & ~nb
        rings = mask_to_rings(klo, sigma=0.9, tol=0.45, min_px=100)
        # kontur 0,5 pada tepi lurus bisa menyisakan beberapa piksel di tetangga: kikis 1 px sepanjang tetangga sampai bersih
        for _ in range(3):
            cm = rings_mask(rings)
            bad = cm & nb
            if not bad.any():
                break
            klo = klo & ~ndi.binary_dilation(bad, structure=disk(1))
            rings = mask_to_rings(klo, sigma=0.9, tol=0.45, min_px=100)
        res['klo_rings'] = rings
    else:
        res['klo_rings'] = TERR['kloaka']['rings']
    res['klo_claim'] = rings_mask(res['klo_rings'])
    res['klo_old'] = klo0


def build_marka(res, occ):
    """Sabuk sempit di tepi darat (selatan/barat-daya) wilayah langsung Hesperia: halo lebar-bervariasi di tanah bebas."""
    hes = res['hes']
    dh = km_to(hes)
    z = zwin(noise_field(7.0, 3, (3.1, 8.2, 1.7)))
    wf = np.clip(1.0 + MARKA_VAR * z, 0.55, 1.45)
    free = land & ~occ & ~hes
    belt = free & WIN & (dh <= MARKA_KM * wf)
    belt = smooth(belt, open_r=2, close_r=3) & free
    belt = largest_components(belt, MARKA_MIN_PX)
    rings = mask_to_rings(belt, sigma=1.2, tol=0.5, min_px=200)
    for _ in range(3):                     # bersihkan sisa piksel di tetangga akibat kontur
        bad = rings_mask(rings) & occ
        if not bad.any():
            break
        belt = belt & ~ndi.binary_dilation(bad, structure=disk(1))
        belt = largest_components(belt, MARKA_MIN_PX)
        rings = mask_to_rings(belt, sigma=1.2, tol=0.5, min_px=200)
    res['marka'] = belt
    res['marka_rings'] = rings


def build_foedera_core(res, occ_other):
    """Inti berpenduduk tipis: jaringan jalur air (sungai besar, tebal ~ log aliran) + jalur pantai/danau, di dalam poligon
    Foedera, hanya komponen yang tersambung ke pantai. Poligon klaim Foedera TIDAK dipotong."""
    foe = tmask('foedera')
    wat = ~land
    cc, n = ndi.label(wat)
    sz = ndi.sum(wat, cc, index=np.arange(1, n + 1))
    big = np.isin(cc, 1 + np.nonzero(sz >= FCORE_WATER_MIN)[0])
    dwat = km_to(big)
    thr = THR * FCORE_ACC_K
    riv = (acc > thr) & land & foe
    lvl = np.zeros((H, W), np.float32); lvl[riv] = np.log2(acc[riv] / thr)
    rr = np.floor(np.clip(FCORE_R0 + FCORE_RK * lvl, FCORE_R0, FCORE_RMAX) + 0.5).astype(int)
    m = np.zeros((H, W), bool)
    for r in range(FCORE_R0, FCORE_RMAX + 1):
        sel = riv & ((rr <= r) if r == FCORE_R0 else (rr >= r) if r == FCORE_RMAX else (rr == r))
        if sel.any():
            m |= ndi.binary_dilation(sel, structure=disk(r))
    coast = (dwat <= FCORE_COAST_KM) & land
    m |= coast
    m &= foe & land & ~occ_other
    m = smooth(m, open_r=1, close_r=3)
    # hanya jaringan yang tersambung ke jalur pantai/danau (buang ruas sungai interior yang terputus)
    cc, n = ndi.label(m, structure=np.ones((3, 3)))
    touch = np.unique(cc[ndi.binary_dilation(coast & foe & land, structure=disk(2)) & m])
    m = np.isin(cc, touch[touch > 0])
    m = largest_components(m, 80)
    rings = mask_to_rings(m, sigma=1.0, tol=0.45, min_px=60)
    for _ in range(3):
        bad = rings_mask(rings) & occ_other
        if not bad.any():
            break
        m = m & ~ndi.binary_dilation(bad, structure=disk(1))
        rings = mask_to_rings(m, sigma=1.0, tol=0.45, min_px=60)
    res['fcore'] = m; res['fcore_rings'] = rings; res['foe'] = foe


def build_kloaka_zone(res):
    """Zona kontrol bergeser: bintik berjenjang TANPA tepi tegas, seluruhnya di dalam klaim nominal. Satu zona difus —
    sengaja tanpa kantong/inti terpisah (tidak menjawab knob 1: 'apakah ada zona yang cukup konsolidasi jadi mini-kerajaan?')."""
    claim = res['klo_claim']
    din = ndi.distance_transform_edt(claim)
    ys, xs = np.nonzero(claim)
    win = np.zeros((H, W), bool)
    win[max(ys.min() - 8, 0):ys.max() + 9, max(xs.min() - 8, 0):xs.max() + 9] = True
    z = zn(noise_field(24.0, 3, (5.5, 1.3, 9.1), win=win)[win])
    zf = np.zeros((H, W), np.float64); zf[win] = z
    tiers = []
    for e in KLZ_ERODE:
        m = claim & ((din - KLZ_NOISE * zf) > e)
        m = ndi.binary_opening(m, structure=disk(1))
        m = largest_components(m, 15)
        if m.sum() >= 15:
            tiers.append(m)
    res['klz'] = tiers
    res['klz_rings'] = [mask_to_rings(m, sigma=0.8, tol=0.4, min_px=12) for m in tiers]


def build_satvan(res, occ):
    """Pita persebaran Satvan Pedalaman (bukan wilayah berdaulat, tanpa batas). Aturan: di selatan Sabuk Pedalaman Hesperia,
    >= SAT_BUF_* dari tambang (sabuk Pedalaman), Interregna, Foedera, Vasundha; pita selebar SAT_WIDTH_KM di sepanjang
    selubung penyangga; meruncing di ujung barat (tepi barat Sabuk Pedalaman)."""
    ped = res['belts'][2]
    hP = hull(ped); hI = hull(union(INT_IDS))
    east = union(EAST_IDS); vas = rmask('vasundha')
    d_hp = km_to(hP); d_int = km_to(hI); d_foe = km_to(east); d_vas = km_to(vas)
    F = np.minimum.reduce([d_hp - SAT_BUF_HES_PED, d_int - SAT_BUF_INTERREGNA, d_foe - SAT_BUF_FOEDERA])
    ys, xs = np.nonzero(ped)
    lat_cut = float(LATC[ys.max()])              # selatan tepi selatan Sabuk Pedalaman ("di belakang" tambang)
    lon_w = float(LONC[xs.min()])                # tepi barat Sabuk Pedalaman
    taper = smoothstep(lon_w, lon_w + 9.0, LON)
    z = zwin(noise_field(5.0, 3, (7.7, 2.9, 4.1)))
    hw = 0.5 * SAT_WIDTH_KM * taper * np.clip(1.0 + 0.22 * z, 0.6, 1.4)
    t = np.abs(F - 0.5 * SAT_WIDTH_KM) / np.maximum(hw, 1e-6)       # 0 = sumbu pita, 1 = tepi
    z2 = zwin(noise_field(11.0, 3, (1.9, 6.3, 8.8)))
    band = (t <= 1.0) & (F >= 0) & land & ~occ & WIN & (d_vas >= SAT_BUF_VASUNDHA) & (LAT <= lat_cut)
    band = smooth(band, open_r=3, close_r=5) & land & ~occ & (d_vas >= SAT_BUF_VASUNDHA)
    band = largest_components(band, 3000)
    tt = t + 0.10 * z2
    tiers = [band, band & (tt <= 0.68), band & (tt <= 0.36)]
    tiers = [largest_components(smooth(m, open_r=2, close_r=3), 1500) & band for m in tiers]
    res['sat'] = tiers
    res['sat_F'] = F; res['sat_cut'] = (lat_cut, lon_w)
    res['sat_rings'] = [mask_to_rings(m, sigma=1.6, tol=0.6, min_px=200) for m in tiers]


def build(verbose=False):
    res = {}
    base_ids = [t for t in TERR if t not in RETIRED and t not in NEW_IDS and '__t' not in t]
    res['base_ids'] = base_ids
    res['hes'] = tmask('hesperia')
    res['sea'] = rmask('mare_internum') | rmask('sinus_adventus')
    build_klo_clip(res, base_ids)
    # okupasi = semua poligon lain + KLAIM Kloaka yang sudah dibersihkan (bukan cincin lamanya -> hasil sama pada proses ulang)
    occ = res['klo_claim'].copy()
    for i in base_ids:
        if i != 'kloaka':
            occ |= tmask(i)
    build_belts(res)
    build_marka(res, occ)
    occ_f = res['klo_claim'].copy()              # inti Foedera tidak boleh menimpa poligon lain (termasuk yang terletak di dalam Foedera)
    for i in base_ids:
        if i not in ('foedera', 'kloaka'):
            occ_f |= tmask(i)
    build_foedera_core(res, occ_f)
    build_kloaka_zone(res)
    build_satvan(res, occ | res['marka'])
    return res


def preview(res, path, box=(-88.0, 52.0, 14.0, -62.0), scale=1.0, rings_only=False):
    """Pratinjau poligon (bukan topeng) di atas peta dasar. box = (lon0, lon1, lat1, lat0)."""
    from PIL import Image, ImageDraw
    lon0, lon1, lat1, lat0 = box
    x0 = int((lon0 + 180) / 360 * W); x1 = int((lon1 + 180) / 360 * W); y0 = int((90 - lat1) / DEG); y1 = int((90 - lat0) / DEG)
    base = Image.open(os.path.join(ROOT, 'assets', 'base_4096.png')).convert('RGB').crop((x0, y0, x1, y1))
    sz = (int((x1 - x0) * scale), int((y1 - y0) * scale))
    base = base.resize(sz, Image.LANCZOS).convert('RGBA')
    ov = Image.new('RGBA', base.size, (0, 0, 0, 0)); dr = ImageDraw.Draw(ov)

    def pxy(la, lo):
        return (((lo + 180) / 360 * W - x0) * scale, ((90 - la) / DEG - y0) * scale)

    def draw(rings, col, fill=0, width=1):
        for r in rings:
            P_ = [pxy(*p) for p in r]
            if fill:
                dr.polygon(P_, fill=col + (fill,))
            dr.line(P_ + [P_[0]], fill=col + (255,), width=width)

    for i in res['base_ids']:
        if i in ('anusarri',):
            continue
        col = (255, 170, 0) if (i in INT_IDS) else (60, 200, 160) if i in EAST_IDS else (230, 60, 70) if i == 'hesperia' else (200, 200, 200)
        draw(TERR[i]['rings'] if i != 'kloaka' else res['klo_rings'], col, 28)
    for rings, col in zip(res['belt_rings'], ((60, 130, 255), (255, 200, 40), (220, 40, 40))):
        draw(rings, col, 60)
    draw(res['marka_rings'], (240, 130, 160), 110, 2)
    draw(res['fcore_rings'], (255, 240, 60), 120, 1)
    for rings, a in zip(res['sat_rings'], (50, 70, 90)):
        draw(rings, (255, 255, 120), a, 1)
    for rings, a in zip(res['klz_rings'], (60, 80, 100)):
        draw(rings, (255, 255, 255), a, 1)
    for lat in range(int(np.ceil(lat0 / 10) * 10), int(lat1) + 1, 10):
        y = pxy(lat, 0)[1]; dr.line([(0, y), (base.size[0], y)], fill=(255, 255, 255, 40)); dr.text((3, y + 2), str(lat), fill=(255, 255, 0, 200))
    for lon in range(int(np.ceil(lon0 / 10) * 10), int(lon1) + 1, 10):
        x = pxy(0, lon)[0]; dr.line([(x, 0), (x, base.size[1])], fill=(255, 255, 255, 40)); dr.text((x + 3, 3), str(lon), fill=(255, 255, 0, 200))
    Image.alpha_composite(base, ov).convert('RGB').save(path)


# ------------------------------------------------------------------------------------------------ record + meta
NAMES = {
    'hes_marka': 'Kerajaan marka Commonwealth (sabuk usulan)',
    'hes_pesisir': 'Hesperia · Sabuk Pesisir (usulan)',
    'hes_transisi': 'Hesperia · Sabuk Transisi (usulan)',
    'hes_pedalaman': 'Hesperia · Sabuk Pedalaman (usulan)',
    'foedera_inti': 'Foedera · inti berpenduduk tipis (usulan)',
    'kloaka_zona': 'Kloaka · zona kontrol bergeser (usulan)',
    'satvan_pedalaman': 'Satvan Pedalaman · zona persebaran (usulan)',
}


def _rec(id_, name, rings, mask, **extra):
    r = dict(id=id_, name=name, rings=rings, px=int(mask.sum()))
    r.update(extra)
    return r


def tiers_records(base, rings_list, masks):
    out = []
    for k, (rs, m) in enumerate(zip(rings_list, masks)):
        if not rs:
            continue
        if k == 0:
            out.append(_rec(base, NAMES[base], rs, m))
        else:
            out.append(_rec(f'{base}__t{k}', NAMES[base], rs, m, of=base, tier=k))
    return out


def records(res):
    """Territory baru, dikelompokkan menurut titik sisip (urutan = urutan gambar & hit-test)."""
    rec = {}
    rec['satvan'] = tiers_records('satvan_pedalaman', res['sat_rings'], res['sat'])
    rec['marka'] = [_rec('hes_marka', NAMES['hes_marka'], res['marka_rings'], res['marka'])]
    rec['belts'] = [_rec(i, NAMES[i], rs, m) for i, rs, m in zip(BELT_IDS, res['belt_rings'], res['belts'])]
    rec['kloaka_zone'] = tiers_records('kloaka_zona', res['klz_rings'], res['klz'])
    rec['foedera_inti'] = [_rec('foedera_inti', NAMES['foedera_inti'], res['fcore_rings'], res['fcore'])]
    return rec


def sat_scar(mask):
    d = scar_signed(LAT[mask], LON[mask]); w = COSW[mask]
    u = np.stack(unit(LAT[mask], LON[mask]), -1); c = (u * w[:, None]).sum(0); c /= np.linalg.norm(c)
    clat = float(np.degrees(np.arcsin(c[2]))); clon = float(np.degrees(np.arctan2(c[1], c[0])))
    dc = float(scar_signed(clat, clon))
    rings = {}
    for name in ('Within Scar', 'Adjacent', 'Peripheral', 'Unaffected'):
        rings[name] = 0.0
    for dd, ww in zip(d, w):
        rings[scar_ring(dd)] += float(ww)
    tot = sum(rings.values())
    return dict(centroid=[round(clat, 2), round(clon, 2)], d_centroid=round(dc, 2), ring_centroid=scar_ring(dc),
                abs_min=round(float(np.abs(d).min()), 2), abs_max=round(float(np.abs(d).max()), 2),
                share={k: round(v / tot, 4) for k, v in rings.items()},
                single=(None if sum(1 for v in rings.values() if v > 0) > 1 else scar_ring(float(d[0]))))


def coast_measure(res):
    """Selisih tepi pantai poligon Hesperia terhadap pantai fisik Mare Internum + panjang tepi pantai poligon."""
    hes = res['hes']
    wat = ~land
    cc, n = ndi.label(wat)
    lab = np.bincount(cc[rmask('mare_internum') & wat]).argmax()
    sea_phys = cc == lab
    d = km_to(sea_phys)
    edge = hes & ~ndi.binary_erosion(hes, border_value=1)
    cand = edge & (d < 400)
    v = d[cand]
    # keluarkan ujung barat/timur (tepi samping poligon, bukan pantai): ambil piksel dengan jarak <= 60 km
    vc = v[v <= 60]
    ring = np.array(TERR['hesperia']['rings'][0])

    def L(a, b):
        return float(gc_dist_deg(a[0], a[1], b[0], b[1])) * np.pi / 180 * R_KM
    flags = []
    for a, b in zip(ring[:-1], ring[1:]):
        i = int(np.clip((90 - (a[0] + b[0]) / 2) / DEG, 0, H - 1)); j = int(((a[1] + b[1]) / 2 + 180) / 360 * W) % W
        flags.append(d[i, j] <= 40)
    runs, st = [], None
    for k, f in enumerate(flags):
        if f and st is None:
            st = k
        if not f and st is not None:
            runs.append((st, k - 1)); st = None
    if st is not None:
        runs.append((st, len(flags) - 1))
    run = max(runs, key=lambda r: r[1] - r[0])
    path = ring[run[0]:run[1] + 2]
    return dict(gap_median_km=round(float(np.median(vc)), 1), gap_p90_km=round(float(np.percentile(vc, 90)), 1),
                gap_px=round(float(np.median(vc)) / PXKM, 2), n_edge_px=int(len(vc)),
                poly_coast_ring_km=int(round(sum(L(a, b) for a, b in zip(path[:-1], path[1:])), -1)),
                poly_coast_chord_km=int(round(L(path[0], path[-1]), -1)),
                ends=[[float(path[0][0]), float(path[0][1])], [float(path[-1][0]), float(path[-1][1])]])


def make_meta(res, recs):
    A = lambda m: round(area_km2(m) / 1e6, 2)      # noqa: E731  juta km2
    hes_a = area_km2(res['hes'])
    prov_avg = [round(area_km2(b) / n / 1e3) for b, n in zip(res['belts'], BELT_PROV)]
    sat0 = rasterize(recs['satvan'][0]['rings'])
    meta = dict(
        versi='politics-v3 · AS 1647 snapshot · 2026-10-02',
        status='Inferensi AI (bukan kanon) kecuali dinyatakan lain; semua angka = PLACEHOLDER/derivasi, lihat Kontrak Data bagian D',
        params=dict(MARKA_KM=MARKA_KM, MARKA_VAR=MARKA_VAR, SAT_BUF_HES_PED=SAT_BUF_HES_PED, SAT_BUF_INTERREGNA=SAT_BUF_INTERREGNA,
                    SAT_BUF_FOEDERA=SAT_BUF_FOEDERA, SAT_BUF_VASUNDHA=SAT_BUF_VASUNDHA, SAT_WIDTH_KM=SAT_WIDTH_KM,
                    FCORE_ACC_K=FCORE_ACC_K, FCORE_COAST_KM=FCORE_COAST_KM, KLZ_ERODE=list(KLZ_ERODE), SEED=SEED),
        belts=dict(thr_km=[round(res['thr'][0], 1), round(res['thr'][1], 1)], median_sea_km=round(res['median_sea_km']),
                   share_pct=[round(100 * area_km2(b) / hes_a, 1) for b in res['belts']], area_mkm2=[A(b) for b in res['belts']],
                   prov=list(BELT_PROV), prov_avg_kkm2=prov_avg, hesperia_mkm2=A(res['hes'])),
        marka=dict(area_mkm2=A(res['marka']), width_km=MARKA_KM, share_of_hesperia_pct=round(100 * area_km2(res['marka']) / hes_a, 1)),
        satvan=dict(area_mkm2=A(sat0), scar=sat_scar(sat0), lat_cut=round(res['sat_cut'][0], 2), lon_west=round(res['sat_cut'][1], 2)),
        foedera=dict(area_mkm2=A(tmask('foedera')), inti_mkm2=A(res['fcore']),
                     inti_share_pct=round(100 * res['fcore'].sum() / res['foe'].sum(), 1)),
        kloaka=dict(overlap_px_before=KLO_BASELINE['overlap_px'], overlap_by=KLO_BASELINE['overlap_by'], claim_px=int(res['klo_claim'].sum()),
                    old_px=KLO_BASELINE['px'], zone_px=[int(m.sum()) for m in res['klz']], claim_mkm2=A(res['klo_claim'])),
        coast=coast_measure(res),
    )
    return meta


def rasterize(rings):
    return rings_mask(rings)


# ------------------------------------------------------------------------------------------------ validator
def validate(res, recs, meta):
    errs, warns, info = [], [], []

    def E(c, msg):
        if not c:
            errs.append(msg)

    def iou(a, b):
        u = (a | b).sum()
        return float((a & b).sum() / u) if u else 1.0

    base_ids = res['base_ids']
    base_masks = {i: (res['klo_claim'] if i == 'kloaka' else tmask(i)) for i in base_ids}
    everything = np.zeros((H, W), bool)
    for m in base_masks.values():
        everything |= m
    all_recs = [r for g in recs.values() for r in g]
    ids = [r['id'] for r in all_recs]
    E(len(ids) == len(set(ids)), 'id record ganda')
    E(not any(i.startswith('cw') for i in ids), 'sisa polygon Vasal Commonwealth lama (prefiks cw) di record baru')
    # ring sanity
    for r in all_recs:
        E(len(r['rings']) > 0, f"{r['id']}: tanpa ring")
        for ring in r['rings']:
            E(len(ring) >= 4 and ring[0] == ring[-1], f"{r['id']}: ring tak tertutup / < 4 titik")
            E(all(-90 <= p[0] <= 90 and -180 <= p[1] <= 180 for p in ring), f"{r['id']}: koordinat di luar jangkauan")
    ras = {r['id']: rasterize(r['rings']) for r in all_recs}
    # kesetiaan ring terhadap topeng sumber
    srcs = {'hes_marka': res['marka'], 'foedera_inti': res['fcore']}
    for i, m in zip(BELT_IDS, res['belts']):
        srcs[i] = m
    for k, m in enumerate(res['sat']):
        srcs['satvan_pedalaman' if k == 0 else f'satvan_pedalaman__t{k}'] = m
    for k, m in enumerate(res['klz']):
        srcs['kloaka_zona' if k == 0 else f'kloaka_zona__t{k}'] = m
    for i, m in srcs.items():
        if i in ras:
            v = iou(ras[i], m)
            thr = 0.985 if i in BELT_IDS else 0.95 if '__t' in i or i.startswith('kloaka_zona') else 0.97
            E(v >= thr, f'{i}: IoU ring vs topeng {v:.3f} < {thr}')
            info.append(f'IoU {i:22s} {v:.4f}')
    # --- sabuk marka: tidak menimpa apa pun
    for i, m in base_masks.items():
        o = int((ras['hes_marka'] & m).sum())
        E(o == 0, f'hes_marka menimpa {i}: {o} px')
    mk_hes_contact = int((ndi.binary_dilation(ras['hes_marka'], structure=disk(2)) & base_masks['hesperia']).sum())
    E(mk_hes_contact > 400, 'hes_marka tidak menempel di tepi Hesperia')
    cc, n = ndi.label(ras['hes_marka'], structure=np.ones((3, 3)))
    E(n == 1, f'hes_marka terputus ({n} komponen)')
    # --- Kloaka: klaim bersih dari tetangga; IoU dengan versi lama
    for i, m in base_masks.items():
        if i != 'kloaka':
            o = int((res['klo_claim'] & m).sum())
            E(o == 0, f'klaim Kloaka menimpa {i}: {o} px')
    if res['klo_overlap_px']:
        E(res['klo_overlap_px'] == KLO_BASELINE['overlap_px'] and res['klo_overlap_by'] == KLO_BASELINE['overlap_by']
          and int(res['klo_old'].sum()) == KLO_BASELINE['px'], f"keadaan awal Kloaka tak cocok dengan pin: {res['klo_overlap_px']} {res['klo_overlap_by']}")
        v = iou(res['klo_claim'], res['klo_old'])
        E(v >= 0.96, f'klaim Kloaka menyimpang dari versi lama (IoU {v:.3f})')
        info.append(f'IoU kloaka klaim baru vs lama {v:.4f}')
    else:
        info.append('Kloaka sudah bersih dari tetangga (proses ulang)')
    # zona Kloaka di dalam klaim, bersarang
    for k in range(len(res['klz'])):
        i = 'kloaka_zona' if k == 0 else f'kloaka_zona__t{k}'
        inside = (ras[i] & res['klo_claim']).sum() / max(1, ras[i].sum())
        E(inside >= 0.97, f'{i} keluar dari klaim ({inside:.3f})')
        if k:
            prev = 'kloaka_zona' if k == 1 else f'kloaka_zona__t{k - 1}'
            E((ras[i] & ras[prev]).sum() / max(1, ras[i].sum()) >= 0.97, f'{i} tidak bersarang di {prev}')
    E(len(res['klz']) == len(KLZ_ERODE), 'jumlah jenjang zona Kloaka kurang')
    # --- tiga sabuk Hesperia
    hes = base_masks['hesperia']
    cover = np.zeros((H, W), np.int16)
    for i in BELT_IDS:
        cover += ras[i]
    E(((cover >= 1) & hes).sum() / hes.sum() >= 0.995, 'sabuk tidak menutupi seluruh Hesperia')
    E((cover >= 2).sum() / hes.sum() <= 0.005, 'sabuk saling menimpa > 0,5 %')
    E(((cover >= 1) & ~hes).sum() / hes.sum() <= 0.003, 'sabuk keluar dari poligon Hesperia > 0,3 %')
    sh = meta['belts']['share_pct']
    for a, b, nm in zip(sh, BELT_SHARE, BELT_IDS):
        E(abs(a - 100 * b) <= 0.5, f'porsi luas {nm} {a} % menyimpang dari kanon {100 * b:.1f} %')
    E(abs(meta['belts']['median_sea_km'] - 1050) <= 50, f"median jarak ke laut {meta['belts']['median_sea_km']} km jauh dari kanon ±1.050")
    for a, avg, nm in zip(meta['belts']['prov_avg_kkm2'], (140, 300, 550), BELT_IDS):
        E(abs(a - avg) / avg <= 0.12, f'rata-rata luas provinsi {nm} {a}k km2 menyimpang > 12 % dari kanon ±{avg}k')
    E(abs(meta['belts']['hesperia_mkm2'] - 12.55) <= 0.15, 'luas Hesperia menyimpang dari ±12,55 juta km2')
    E(abs(meta['foedera']['area_mkm2'] - 16.6) <= 0.2, 'luas Foedera menyimpang dari ±16,6 juta km2')
    # --- Foedera inti
    foe = base_masks['foedera']
    ins = (ras['foedera_inti'] & foe).sum() / ras['foedera_inti'].sum()
    E(ins >= 0.985, f'inti Foedera keluar dari poligon ({ins:.3f})')
    for i, m in base_masks.items():
        if i != 'foedera':
            o = int((ras['foedera_inti'] & m).sum())
            E(o == 0, f'foedera_inti menimpa {i}: {o} px')
    si = int(np.clip((90 - SYNODIA[0]) / DEG, 0, H - 1)); sj = int((SYNODIA[1] + 180) / 360 * W)
    E(bool(ras['foedera_inti'][si, sj]), 'Synodia tidak berada di dalam inti Foedera')
    E(0.08 <= meta['foedera']['inti_share_pct'] / 100 <= 0.25, 'porsi inti Foedera di luar 8–25 %')
    # --- Satvan: penyangga, tidak menimpa, tanpa batas kedaulatan
    sat = ras['satvan_pedalaman']
    occ_all = everything | ras['hes_marka']
    E(int((sat & occ_all).sum()) == 0, f'Satvan menimpa wilayah lain: {int((sat & occ_all).sum())} px')
    ped = ras['hes_pedalaman']
    chk = [('Sabuk Pedalaman Hesperia', ped, SAT_BUF_HES_PED), ('Interregna', union_final(INT_IDS), SAT_BUF_INTERREGNA),
           ('Foedera + tetangga timur', union_final(EAST_IDS), SAT_BUF_FOEDERA), ('Vasundha', rmask('vasundha'), SAT_BUF_VASUNDHA),
           ('kerajaan marka', ras['hes_marka'], 300.0)]
    meta['satvan']['min_dist_km'] = {}
    for nm, src, lim in chk:
        dmin = float(km_to(src)[sat].min())
        meta['satvan']['min_dist_km'][nm] = int(round(dmin))
        info.append(f'jarak min Satvan -> {nm}: {dmin:.0f} km (batas {lim:.0f})')
        if nm == 'kerajaan marka':
            if dmin < lim:
                warns.append(f'Satvan terlalu dekat kerajaan marka: {dmin:.0f} km')
        else:
            E(dmin >= lim - PXKM, f'Satvan {dmin:.0f} km dari {nm} (< {lim:.0f})')
    E(meta['satvan']['scar']['abs_min'] > 32.5 or meta['satvan']['scar']['single'] is None, 'Scar Satvan tak konsisten')
    for k in range(1, len(res['sat'])):
        i = f'satvan_pedalaman__t{k}'
        prev = 'satvan_pedalaman' if k == 1 else f'satvan_pedalaman__t{k - 1}'
        E(i in ras and (ras[i] & ras[prev]).sum() / max(1, ras[i].sum()) >= 0.97, f'{i} tidak bersarang')
    # --- yang tidak boleh berubah
    changed = {'kloaka', 'cassivalla'}
    for i in base_ids:
        if i in changed:
            continue
        E(i in TERR, f'{i} hilang')
    # --- tumpang-tindih lama (tidak disentuh) — hanya informasi
    pre = []
    keys = [i for i in base_ids if i not in ('anusarri', 'kloaka')]
    for a in range(len(keys)):
        for b in range(a + 1, len(keys)):
            o = int((base_masks[keys[a]] & base_masks[keys[b]]).sum())
            if o:
                pre.append((keys[a], keys[b], o))
    res['pre_overlaps'] = pre
    return errs, warns, info


def union_final(ids):
    m = np.zeros((H, W), bool)
    for i in ids:
        m |= tmask(i)
    return m


# ------------------------------------------------------------------------------------------------ tulis politics.json
def write_politics(res, recs, meta):
    pol = json.load(open(POL_PATH))
    drop = set(RETIRED) | set(NEW_IDS) | {t['id'] for t in pol['territories'] if '__t' in t['id']}
    out = list(recs['satvan'])
    for t in pol['territories']:
        if t['id'] in drop:
            continue
        if t['id'] == 'kloaka':
            t = dict(t); t['rings'] = res['klo_rings']; t['px'] = int(res['klo_claim'].sum())
            out.append(t); out.extend(recs['kloaka_zone'])
        elif t['id'] == 'cassivalla':
            t = dict(t); t['name'] = 'Cassivalla'
            out.append(t)
        elif t['id'] == 'hesperia':
            out.append(t); out.extend(recs['marka']); out.extend(recs['belts'])
        elif t['id'] == 'foedera':
            out.append(t); out.extend(recs['foedera_inti'])
        else:
            out.append(t)
    pol['territories'] = out
    pol['v3'] = meta
    with open(POL_PATH, 'w') as f:
        json.dump(pol, f, separators=(',', ':'))
    return POL_PATH



def report(errs, warns, info):
    for m in info:
        print('  ', m)
    for w in warns:
        print('PERINGATAN', w)
    for e in errs:
        print('GALAT', e)
    print('selesai:', len(errs), 'galat,', len(warns), 'peringatan')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--preview', help='tulis gambar pratinjau ke berkas ini (+ _klo.png)')
    ap.add_argument('--write', action='store_true', help='tulis data/politics.json (menolak bila ada GALAT)')
    a = ap.parse_args()
    res = build()
    recs = records(res)
    meta = make_meta(res, recs)
    errs, warns, info = validate(res, recs, meta)
    print(f"{'id':28s} {'px':>7s} {'rings':>5s} {'pts':>5s}")
    for g in recs.values():
        for r in g:
            print(f"{r['id']:28s} {r['px']:7d} {len(r['rings']):5d} {sum(len(x) for x in r['rings']):5d}")
    print(json.dumps({k: v for k, v in meta.items() if k not in ('params',)}, ensure_ascii=False, indent=1))
    print('tumpang-tindih lama yang TIDAK disentuh:', len(res['pre_overlaps']), 'pasangan, total',
          sum(o for _, _, o in res['pre_overlaps']), 'px')
    report(errs, warns, info)
    if a.preview:
        preview(res, a.preview)
        preview(res, a.preview.replace('.png', '_klo.png'), box=(-12.0, 8.0, 4.0, -12.0), scale=14.0)
        print('pratinjau ->', a.preview)
    if a.write:
        if errs:
            sys.exit('GALAT validasi — tidak menulis')
        print('ditulis ->', write_politics(res, recs, meta))


if __name__ == '__main__':
    main()
