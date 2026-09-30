"""Rhykaris Master Map — lapisan fisik: elevasi, batimetri, iklim, hidrologi, bioma (seed 1647)."""
import numpy as np, sys, time, heapq
from numba import njit
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
sys.path.insert(0, '/home/claude/rhykaris_map')
from geo import *
from noise import make_perm, fbm, ridged
from masks import build, landmask, SEED

# ---------- jarak geodesik ke garis pantai (km) ----------
def coast_distance(land, LAT, LON):
    er = ndi.binary_erosion(land, structure=np.ones((3, 3)), border_value=1)
    di = ndi.binary_dilation(land, structure=np.ones((3, 3)))
    coastL = land & ~er                    # piksel darat tepi
    coastS = di & ~land                    # piksel laut tepi
    x, y, z = unit(LAT, LON)
    P = np.stack([x.ravel(), y.ravel(), z.ravel()], 1)
    tL = cKDTree(P[coastS.ravel()]); tS = cKDTree(P[coastL.ravel()])
    out = np.zeros(land.size, np.float32)
    lm = land.ravel()
    dl, _ = tL.query(P[lm], workers=-1); ds, _ = tS.query(P[~lm], workers=-1)
    out[lm] = 2 * np.arcsin(np.clip(dl / 2, 0, 1)) * R_KM
    out[~lm] = 2 * np.arcsin(np.clip(ds / 2, 0, 1)) * R_KM
    return out.reshape(land.shape)

def dist_to_mask(mask, LAT, LON, sel=None):
    x, y, z = unit(LAT, LON)
    P = np.stack([x.ravel(), y.ravel(), z.ravel()], 1)
    t = cKDTree(P[mask.ravel()])
    q = P if sel is None else P[sel.ravel()]
    dd, _ = t.query(q, workers=-1)
    out = np.full(mask.size, np.nan, np.float32)
    if sel is None:
        out[:] = 2 * np.arcsin(np.clip(dd / 2, 0, 1)) * R_KM
    else:
        out[sel.ravel()] = 2 * np.arcsin(np.clip(dd / 2, 0, 1)) * R_KM
    return out.reshape(mask.shape)

def gauss(lat, lon, lat0, lon0, r):
    return np.exp(-(gc_dist_deg(lat, lon, lat0, lon0) / r) ** 2)

# ---------- hidrologi (numba) ----------
@njit(cache=True)
def priority_flood(h, land, H, W):
    filled = h.copy()
    closed = np.zeros(H * W, np.bool_)
    heap = [(0.0, np.int64(0))]
    heap.pop()
    for i in range(H):
        for j in range(W):
            k = i * W + j
            if not land[k]:
                closed[k] = True
                continue
            edge = False
            for di in range(-1, 2):
                ii = i + di
                if ii < 0 or ii >= H:
                    continue
                for dj in range(-1, 2):
                    jj = (j + dj) % W
                    if not land[ii * W + jj]:
                        edge = True
            if edge:
                heapq.heappush(heap, (h[k], np.int64(k)))
                closed[k] = True
    while len(heap) > 0:
        e, k = heapq.heappop(heap)
        i = k // W; j = k % W
        for di in range(-1, 2):
            ii = i + di
            if ii < 0 or ii >= H:
                continue
            for dj in range(-1, 2):
                if di == 0 and dj == 0:
                    continue
                jj = (j + dj) % W
                kk = ii * W + jj
                if closed[kk]:
                    continue
                closed[kk] = True
                ne = h[kk]
                if ne <= e:
                    ne = e + 1e-4
                filled[kk] = ne
                heapq.heappush(heap, (ne, np.int64(kk)))
    return filled

@njit(cache=True)
def d8_receivers(filled, land, coslat, H, W):
    rec = np.full(H * W, -1, np.int64)
    for i in range(H):
        for j in range(W):
            k = i * W + j
            if not land[k]:
                continue
            best = 0.0; bk = -1; seak = -1
            for di in range(-1, 2):
                ii = i + di
                if ii < 0 or ii >= H:
                    continue
                for dj in range(-1, 2):
                    if di == 0 and dj == 0:
                        continue
                    jj = (j + dj) % W
                    kk = ii * W + jj
                    if not land[kk]:
                        seak = kk
                        continue
                    dx = dj * coslat[i]; dist = np.sqrt(dx * dx + di * di) + 1e-9
                    s = (filled[k] - filled[kk]) / dist
                    if s > best:
                        best = s; bk = kk
            if seak >= 0 and (bk < 0 or best < 1e-3):
                rec[k] = seak
            else:
                rec[k] = bk
    return rec

@njit(cache=True)
def accumulate(order, rec, local, land):
    acc = local.copy()
    for t in range(order.size):
        k = order[t]
        if not land[k]:
            continue
        r = rec[k]
        if r >= 0 and land[r]:
            acc[r] += acc[k]
    return acc

# ---------- pipeline ----------
def run(W, H, verbose=True):
    t0 = time.time()
    F = build(W, H); land, comp = landmask(F)
    LAT, LON, d, al, w = F['LAT'], F['LON'], F['d'], F['al'], F['w']
    X, Y, Z = [v.ravel().astype(np.float64) for v in unit(LAT, LON)]
    perm = make_perm(SEED + 7)
    sh = (H, W)
    def fb(freq, o, octv=6, gain=0.5):
        return fbm(X, Y, Z, perm, freq, octv, 2.03, gain, o[0], o[1], o[2]).reshape(sh)
    def rg(freq, o, octv=6, gain=0.55):
        return ridged(X, Y, Z, perm, freq, octv, 2.1, gain, o[0], o[1], o[2]).reshape(sh)
    if verbose: print(f'[{time.time()-t0:5.1f}s] mask')
    cd = coast_distance(land, LAT, LON)
    if verbose: print(f'[{time.time()-t0:5.1f}s] coast distance')
    rA = d >= 0; rR = ~rA
    corr = F['corr']
    def arcw(a0, a1, soft=4.0):
        return smoothstep(a0 - soft, a0 + soft, al) * (1 - smoothstep(a1 - soft, a1 + soft, al))

    # ===== ELEVASI DARAT (km) =====
    und = fb(3.0, (1.0, 2.0, 3.0), 7, 0.52)
    det = fb(22.0, (4.0, -8.0, 1.0), 5, 0.55)                 # kekasaran halus (untuk hillshade tajam)
    r_int = rg(2.6, (9.0, -4.0, 2.0), 7, 0.55)            # punggungan pedalaman
    r_hi = rg(7.0, (-3.0, 7.0, 11.0), 7, 0.55)             # detail puncak
    r_det = rg(16.0, (13.0, 3.0, -6.0), 5, 0.55)
    inl = 1 - np.exp(-cd / 700.0)
    h = 0.03 + 0.34 * inl + 0.16 * und + 0.035 * det
    h += np.where(rR, 0.18 * inl, -0.04)
    # (1) Pegunungan Sutura: sabuk lipatan sejajar kurva (koordinat alpha-d), las benua x benua di koridor
    ax = (al * 0.11); dy = (d * 0.55)
    fx = np.cos(np.radians(al)) * 0 + ax; 
    fold = ridged((ax + 0.35 * und.ravel().reshape(sh)).ravel().astype(np.float64), (dy + 0.6 * und).ravel().astype(np.float64),
                  np.full(W * H, 3.3), perm, 1.0, 5, 2.0, 0.55, 0.0, 0.0, 0.0).reshape(sh)
    sutw = corr * np.exp(-(d / 6.5) ** 2) * (0.75 + 0.5 * smoothstep(-0.3, 0.6, und))
    sut = sutw
    h += sutw * (2.2 + 4.2 * fold + 3.0 * r_int * r_hi + 0.6 * r_det)
    # (2) Culmen & marka timur: rift pesisir vulkanik di pita (benua x laut)
    culm = arcw(-25, 60) * np.exp(-((d + 5.0) / 2.6) ** 2) * rR
    h += culm * (0.6 + 2.6 * r_hi ** 1.5 + 0.4 * r_det)
    # (3) Altiplano Rhykar (Inferensi AI): dataran tinggi pedalaman dekat pusat cap, tepi tak beraturan
    ga = gc_dist_deg(LAT, LON, -47.0, -14.0) + 8.5 * und + 3.0 * det
    alt = smoothstep(21.0, 11.0, ga) * rR
    h += alt * (1.5 + 0.5 * und) + alt * 0.9 * r_int + alt * 0.4 * r_hi
    # (4) Pegunungan Liminara (Inferensi AI): tanjung timur-laut, benteng medan
    gl = gc_dist_deg(LAT, LON, -3.0, 38.5) + 3.0 * und
    lim = smoothstep(10.0, 3.0, gl) * rR
    h += lim * (0.9 + 2.8 * r_int * (0.6 + 0.6 * r_hi))
    # (5) punggungan pedalaman Ferria & lobus
    h += land * (0.75 * r_int ** 1.6 + 0.25 * r_hi * r_int) * np.where(rR, 1.0, 0.65) * (0.25 + 0.75 * inl)
    # (6) Vastitas: plato kutub beku
    pol = smoothstep(-58, -70, LAT) * rR
    h += pol * (0.6 + 0.6 * und + 1.1 * r_int + 0.3 * r_hi)
    # (7) Ellumat: dataran tinggi interior (Libbal = titik terjauh dari kurva)
    ge = gc_dist_deg(LAT, LON, 55.5, 180.0) + 3.0 * und
    ell_hi = smoothstep(12.0, 5.0, ge) * rA
    h += ell_hi * (1.2 + 0.3 * und + 0.4 * r_hi) + comp['ell'] * (0.5 * r_int + 0.2 * r_hi)
    # (8) Sadumat: massif tinggi dominan (lobus timur), lereng barat basah
    sx, sy = azeq(LAT, LON, 17.0, 62.0)
    gm = np.sqrt(((sx - 6.0) / 10.5) ** 2 + ((sy - 3.0) / 8.5) ** 2) + 0.35 * und + 0.12 * det
    mas = smoothstep(1.05, 0.35, gm) * comp['sad']
    h += mas * (1.6 + 3.6 * r_int * (0.5 + 0.7 * r_hi) + 0.6 * r_det) + comp['sad'] * (0.6 * r_int + 0.3 * r_hi)
    # (9) pulau: kerucut vulkanik
    h += comp['isl'] * (0.15 + 1.4 * r_hi * np.exp(-cd / 110.0) + 0.3 * und)
    # (10) Dataran pesisir Hesperia (selatan Mare) & koridor tengah: rendah, subur
    hes = gauss(LAT, LON, -6.0, -30.0, 16.0) * rR * (1 - sut)
    h -= hes * 0.30 * inl
    mid = gauss(LAT, LON, -12.0, -6.0, 12.0) * rR
    h -= mid * 0.25 * inl
    h = np.where(land, np.maximum(h, 0.004 + 0.02 * np.clip(cd / 50, 0, 1)), 0.0)
    if verbose: print(f'[{time.time()-t0:5.1f}s] land elevation')

    # ===== BATIMETRI (km, negatif) =====
    ab = fb(2.2, (5.0, 5.0, -5.0), 5, 0.5)
    sea = ~land
    depth = -(0.03 + 0.14 * smoothstep(0, 75, cd) + 3.6 * smoothstep(60, 320, cd) + 0.8 * smoothstep(300, 1800, cd))
    depth += 0.45 * ab * smoothstep(300, 900, cd)
    # teluk dangkal penuh [PF §8]
    bayw = smoothstep(0.15, 0.55, F['bay']) * smoothstep(-1.5, -6.0, d) * sea
    dbay = -(0.02 + 0.07 * smoothstep(0, 700, cd) + 0.10 * smoothstep(-9.0, -3.0, d) + 0.02 * ab)
    bayw = ndi.gaussian_filter(bayw.astype(np.float32), 1.5 * W / 2048)
    depth = depth * (1 - bayw) + dbay * bayw
    # Mare Internum: cekungan foreland sedang
    mw = smoothstep(0.2, 0.6, F['mare']) * sea * (1 - smoothstep(0.05, 0.45, F['bay']))
    depth = depth * (1 - mw) + mw * (-(0.10 + 0.9 * smoothstep(0, 350, cd) + 0.2 * ab))
    # Palung Sutura: rift aktif di segmen laut kurva
    tr = (1 - corr) * np.exp(-(d / 0.9) ** 2) * sea
    depth = depth - tr * (2.6 + 1.0 * ab) * smoothstep(40, 250, cd)
    # bank samudra — plato bawah laut dangkal; bagian lapisan fisik Master Map v4 (kanon 29 Sep 2026). Kaitan ke komunitas Tehari = Inferensi AI.
    TEHARI_BANKS = [(38.0, -96.0, 5.5), (43.0, 28.0, 5.0), (8.0, 118.0, 6.0), (22.0, 160.0, 5.0), (-18.0, 150.0, 5.5), (60.0, -40.0, 5.0)]
    bank = np.zeros_like(d)
    for (la0, lo0, r0) in TEHARI_BANKS:
        bx, by = azeq(LAT, LON, la0, lo0)
        gb = np.sqrt((bx / (r0 * 1.5)) ** 2 + (by / (r0 * 0.75)) ** 2) + 1.1 * ab + 0.9 * und + 0.35 * det
        bank = np.maximum(bank, smoothstep(1.0, 0.45, gb))
    bank *= sea * (1 - tr)
    depth = depth * (1 - bank) + bank * (-(0.45 + 0.35 * (ab + 1)))
    elev = np.where(land, h * 1000.0, depth * 1000.0).astype(np.float32)   # meter
    if verbose: print(f'[{time.time()-t0:5.1f}s] bathymetry')

    # ===== IKLIM =====
    temp = 27.0 - 0.60 * np.abs(LAT) ** 1.12 - 6.0 * np.maximum(elev, 0) / 1000.0
    temp = temp - 4.0 * pol                                         # kutub Rhykar kering-beku
    q = 4 if W >= 2048 else 1
    LATq, LONq = LAT[::q, ::q], LON[::q, ::q]
    bq = dist_to_mask((F['bay'] > 0.5)[::q, ::q], LATq, LONq)
    mq = dist_to_mask(((F['mare'] > 0.5) & ~land)[::q, ::q], LATq, LONq)
    bayd = np.where(land, ndi.zoom(bq, q, order=1)[:H, :W], np.nan)
    maresel = np.where(land, ndi.zoom(mq, q, order=1)[:H, :W], np.nan)
    moist_scar = np.exp(-np.maximum(0, -d - 7) / 11.0)              # lembap dekat sabuk (angin gradient)
    pr = np.where(rA,
                  1.05 + 0.25 * fb(2.0, (7.0, 1.0, 1.0), 4, 0.5),
                  0.10 + 0.62 * moist_scar + 0.42 * np.exp(-cd / 650.0) + 0.45 * np.exp(-np.nan_to_num(bayd, nan=1e5) / 1100.0)
                  + 0.35 * np.exp(-np.nan_to_num(maresel, nan=1e5) / 800.0) + 0.10 * fb(2.0, (7.0, 1.0, 1.0), 4, 0.5))
    pr = pr - 0.55 * pol
    # Sadumat: lereng barat-daya basah (sabuk pohon raksasa), lee timur lebih kering
    pr = pr + comp['sad'] * np.clip(-(sx - 2.0) / 14.0, -0.5, 0.6)
    pr = np.clip(pr, 0.02, 1.8).astype(np.float32)
    if verbose: print(f'[{time.time()-t0:5.1f}s] climate')

    # ===== HIDROLOGI =====
    hl = np.where(land, elev, -1.0).astype(np.float64).ravel()
    lm = land.ravel()
    filled = priority_flood(hl, lm, H, W)
    coslat = np.cos(np.radians(LAT[:, 0])).astype(np.float64)
    rec = d8_receivers(filled, lm, coslat, H, W)
    order = np.argsort(-filled, kind='stable').astype(np.int64)
    local = (np.cos(np.radians(LAT)).ravel() * np.clip(pr.ravel() - 0.18, 0, None) ** 1.3).astype(np.float64)
    acc = accumulate(order, rec, local, lm)
    depr = (filled - hl).reshape(sh)
    if verbose: print(f'[{time.time()-t0:5.1f}s] hydrology')
    return dict(F=F, land=land, comp=comp, elev=elev, temp=temp.astype(np.float32), pr=pr, cd=cd,
                rec=rec.reshape(sh), acc=acc.reshape(sh).astype(np.float32), depr=depr.astype(np.float32),
                banks=TEHARI_BANKS, bank=bank.astype(np.float32), trench=tr.astype(np.float32), pol=pol.astype(np.float32),
                sut=sut.astype(np.float32), alt=alt.astype(np.float32), mas=mas.astype(np.float32), culm=culm.astype(np.float32))

if __name__ == '__main__':
    W, H = int(sys.argv[1]), int(sys.argv[2])
    T = run(W, H)
    e = T['elev']; land = T['land']
    print('elev land pct 50/90/99/max', np.percentile(e[land], [50, 90, 99]).round(0), e[land].max().round(0))
    print('elev sea pct 1/50/99', np.percentile(e[~land], [1, 50, 99]).round(0))
    np.savez_compressed(f'/home/claude/rhykaris_map/terrain_{W}.npz', elev=e, land=land, pr=T['pr'], temp=T['temp'],
                        acc=T['acc'], rec=T['rec'], depr=T['depr'], cd=T['cd'], bank=T['bank'], trench=T['trench'],
                        pol=T['pol'], sut=T['sut'], alt=T['alt'], mas=T['mas'], culm=T['culm'],
                        **{'comp_' + k: v for k, v in T['comp'].items()},
                        d=T['F']['d'].astype(np.float32), al=T['F']['al'].astype(np.float32),
                        bay=T['F']['bay'].astype(np.float32), mare=T['F']['mare'].astype(np.float32))
