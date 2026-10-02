# -*- coding: utf-8 -*-
"""Rhykaris Master Map — Interregna v2: menggambar ulang mozaik kedaulatan koridor tengah (AS 1647).

Mengapa ada skrip ini. Tujuh "kerajaan ilustratif" ir_1..ir_7 di politics.py tumbuh dari benih tunggal dengan jangkauan
(750 km) dan zona penalti (4,0 deg) yang sama, sehingga hasilnya tujuh gelembung seukuran yang tersusun seperti sarang
lebah. Skrip ini menggantinya dengan mozaik heterogen (kerajaan besar sampai mikro-polity, kota merdeka, wilayah adat,
enklaf, enklaf bersarang, eksklaf) yang tipologinya mengikuti kanon Atlas (lihat src/interregna_table.py).

Yang TIDAK diubah (dijaga oleh validator, bukan hanya niat):
  * footprint Interregna = persis piksel yang dulu dimiliki aventalia, tarvenna, cassivalla, nundina, ir_1..ir_7 (dihitung
    ulang dari pipeline lama, bit-exact), sehingga batas dengan Hesperia, Foedera, Kloaka, dan Silva Nullius tidak bergeser;
  * Cassivalla (sudah dianeksasi Foedera) dan Nundina (kota merdeka tanpa penguasa) dibekukan: pikselnya tetap;
  * semua territory/region lain di data/politics.json disalin apa adanya (termasuk Liminara/Ktonia/Pylora yang digambar
    manual 01 Okt 2026 — itulah sebabnya politics.py TIDAK dijalankan ulang secara penuh);
  * region payung `interregna` dan `silva_nullius` (harus identik dengan yang sudah ada).

Cara kerja (deterministik, seed 1647):
  1. Pipeline lama dijalankan ulang pada jendela Ferria -> label lama -> footprint F.
  2. Biaya gerak = biaya lama (relief, sungai besar, noise) + tanjakan + kemiringan + penghalang sungai + noise halus +
     "koridor" acak per polity + arah memanjang (anisotropi) per polity.
  3. Kerajaan (K) dan wilayah adat pita (A tanpa r_km) tumbuh lewat Dijkstra biaya-terrain dari benihnya; bobot tiap
     polity dikalibrasi sampai luasnya = `target` -> ukuran heavy-tailed, bentuk berjari-jari, bukan gelembung.
  4. Perbatasan di-warp (domain warp fBm, tiga skala), difilter modus, dibuka (opening) menurut ukuran, lalu fragmen
     dibersihkan.
  5. Kantong (kota merdeka C, mikro-polity M, wilayah adat enklaf A, eksklaf) dipotong dari induknya menurut jarak
     biaya-terrain yang dipotong pada luas `target`; benih enklaf digeser ke dalam induk supaya benar-benar terkurung,
     benih kantong bebas (tanpa `host`) ditaruh tabel di simpang batas.
  6. Validator memeriksa tiling, footprint, jangkar kanon, front Florian, urutan Aventalia-Tarvenna-Cassivalla,
     keterkurungan enklaf dan eksklaf, kantong bebas (kontak >= FREE_MIN_CONTACT px dengan >= 2 tetangga), geometri ring,
     kesetiaan ring terhadap label piksel, jarak warna antar-tetangga, dan cakupan poligon terhadap F. Semua temuan
     dicetak di akhir; `--write` menolak menulis bila ada GALAT.

Pakai:
    python src/interregna.py                       # hitung + validasi + laporan (tidak menulis apa pun)
    python src/interregna.py --preview out.png     # + gambar pratinjau (poligon) ; --labels out.png = peta label mentah
    python src/interregna.py --colors              # + usulan warna (pewarnaan graf) untuk COLORS di interregna_table.py
    python src/interregna.py --write               # tulis data/politics.json (hanya blok Interregna; idempoten)
Butuh work/terrain_4096.npz (python src/terrain.py 4096 2048, +- 2 menit; lihat README).
"""
import argparse
import heapq
import json
import os
import sys
import time

import numpy as np
from numba import njit
from scipy import ndimage as ndi
from skimage import measure, draw

SRC = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SRC)
from paths import ROOT, work          # noqa: E402
from geo import *                      # noqa: E402,F401,F403
from noise import make_perm, fbm       # noqa: E402
import interregna_table as T           # noqa: E402

# ------------------------------------------------------------------------------------------------ knob teknis
SEED = 1647
ALPHA_CLIMB = 1.0      # km-ekuivalen per meter tanjakan (searah): perbatasan cenderung di punggungan
BETA_SLOPE = 0.9       # pengali kemiringan (gradien m/px / G0): medan kasar = lambat tumbuh
G0 = 4.0
RIVER_BAR = 7.0        # biaya tambahan per piksel sungai besar (dilebarkan 3 px): sungai besar jadi perbatasan alami
BAR_MULT = 3.0         # sungai dianggap besar bila akumulasi aliran > BAR_MULT x ambang sungai
FINE_NOISE = 0.22      # simpangan baku noise biaya halus (freq 26, ~25 px)
CORRIDOR_NOISE = 0.40  # simpangan baku noise "koridor" per polity (freq 7, ~75 px): jari & teluk
ZONE = 1.5             # zona penalti = ZONE x jari-jari ekuivalen luas sasaran (kompak, tapi tak bulat)
WARP = ((8.0, 5.5), (18.0, 2.8), (40.0, 1.2))   # domain-warp perbatasan: (frekuensi fBm, amplitudo px) tiga skala
MODE_SIZE, MODE_PASSES = 5, 2
COLLAR = 2             # px induk yang tersisa mengelilingi enklaf
CARVE_NOISE = 0.35     # kekasaran tepi kantong
FREE_MIN_CONTACT = 6   # kantong bebas (tanpa host): kontak minimum (px) dengan masing-masing dari >= 2 tetangga


def zn(a):
    a = np.asarray(a, np.float64)
    return (a - a.mean()) / (a.std() + 1e-9)


# ------------------------------------------------------------------------------------------------ konteks (= politics.py)
Z = dict(np.load(work('terrain_4096.npz')))
land = Z['land'].astype(bool); elev = Z['elev']; acc = Z['acc']; d = Z['d']
H, W = land.shape
LAT, LON = grid(W, H)
DEG = 180.0 / H
THR = np.percentile(acc[land], 98.6)


def ij(lat, lon):
    return int(np.clip((90 - lat) / DEG, 0, H - 1)), int(((lon + 180) / 360 * W)) % W


@njit(cache=True)
def dijkstra_legacy(cost, allowed, seeds_i, seeds_j, H, W, i0, j0, h, w, coslat, pxkm, maxc):
    """Salinan persis politics.py (dipakai hanya untuk mereproduksi label lama -> footprint)."""
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


@njit(cache=True)
def dijkstra_grow(cost, elev, allowed, seeds_i, seeds_j, h, w, coslat, pxkm, maxc, alpha, ax, ay, aniso):
    """Dijkstra multi-sumber. Biaya langkah = jarak x biaya sel x faktor-arah + alpha x tanjakan (searah).
    Faktor-arah = 1 + aniso x sin^2(sudut antara langkah dan sumbu (ax=timur, ay=selatan)): memanjang searah sumbu."""
    out = np.full(h * w, np.inf)
    heap = [(0.0, np.int64(0))]; heap.pop()
    for s in range(seeds_i.size):
        k = seeds_i[s] * w + seeds_j[s]
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
                dx = dj * coslat[ii]
                nrm = np.sqrt(dx * dx + di * di)
                ca = (dx * ax + di * ay) / nrm
                fac = 1.0 + aniso * (1.0 - ca * ca)
                climb = elev[kk] - elev[k]
                if climb < 0.0:
                    climb = 0.0
                nc = c + nrm * pxkm * fac * 0.5 * (cost[k] + cost[kk]) + alpha * climb
                if nc < out[kk]:
                    out[kk] = nc; heapq.heappush(heap, (nc, np.int64(kk)))
    return out


LAT1, LAT0, LON0, LON1 = 16.0, -56.0, -82.0, 50.0       # jendela regional (zona manusia Ferria) = politics.py
i0, j0 = ij(LAT1, LON0); i1, j1 = ij(LAT0, LON1)
h, w = i1 - i0, j1 - j0
sub = (slice(i0, i1), slice(j0, j1))
pxkm = 2 * np.pi * R_KM / W
coslat = np.cos(np.radians(LAT[:, 0])).astype(np.float64)
e_s = elev[sub]; a_s = acc[sub]; land_s = land[sub]; d_s = d[sub]; LAT_s = LAT[sub]; LON_s = LON[sub]
river_big = (a_s > THR * 6)
_cost0 = (1.0 + 2.6 * np.clip((e_s - 1400) / 1800, 0, 1.5) + 2.2 * river_big + 3.0 * (np.abs(d_s) <= 6.5)).astype(np.float64).ravel()
notband = d_s < -6.5
_sx, _sy = azeq(LAT_s, LON_s, -9.6, 3.1)
_perm99 = make_perm(99)
_X, _Y, _Z3 = [v.ravel().astype(np.float64) for v in unit(LAT_s, LON_s)]
_nsil = fbm(_X, _Y, _Z3, _perm99, 18.0, 4, 2.0, 0.5, 1.0, 2.0, 3.0).reshape(h, w)
silva = land_s & (np.sqrt((_sx / 1.45) ** 2 + (_sy / 2.9) ** 2) + 0.9 * _nsil < 1.0)
_nbord = fbm(_X, _Y, _Z3, _perm99, 9.0, 5, 2.0, 0.55, -4.0, 7.0, 2.0).reshape(h, w)
cost_legacy = (_cost0.reshape(h, w) * (1.0 + 0.45 * _nbord).clip(0.5, 2.0))

# polity lama yang menentukan footprint + tetangganya (id, benih, bias, range, (pusat zona, radius), batasan keras)
LEGACY = [
    ('hesperia', [(-5.49, -8.31), (-4.5, -18.0), (-6.8, -27.0), (-9.5, -36.0), (-12.5, -44.0)], 900, 2600, ((-9.0, -26.0), 17.0), notband & ~silva),
    # legacy_w1..w3 = bekas tiga polygon Vasal Commonwealth bernomor (prefiks id "cw"; DICABUT — Canon Index #213, lapisan politik v3). Tetap di sini HANYA
    # sebagai pesaing partisi lama agar footprint Interregna (PR #9) tidak bergeser; bukan entitas peta dan tidak ditulis ke data.
    ('legacy_w1', [(-27.0, -60.0), (-28.0, -66.0)], 250, 1500, ((-29.0, -63.0), 8.0), notband),
    ('legacy_w2', [(-21.0, -48.0)], 250, 1300, ((-23.0, -48.0), 7.0), notband),
    ('legacy_w3', [(-21.5, -31.0)], 250, 1300, ((-23.0, -31.0), 7.0), notband),
    ('kloaka', [(-3.8, -4.3)], 0, 480, ((-3.8, -4.3), 2.4), ~silva),
    ('aventalia', [(-12.5, -7.5)], 0, 850, ((-12.5, -7.5), 4.0), ~silva),
    ('tarvenna', [(-13.5, -1.8)], 60, 850, ((-13.5, -1.8), 4.2), ~silva),
    ('cassivalla', [(-15.8, 5.0)], 60, 850, ((-15.8, 5.0), 4.2), ~silva),
    ('ir_1', [(-18.5, -9.5)], 0, 750, ((-18.5, -9.5), 4.0), ~silva),
    ('ir_2', [(-20.0, -3.0)], 0, 750, ((-20.0, -3.0), 4.0), ~silva),
    ('ir_3', [(-21.5, 3.5)], 0, 750, ((-21.5, 3.5), 4.0), ~silva),
    ('ir_4', [(-25.0, -8.5)], 0, 750, ((-25.0, -8.5), 4.0), ~silva),
    ('ir_5', [(-26.0, -1.5)], 0, 750, ((-26.0, -1.5), 4.0), ~silva),
    ('ir_6', [(-27.0, 5.5)], 0, 750, ((-27.0, 5.5), 4.0), ~silva),
    ('ir_7', [(-8.3, -3.2)], 0, 450, ((-8.3, -3.2), 2.6), ~silva),
    ('nundina', [(-9.80, 1.19)], 400, 95, ((-9.8, 1.19), 0.8), ~silva),
    ('foedera', [(3.03, 25.53), (-8.13, 5.05), (-3.5, 13.0), (-12.0, 17.0), (3.5, 12.0), (-16.0, 22.0)], 700, 2300, ((-4.0, 18.0), 13.5), notband & ~silva),
]
LEGACY_IDS = {p[0]: k + 1 for k, p in enumerate(LEGACY)}
OLD_IR = ['aventalia', 'tarvenna', 'cassivalla', 'nundina'] + [f'ir_{k}' for k in range(1, 8)]
FROZEN = ['cassivalla', 'nundina']


def legacy_labels():
    costs = []
    for pid, seeds, bias, rng, (zc, zr), hard in LEGACY:
        si = np.array([ij(a, b)[0] for a, b in seeds]); sj = np.array([ij(a, b)[1] for a, b in seeds])
        dz = gc_dist_deg(LAT_s, LON_s, zc[0], zc[1])
        pen = 1.0 + 3.0 * smoothstep(zr, zr * 1.7, dz)
        cst = (cost_legacy * pen).ravel()
        allow = land_s.copy()
        if hard is not None:
            allow &= hard
        allow = allow.ravel()
        for a, b in seeds:
            ii, jj = ij(a, b); allow[(ii - i0) * w + (jj - j0)] = True
        c = dijkstra_legacy(cst, allow, si, sj, H, W, i0, j0, h, w, coslat, pxkm, rng + 50).reshape(h, w)
        c[c > rng] = np.inf
        costs.append(c - bias)
    C = np.stack(costs)
    lab = np.argmin(C, 0) + 1
    lab[~np.isfinite(C.min(0))] = 0
    lab[~land_s] = 0
    for k in range(1, len(LEGACY) + 1):
        m = lab == k
        cc, n = ndi.label(m)
        if n > 1:
            sizes = ndi.sum(m, cc, index=np.arange(1, n + 1))
            for q, s in enumerate(sizes, start=1):
                if s < 60:
                    lab[cc == q] = 0
    return lab


def mask_to_rings(mask, sigma=1.1, tol=0.9, min_px=25, offset=(0, 0)):
    """= politics.py: kontur 0,5 dari topeng yang di-blur, disederhanakan, piksel -> lat/lon (cincin tertutup)."""
    if mask.sum() < min_px:
        return []
    m = ndi.gaussian_filter(mask.astype(np.float32), sigma)
    m = np.pad(m, 1)
    rings = []
    for cnt in measure.find_contours(m, 0.5):
        if len(cnt) < 8:
            continue
        cnt = measure.approximate_polygon(cnt, tol)
        if len(cnt) < 4:
            continue
        ii = cnt[:, 0] - 1 + offset[0] + 0.5; jj = cnt[:, 1] - 1 + offset[1] + 0.5
        la = 90 - ii * DEG; lo = -180 + jj * 360 / W
        area = 0.5 * abs(np.dot(jj, np.roll(ii, 1)) - np.dot(ii, np.roll(jj, 1)))
        if area < min_px:
            continue
        rings.append([[round(float(a), 3), round(float(b), 3)] for a, b in zip(la, lo)])
    return rings


RING_PARAMS = {'K': dict(sigma=1.1, tol=0.5, min_px=25), 'A': dict(sigma=1.0, tol=0.45, min_px=15),
               'M': dict(sigma=0.9, tol=0.4, min_px=8), 'C': dict(sigma=0.8, tol=0.4, min_px=5)}


# ------------------------------------------------------------------------------------------------ mozaik baru
S8 = np.ones((3, 3), bool)


def mode_filter(lab, Rc, size=MODE_SIZE, passes=MODE_PASSES):
    """Filter modus pada peta label (hanya di dalam R): menghaluskan tepi dan membuang jari tipis < ~2 px."""
    labs = [k for k in np.unique(lab[Rc]) if k > 0]
    for _ in range(passes):
        votes = np.stack([ndi.uniform_filter((lab == k).astype(np.float32), size) + 0.02 * (lab == k) for k in labs])
        new = np.array(labs)[np.argmax(votes, 0)]
        lab = np.where(Rc, new, 0).astype(lab.dtype)
    return lab


def neighbour_majority(lab, frag, Rc, exclude):
    ring = ndi.binary_dilation(frag, structure=S8) & ~frag & Rc
    vals = lab[ring]
    vals = vals[(vals != exclude) & (vals > 0)]
    return int(np.bincount(vals).argmax()) if vals.size else 0


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r + 0.5


def open_thin(lab, Rc, ids):
    """Buka (erosi lalu dilasi) tiap polity: leher, tentakel, dan jari yang lebih sempit dari ~2r+1 px diserahkan ke tetangga.
    Jari-jari bukaan mengikuti ukuran: kerajaan besar r=4, sedang r=3, kecil r=2."""
    for k in ids:
        m = lab == k
        n = int(m.sum())
        r = 4 if n >= 4000 else 3 if n >= 1500 else 2
        st = disk(r)
        if n < 8 * st.sum():
            continue
        removed = m & ~ndi.binary_opening(m, structure=st)
        if not removed.any():
            continue
        cc, nn = ndi.label(removed)
        for q in range(1, nn + 1):
            frag = cc == q
            to = neighbour_majority(lab, frag, Rc, k)
            if to:
                lab[frag] = to
    return lab


def cleanup(lab, Rc, ex_mask, ids):
    """Setiap polity hanya satu komponen (4-tetangga); serpihan non-eksklaf digabung ke tetangga dominan."""
    for _ in range(4):
        changed = False
        for k in ids:
            m = lab == k
            cc, n = ndi.label(m)
            if n <= 1:
                continue
            sizes = ndi.sum(m, cc, index=np.arange(1, n + 1))
            keep = 1 + int(np.argmax(sizes))
            for q in range(1, n + 1):
                if q == keep:
                    continue
                frag = cc == q
                if (ex_mask & frag).sum() > 0.5 * frag.sum():
                    continue
                to = neighbour_majority(lab, frag, Rc, k)
                if to:
                    lab[frag] = to; changed = True
        if not changed:
            break
    return lab


def filled_mask(lab, k, Rc):
    """Topeng polity k + lubang yang seluruhnya berisi polity baru lain (enklaf) -> cincin induk tanpa lubang."""
    m = lab == k
    holes = ndi.binary_fill_holes(m) & ~m
    if not holes.any():
        return m
    cc, n = ndi.label(holes)
    out = m.copy()
    for q in range(1, n + 1):
        comp = cc == q
        if Rc[comp].all():
            out |= comp
    return out


def build(verbose=True):
    t0 = time.time()
    lab_old = legacy_labels()
    F = np.isin(lab_old, [LEGACY_IDS[n] for n in OLD_IR])
    frozen = {n: (lab_old == LEGACY_IDS[n]) for n in FROZEN}
    froz_any = np.logical_or.reduce(list(frozen.values()))
    R = F & ~froz_any
    ys, xs = np.nonzero(F)
    by0, by1, bx0, bx1 = max(ys.min() - 4, 0), min(ys.max() + 5, h), max(xs.min() - 4, 0), min(xs.max() + 5, w)
    cs = (slice(by0, by1), slice(bx0, bx1))
    hh, ww = by1 - by0, bx1 - bx0
    Rc, Fc = R[cs], F[cs]
    frozc = {n: m[cs] for n, m in frozen.items()}
    coslat_c = coslat[i0 + by0:i0 + by1]
    LATc, LONc = LAT_s[cs], LON_s[cs]
    if verbose:
        print(f'legacy+footprint {time.time() - t0:.1f}s | F={int(F.sum())} px, beku={int(froz_any.sum())}, R={int(R.sum())}, crop {hh}x{ww}')

    # ---------------- medan biaya ----------------
    ec = e_s[cs].astype(np.float64)
    gy, gx = np.gradient(ndi.gaussian_filter(ec, 1.2))
    grad = np.hypot(gy, gx)                                     # m per px
    rivers = (a_s[cs] > THR * 1.5) & land_s[cs]                  # sungai yang menarik kota merdeka
    riv = ndi.binary_dilation((a_s[cs] > THR * BAR_MULT) & land_s[cs], structure=S8)   # hanya sungai besar yang jadi penghalang
    valley = ndi.binary_dilation(rivers, structure=S8, iterations=3)
    perm = make_perm(SEED)
    Xc, Yc, Zc = [v.ravel().astype(np.float64) for v in unit(LATc, LONc)]

    def noise(freq, octv, k, gain=0.5):
        return zn(fbm(Xc, Yc, Zc, perm, freq, octv, 2.0, gain, 11.3 * k + 1.7, -5.9 * k + 0.3, 3.1 * k - 2.2).reshape(hh, ww))

    cost_nr = cost_legacy[cs] * (1.0 + BETA_SLOPE * np.clip(grad / G0, 0, 3.0)) * np.exp(FINE_NOISE * noise(26.0, 4, 1))
    cost_nr = cost_nr.astype(np.float64)
    cost_riv = cost_nr + RIVER_BAR * riv
    ecf = ec.ravel()
    near_R = ndi.distance_transform_edt(~Rc, return_indices=True)[1]

    def seed_px(lat, lon, region=None):
        reg = Rc if region is None else region
        i, j = ij(lat, lon)
        i = int(np.clip(i - i0 - by0, 0, hh - 1)); j = int(np.clip(j - j0 - bx0, 0, ww - 1))
        if not reg[i, j]:
            ind = near_R if region is None else ndi.distance_transform_edt(~reg, return_indices=True)[1]
            ni, nj = int(ind[0][i, j]), int(ind[1][i, j])
            return (ni, nj), float(np.hypot(ni - i, nj - j))
        return (i, j), 0.0

    def grow(seeds, cost, allowed, axis=None, aniso=0.0, maxc=1e12):
        si = np.array([s[0] for s in seeds], dtype=np.int64); sj = np.array([s[1] for s in seeds], dtype=np.int64)
        th = np.radians(axis if axis is not None else 0.0)
        ax, ay = float(np.sin(th)), float(-np.cos(th))
        return dijkstra_grow(cost.ravel(), ecf, allowed.ravel(), si, sj, hh, ww, coslat_c, pxkm, maxc, ALPHA_CLIMB, ax, ay,
                             float(aniso) if axis is not None else 0.0).reshape(hh, ww)

    P = T.POLITIES
    idx = {p['id']: k + 1 for k, p in enumerate(P)}
    base = [p for p in P if 'r_km' not in p]
    carve = [p for p in P if 'r_km' in p]

    # ---------------- benih tambahan di sepanjang front Florian (Tarvenna) ----------------
    def front_seeds():
        cass = frozc['cassivalla']
        zone = Rc & ndi.binary_dilation(cass, structure=S8, iterations=2)
        out = []
        ii, jj = np.nonzero(zone)
        if ii.size:
            for lat in (-11.0, -12.6, -14.2, -15.8, -17.2):
                i, _ = ij(lat, 0.0); i -= i0 + by0
                q = np.argmin(np.abs(ii - i))
                out.append((int(ii[q]), int(jj[q])))
        nz = Rc & ndi.binary_dilation(frozc['nundina'], structure=S8, iterations=2)
        if nz.any():
            ni_, nj_ = np.nonzero(nz)
            s0, _ = seed_px(-13.5, -1.8)
            q = np.argmin((ni_ - s0[0]) ** 2 + (nj_ - s0[1]) ** 2)
            out.append((int(ni_[q]), int(nj_[q])))
        return out

    # ---------------- tumbuh + kalibrasi bobot ----------------
    eff = {p['id']: float(p['target']) for p in base}
    nested = {p['id']: sum(q['target'] for q in carve if q.get('host') == p['id']) for p in P}
    for p in carve:
        hid = p.get('host')
        if hid in eff:
            eff[hid] += p['target'] + nested[p['id']]
    for p in P:
        for e in p.get('exclaves', []):
            if e['host'] in eff:
                eff[e['host']] += e['target']
    free_loss = sum(p['target'] + nested[p['id']] for p in carve if not p.get('host'))
    scale = (Rc.sum() - free_loss) / sum(eff.values())
    tgt = np.array([eff[p['id']] * scale for p in base])
    Dk = []
    for n, p in enumerate(base):
        s0, mv = seed_px(*p['seed'])
        seeds = [s0] + (front_seeds() if p.get('front') else [])
        if verbose and mv > 0:
            print(f"   benih {p['id']} {p['seed']} di luar R, digeser {mv:.1f} px")
        # zona penalti: biaya naik di luar ~ZONE x jari-jari ekuivalen luas sasaran -> tak ada jari yang menyeberang separuh peta
        zr = ZONE * np.sqrt(tgt[n] / np.pi) * DEG
        dz = np.min([gc_dist_deg(LATc, LONc, LATc[s[0], s[1]], LONc[s[0], s[1]]) for s in seeds], axis=0)
        cst = cost_riv * np.exp(CORRIDOR_NOISE * noise(7.0, 3, 10 + n)) * (1.0 + 3.0 * smoothstep(zr, zr * 1.8, dz))
        D = grow(seeds, cst, Rc, p.get('axis'), p.get('aniso', 0.0))
        D[~Rc] = np.inf
        Dk.append(D)
    Dk = np.stack(Dk)
    base_ids = [idx[p['id']] for p in base]
    idarr = np.array(base_ids)

    # domain warp perbatasan: tiga skala (teluk besar, tikungan sedang, kerutan halus)
    dxw = sum(a_ * noise(f_, 3, 60 + 2 * n_) for n_, (f_, a_) in enumerate(WARP))
    dyw = sum(a_ * noise(f_, 3, 61 + 2 * n_) for n_, (f_, a_) in enumerate(WARP))
    yy, xx = np.mgrid[0:hh, 0:ww]
    sy = np.clip(np.rint(yy + dyw).astype(int), 0, hh - 1)
    sx = np.clip(np.rint(xx + dxw).astype(int), 0, ww - 1)

    def partition(wts, post=True):
        la = np.argmin(Dk * wts[:, None, None], 0)
        lab = np.zeros((hh, ww), np.int32)
        lab[Rc] = idarr[la[Rc]]
        if not post:
            return lab
        lw = lab[sy, sx]
        lw[~Rc] = 0
        if (Rc & (lw == 0)).any():
            ind = ndi.distance_transform_edt(lw == 0, return_indices=True)[1]
            lw = lw[ind[0], ind[1]]
            lw[~Rc] = 0
        lab = mode_filter(lw, Rc)
        lab = open_thin(lab, Rc, base_ids)
        return cleanup(lab, Rc, np.zeros_like(Rc), base_ids)

    wts = np.ones(len(base))

    def fit(post, iters, expo):
        nonlocal wts
        best = (9e9, wts.copy())
        for it in range(iters):
            lab_ = partition(wts, post)
            area = np.bincount(lab_[Rc], minlength=int(idarr.max()) + 1)[idarr].astype(float)
            err = float(np.abs(area / tgt - 1).max())
            if err < best[0]:
                best = (err, wts.copy())
            if err < 0.02:
                break
            wts = wts * (np.maximum(area, 1) / tgt) ** expo
            wts /= np.exp(np.log(wts).mean())
        wts = best[1]
        return best[0], it + 1

    e1, n1 = fit(False, 240, 0.30)
    e2, n2 = fit(True, 60, 0.35)
    if verbose:
        print(f'kalibrasi bobot: {n1}+{n2} iterasi, galat luas maks {e1 * 100:.1f}% -> {e2 * 100:.1f}% (setelah warp/filter)')
    lab = partition(wts, True)

    # ---------------- kantong (enklaf / kota merdeka / mikro-polity) ----------------
    lab_base = lab.copy()                      # partisi induk sebelum kantong dipotong (untuk analisis simpang batas)
    shifts = {}
    cq = noise(58.0, 2, 90)

    def carve_from(p, host_label, need, kind):
        """Potong `need` piksel dari host (atau dari mana saja jika host=0) di sekitar benih p."""
        if host_label:
            hm = lab == host_label
            core = ndi.binary_erosion(hm, structure=S8, iterations=COLLAR)
            if core.sum() < need:
                core = ndi.binary_erosion(hm, structure=S8, iterations=1)
        else:
            core = Rc.copy()
        if not core.any():
            return None, 0.0
        s0, mv = seed_px(*p['seed'], region=core)
        cst = cost_nr * np.exp(CARVE_NOISE * cq)
        if kind == 'C':
            cst = cst * np.where(valley, 0.6, 1.0)               # kota merdeka menjalar di lembah sungai
        D = grow([s0], cst, core)
        D[~core] = np.inf
        vals = np.sort(D[np.isfinite(D)])
        thr = vals[min(need, vals.size) - 1]
        m = np.isfinite(D) & (D <= thr)
        return m, mv

    for p in carve:
        k = idx[p['id']]
        hl = idx[p['host']] if p.get('host') else 0
        need = p['target'] + nested[p['id']]
        m, mv = carve_from(p, hl, need, p['type'])
        if m is None:
            print('!! kantong gagal', p['id']); continue
        lab[m] = k
        shifts[p['id']] = (mv, int(m.sum()), need)
    # ---------------- eksklaf ----------------
    ex_mask = np.zeros((hh, ww), bool)
    for p in P:
        for e in p.get('exclaves', []):
            hl = idx[e['host']]
            assert hl < idx[p['id']], f"eksklaf {p['id']} harus digambar sesudah induk {e['host']}"
            m, mv = carve_from(e, hl, e['target'], 'A')
            lab[m] = idx[p['id']]
            ex_mask |= m
            shifts[p['id'] + '/ex'] = (mv, int(m.sum()), e['target'])
    lab = cleanup(lab, Rc, ex_mask, [idx[p['id']] for p in P])
    return dict(lab=lab, lab_base=lab_base, Rc=Rc, Fc=Fc, cs=cs, idx=idx, frozc=frozc, lab_old=lab_old, shifts=shifts, ex_mask=ex_mask,
                hh=hh, ww=ww, by0=by0, bx0=bx0, R=R, F=F, rivers=rivers, scale=scale)


def rings_for(res):
    out = {}
    off = (i0 + res['by0'], j0 + res['bx0'])
    for p in T.POLITIES:
        k = res['idx'][p['id']]
        m = filled_mask(res['lab'], k, res['Rc'])
        out[p['id']] = (int((res['lab'] == k).sum()), mask_to_rings(m, offset=off, **RING_PARAMS[p['type']]))
    return out


# ------------------------------------------------------------------------------------------------ validator
def _seg_intersect(a, b, c, d_):
    def ccw(p, q, r):
        return (r[1] - p[1]) * (q[0] - p[0]) - (q[1] - p[1]) * (r[0] - p[0])
    d1, d2, d3, d4 = ccw(c, d_, a), ccw(c, d_, b), ccw(a, b, c), ccw(a, b, d_)
    return (d1 * d2 < 0) and (d3 * d4 < 0)


def ring_is_simple(ring):
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            if _seg_intersect(a, b, pts[j], pts[(j + 1) % n]):
                return False
    return True


def raster_rings(rings, res, scale=1):
    """Rasterkan cincin ke grid crop (skala `scale`) -> topeng bool."""
    hh, ww = res['hh'], res['ww']
    out = np.zeros((hh * scale, ww * scale), bool)
    for r in rings:
        ii = np.array([((90 - p[0]) / DEG - (i0 + res['by0'])) * scale for p in r])
        jj = np.array([(((p[1] + 180) / 360 * W) - (j0 + res['bx0'])) * scale for p in r])
        rr, cc = draw.polygon(ii, jj, out.shape)
        out[rr, cc] ^= True
    return out


def adjacency(lab):
    """{(a, b): jumlah pasang piksel bertetangga (8-arah)} antar label > 0."""
    H_, W_ = lab.shape
    pairs = {}
    for di, dj in ((0, 1), (1, 0), (1, 1), (1, -1)):
        if dj >= 0:
            a = lab[:H_ - di, :W_ - dj]; b = lab[di:, dj:]
        else:
            a = lab[:H_ - di, -dj:]; b = lab[di:, :W_ + dj]
        m = (a != b) & (a > 0) & (b > 0)
        lo = np.minimum(a[m], b[m]); hi = np.maximum(a[m], b[m])
        codes, cnt = np.unique(lo.astype(np.int64) * 1000 + hi, return_counts=True)
        for c_, n_ in zip(codes, cnt):
            key = (int(c_ // 1000), int(c_ % 1000))
            pairs[key] = pairs.get(key, 0) + int(n_)
    return pairs


def validate(res, rings, verbose=True):
    P = T.POLITIES; idx = res['idx']; lab = res['lab']; Rc = res['Rc']
    inv = {v: k for k, v in idx.items()}
    errs, warns = [], []
    # 1. tiling + footprint
    if not np.array_equal(lab > 0, Rc):
        errs.append(f'tiling: {(Rc & (lab == 0)).sum()} px R tak berlabel, {((lab > 0) & ~Rc).sum()} px label di luar R')
    union = (lab > 0) | res['frozc']['cassivalla'] | res['frozc']['nundina']
    if not np.array_equal(union, res['Fc']):
        errs.append('footprint F berubah')
    # 2. ukuran
    for p in P:
        a = int((lab == idx[p['id']]).sum()); t = p['target']
        tol = 0.22 if p['type'] == 'K' else 0.40
        if p['id'] in ('aventalia', 'tarvenna'):
            tol = 0.15
        if abs(a / t - 1) > tol:
            warns.append(f"{p['id']}: luas {a} vs sasaran {t} ({(a / t - 1) * 100:+.0f}%)")
    # 3. komponen
    for p in P:
        cc, n = ndi.label(lab == idx[p['id']])
        want = 1 + len(p.get('exclaves', []))
        if n != want:
            errs.append(f"{p['id']}: {n} komponen (seharusnya {want})")
    # 4. jangkar kanon
    for pid, (la, lo) in {'aventalia': (-12.5, -7.5), 'tarvenna': (-13.5, -1.8)}.items():
        i, j = ij(la, lo); i -= i0 + res['by0']; j -= j0 + res['bx0']
        if lab[i, j] != idx[pid]:
            errs.append(f'jangkar {pid} ({la},{lo}) jatuh di {inv.get(int(lab[i, j]), "-")}')
    i, j = ij(-14.6, 5.0); i -= i0 + res['by0']; j -= j0 + res['bx0']
    if not res['frozc']['cassivalla'][i, j]:
        errs.append('penanda Cassivalla keluar dari polygon beku')
    # 5. front Florian: Tarvenna menyentuh Cassivalla (>= 25 px) ; urutan barat->timur
    tm = lab == idx['tarvenna']
    tmd = ndi.binary_dilation(tm, structure=S8)
    contact = int((tmd & res['frozc']['cassivalla']).sum())
    nund = int((tmd & res['frozc']['nundina']).sum())
    if contact < 25:
        errs.append(f'Tarvenna hanya menyentuh Cassivalla {contact} px (front Florian)')
    cen = lambda m: np.nonzero(m)[1].mean()
    if not (cen(lab == idx['aventalia']) < cen(tm) < cen(res['frozc']['cassivalla'])):
        errs.append('urutan barat->timur Aventalia < Tarvenna < Cassivalla tidak terpenuhi')
    avd = ndi.binary_dilation(lab == idx['aventalia'], structure=S8)
    if not (avd & (res['lab_old'][res['cs']] == LEGACY_IDS['hesperia'])).any():
        warns.append('Aventalia tidak lagi menyentuh Hesperia')
    if (avd & res['frozc']['cassivalla']).any():
        errs.append('Aventalia menyentuh Cassivalla (harus di ujung barat)')
    # 6. enklaf terkurung
    for p in P:
        if 'r_km' not in p or not p.get('host'):
            continue
        m = lab == idx[p['id']]
        ring = ndi.binary_dilation(m, structure=S8) & ~m
        nb = set(int(v) for v in np.unique(lab[ring]))
        allowed = {idx[p['host']]} | {idx[q['id']] for q in P if q.get('host') == p['id']}
        if not nb <= allowed:
            errs.append(f"{p['id']} bukan enklaf murni dari {p['host']}: bertetangga {[inv.get(v, v) for v in sorted(nb)]}")
    # 6b. kantong bebas (tanpa host) memang bukan enklaf: menyentuh >= 2 "kelas" tetangga (label lain, atau 'luar' = tepi footprint)
    #     masing-masing >= FREE_MIN_CONTACT piksel. Tanpa ini teks "berdiri bebas" di data.json bisa berbeda dari geometri.
    for p in P:
        if 'r_km' not in p or p.get('host'):
            continue
        m = lab == idx[p['id']]
        ring = ndi.binary_dilation(m, structure=S8) & ~m
        cls = {}
        for v in np.unique(lab[ring]):
            n_ = int((lab[ring] == v).sum())
            cls[inv.get(int(v), 'luar') if v else 'luar'] = n_
        solid = {k_: n_ for k_, n_ in cls.items() if n_ >= FREE_MIN_CONTACT}
        if len(solid) < 2:
            errs.append(f"{p['id']} kantong bebas tetapi hanya menyentuh {sorted(cls.items(), key=lambda kv: -kv[1])} "
                        f"(perlu >= 2 tetangga dengan kontak >= {FREE_MIN_CONTACT} px)")
    # 6c. eksklaf: potongan terpisah, seluruh perbatasannya hanya dengan host-nya
    for p in P:
        for e in p.get('exclaves', []):
            cc_, n_ = ndi.label(lab == idx[p['id']], structure=S8)
            hit = [q_ for q_ in range(1, n_ + 1) if (res['ex_mask'] & (cc_ == q_)).any()]
            if len(hit) != 1:
                errs.append(f"{p['id']}: eksklaf tidak ditemukan sebagai komponen sendiri")
                continue
            comp = cc_ == hit[0]
            ring = ndi.binary_dilation(comp, structure=S8) & ~comp
            nb = set(int(v) for v in np.unique(lab[ring]))
            if nb != {idx[e['host']]}:
                errs.append(f"{p['id']}: eksklaf bukan terkurung host {e['host']}: bertetangga {[inv.get(v, v) for v in sorted(nb)]}")
    # 7. ring
    cnt = 0
    for p in P:
        px, rs = rings[p['id']]
        want = 1 + len(p.get('exclaves', []))
        if len(rs) != want:
            errs.append(f"{p['id']}: {len(rs)} ring (seharusnya {want})")
        for r in rs:
            cnt += len(r)
            if r[0] != r[-1]:
                errs.append(f"{p['id']}: ring tidak tertutup")
            if not ring_is_simple(r):
                errs.append(f"{p['id']}: ring memotong dirinya sendiri")
        if rs:
            m = filled_mask(lab, idx[p['id']], Rc)
            rm = raster_rings(rs, res, 1)
            iou = (m & rm).sum() / max((m | rm).sum(), 1)
            lim = 0.75 if p['type'] in ('C', 'M') else 0.90
            if iou < lim:
                warns.append(f"{p['id']}: IoU ring/label {iou:.2f}")
    if verbose:
        print(f'ring: {cnt} titik total | kontak Tarvenna-Cassivalla {contact} px, Tarvenna-Nundina {nund} px')
    return errs, warns


def report(errs, warns):
    """Cetak SEMUA temuan (validator geometri + warna + cakupan) sekali, di akhir."""
    for w_ in warns:
        print('  peringatan:', w_)
    for e_ in errs:
        print('  GALAT:', e_)
    if not errs:
        print('  validator: lulus')


def coverage_check(res, rings, verbose=True):
    """Kesetiaan poligon terhadap footprint F (label piksel) di level poligon: rasterisasi 4x. Poligon Cassivalla & Nundina
    (dibekukan) dibaca dari data/politics.json. Pembanding: cincin lama punya IoU 0,9908 terhadap F, jadi ~0,99 = setara."""
    pol = json.load(open(os.path.join(ROOT, 'data', 'politics.json')))
    old = {t['id']: t for t in pol['territories']}
    sc = 4
    F4 = np.kron(res['Fc'].astype(np.uint8), np.ones((sc, sc), np.uint8)).astype(bool)
    un = np.zeros_like(F4)
    for p in T.POLITIES:
        un |= raster_rings(rings[p['id']][1], res, sc)
    for tid in FROZEN:
        un |= raster_rings(old[tid]['rings'], res, sc)
    iou = (un & F4).sum() / max((un | F4).sum(), 1)
    miss = (F4 & ~un).sum() / sc ** 2
    extra = (un & ~F4).sum() / sc ** 2
    if verbose:
        print(f'cakupan poligon vs footprint F: IoU {iou:.4f}, bolong {miss:.0f} px, kelebihan {extra:.0f} px (F = {res["Fc"].sum()} px)')
    return iou, miss, extra


# ------------------------------------------------------------------------------------------------ warna
FIXED_COLORS = {'aventalia': '#86a8e6', 'tarvenna': '#e0a33a', 'hesperia': '#c0394b', 'foedera': '#2aa38a',
                'cassivalla': '#7fd1bd', 'nundina': '#ffd970', 'kloaka': '#8a8a8a'}   # = build_data.py (kanon visual yang sudah ada)


def _lab(hexcol):
    from skimage.color import rgb2lab
    rgb = np.array([[[int(hexcol[i:i + 2], 16) for i in (1, 3, 5)]]], np.float64) / 255.0
    return rgb2lab(rgb)[0, 0]


def delta_e(a, b):
    return float(np.linalg.norm(_lab(a) - _lab(b)))


def neighbours(res):
    """Tetangga tiap polity baru: polity baru lain + tetangga tetap (Hesperia, Foedera, Kloaka, Cassivalla, Nundina, Aventalia/Tarvenna sudah di tabel)."""
    inv = {v: k for k, v in res['idx'].items()}
    nb = {p['id']: set() for p in T.POLITIES}
    for (a, b), n in adjacency(res['lab']).items():
        if n >= 2:
            nb[inv[a]].add(inv[b]); nb[inv[b]].add(inv[a])
    lo = res['lab_old'][res['cs']]
    fixed = {'hesperia': lo == LEGACY_IDS['hesperia'], 'foedera': lo == LEGACY_IDS['foedera'], 'kloaka': lo == LEGACY_IDS['kloaka'],
             'cassivalla': res['frozc']['cassivalla'], 'nundina': res['frozc']['nundina']}
    for p in T.POLITIES:
        dm = ndi.binary_dilation(res['lab'] == res['idx'][p['id']], structure=S8)
        for name, m in fixed.items():
            if (dm & m).sum() >= 2:
                nb[p['id']].add(name)
    return nb


def suggest_colors(res, palette, de_touch=26.0, de_nested=40.0):
    """Pewarnaan graf (DSATUR + backtracking) dengan jarak persepsi CIE-Lab: tetangga >= de_touch, induk-enklaf >= de_nested."""
    nb = neighbours(res)
    fixed = dict(FIXED_COLORS)
    ids = [p['id'] for p in T.POLITIES if p['id'] not in ('aventalia', 'tarvenna')]
    host = {p['id']: p.get('host') for p in T.POLITIES}
    need = {}
    for i in ids:
        for j in nb[i]:
            need[(i, j)] = de_nested if (host.get(i) == j or host.get(j) == i) else de_touch
    pal = list(palette)
    labs = {c: _lab(c) for c in pal + list(fixed.values())}
    de = lambda a, b: float(np.linalg.norm(labs[a] - labs[b]))
    assign = {}
    use = {c: 0 for c in pal}

    def color_of(x):
        return assign.get(x) or fixed.get(x)

    def ok(i, c):
        for j in nb[i]:
            cj = color_of(j)
            if cj is not None and de(c, cj) < need.get((i, j), need.get((j, i), de_touch)):
                return False
        return True

    order = sorted(ids, key=lambda i: -len(nb[i]))

    def solve(pending):
        if not pending:
            return True
        # DSATUR: paling sedikit pilihan dulu
        best = min(pending, key=lambda i: (sum(ok(i, c) for c in pal), -len(nb[i])))
        cands = sorted([c for c in pal if ok(best, c)], key=lambda c: (use[c], pal.index(c)))
        for c in cands:
            assign[best] = c; use[c] += 1
            if solve([x for x in pending if x != best]):
                return True
            del assign[best]; use[c] -= 1
        return False

    if not solve(order):
        raise SystemExit('pewarnaan graf gagal — longgarkan ambang atau tambah palet')
    return assign, nb


def check_colors(res, errs, warns):
    if not T.COLORS:
        return
    nb = neighbours(res)
    for p in T.POLITIES:
        if p['id'] in ('aventalia', 'tarvenna'):
            continue
        c = T.COLORS.get(p['id'])
        if not c:
            errs.append(f"warna {p['id']} belum diisi"); continue
        for j in nb[p['id']]:
            cj = T.COLORS.get(j) or FIXED_COLORS.get(j)
            if cj and delta_e(c, cj) < 20:
                errs.append(f"warna {p['id']} {c} terlalu mirip tetangga {j} {cj} (dE {delta_e(c, cj):.0f})")


# ------------------------------------------------------------------------------------------------ tulis politics.json
def write_politics(res, rings):
    path = os.path.join(ROOT, 'data', 'politics.json')
    pol = json.load(open(path))
    keep_anchor = {t['id']: t for t in pol['territories'] if t['id'] in ('aventalia', 'tarvenna')}
    new = {}
    for p in T.POLITIES:
        px, rs = rings[p['id']]
        nm = keep_anchor[p['id']]['name'] if p['id'] in keep_anchor else T.name_of(p)
        new[p['id']] = dict(id=p['id'], name=nm, rings=rs, px=px)
    out, placed = [], False
    for t in pol['territories']:
        if t['id'] in keep_anchor:
            out.append(new[t['id']])
        elif t['id'].startswith('ir_'):
            if not placed:
                out.extend(new[p['id']] for p in T.POLITIES if p['id'].startswith('ir_'))
                placed = True
        else:
            out.append(t)
    assert placed
    pol['territories'] = out
    with open(path, 'w') as f:
        json.dump(pol, f, separators=(',', ':'))
    return path


# ------------------------------------------------------------------------------------------------ pratinjau
def _ctx_rings():
    pol = json.load(open(os.path.join(ROOT, 'data', 'politics.json')))
    ctx = [(t['id'], r) for t in pol['territories'] if t['id'] in ('hesperia', 'foedera', 'kloaka', 'cassivalla', 'nundina') for r in t['rings']]
    ctx += [(r['id'], rr) for r in pol['regions'] if r['id'] == 'silva_nullius' for rr in r['rings']]
    return ctx


def preview(res, rings, path, scale=5, labels=False):
    from PIL import Image, ImageDraw
    y0 = i0 + res['by0'] - 10; x0 = j0 + res['bx0'] - 10
    hh = res['hh'] + 20; ww = res['ww'] + 20
    base = Image.open(os.path.join(ROOT, 'assets', 'base_4096.png')).convert('RGB').crop((x0, y0, x0 + ww, y0 + hh))
    base = base.resize((ww * scale, hh * scale), Image.LANCZOS).convert('RGBA')
    ov = Image.new('RGBA', base.size, (0, 0, 0, 0)); dr = ImageDraw.Draw(ov)
    pal = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff',
           '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080']

    def pxy(lat, lon):
        return (((lon + 180) / 360 * W - x0) * scale, ((90 - lat) / DEG - y0) * scale)

    for lat in range(-34, -2, 2):
        a = pxy(lat, -20)[1]; dr.line([(0, a), (base.size[0], a)], fill=(255, 255, 255, 38), width=1); dr.text((3, a - 11), f'{lat}', fill=(255, 255, 255, 150))
    for lon in range(-18, 14, 2):
        a = pxy(0, lon)[0]; dr.line([(a, 0), (a, base.size[1])], fill=(255, 255, 255, 38), width=1); dr.text((a + 3, 3), f'{lon}', fill=(255, 255, 255, 150))
    for id_, r in _ctx_rings():
        dr.line([pxy(*p) for p in r], fill=(255, 255, 255, 170), width=1)
    if labels:
        lab = res['lab']
        for k in range(1, int(lab.max()) + 1):
            m = lab == k
            if not m.any():
                continue
            col = tuple(int(pal[(k - 1) % len(pal)][i:i + 2], 16) for i in (1, 3, 5))
            ys, xs = np.nonzero(m)
            for y_, x_ in zip(ys, xs):
                X = (x_ + res['bx0'] + j0 - x0) * scale; Y = (y_ + res['by0'] + i0 - y0) * scale
                dr.rectangle([X, Y, X + scale - 1, Y + scale - 1], fill=col + (130,))
    for n, (id_, (px, rs)) in enumerate(rings.items()):
        hexc = T.COLORS.get(id_) or FIXED_COLORS.get(id_) or pal[n % len(pal)]
        col = tuple(int(hexc[i:i + 2], 16) for i in (1, 3, 5))
        for r in rs:
            P_ = [pxy(*p) for p in r]
            if not labels:
                dr.polygon(P_, fill=col + (66,))
            dr.line(P_, fill=col + (255,) if not labels else (0, 0, 0, 255), width=2)
        if rs:
            c = np.mean([pxy(*p) for p in max(rs, key=len)], axis=0)
            dr.text((c[0] - 14, c[1] - 6), id_, fill=(255, 255, 255, 255))
            dr.text((c[0] - 14, c[1] + 5), str(px), fill=(255, 235, 150, 255))
    Image.alpha_composite(base, ov).convert('RGB').save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--preview', help='tulis gambar pratinjau poligon ke berkas ini')
    ap.add_argument('--labels', help='tulis peta label piksel mentah ke berkas ini')
    ap.add_argument('--colors', action='store_true', help='usulkan warna (pewarnaan graf) dan cetak sebagai dict untuk interregna_table.py')
    ap.add_argument('--write', action='store_true', help='tulis data/politics.json')
    a = ap.parse_args()
    res = build()
    rings = rings_for(res)
    print(f"{'id':10s} {'tipe':4s} {'px':>6s} {'rings':>5s} {'pts':>4s}   {'sasaran':>7s}  geser-benih")
    for p in T.POLITIES:
        px, rs = rings[p['id']]
        sh = res['shifts'].get(p['id'])
        print(f"{p['id']:10s} {p['type']:4s} {px:6d} {len(rs):5d} {sum(len(r) for r in rs):4d}   {p['target']:7d}  " + (f'{sh[0]:.1f}px' if sh else ''))
    errs, warns = validate(res, rings)
    check_colors(res, errs, warns)
    iou, gap, extra = coverage_check(res, rings)
    if iou < 0.985:
        errs.append(f'cakupan poligon menyimpang dari footprint F (IoU {iou:.4f})')
    report(errs, warns)
    if a.colors:
        assign, nb = suggest_colors(res, T.PALETTE)
        print('COLORS = {')
        for p in T.POLITIES:
            if p['id'] in assign:
                print(f"    '{p['id']}': '{assign[p['id']]}',")
        print('}')
        if not T.COLORS:
            T.COLORS.update(assign)
    if a.preview:
        preview(res, rings, a.preview)
        print('pratinjau ->', a.preview)
    if a.labels:
        preview(res, rings, a.labels, labels=True)
        print('label ->', a.labels)
    if a.write:
        if errs:
            sys.exit('GALAT validasi — tidak menulis')
        print('ditulis ->', write_politics(res, rings))


if __name__ == '__main__':
    main()
