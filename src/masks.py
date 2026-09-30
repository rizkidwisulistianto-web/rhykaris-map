"""Rhykaris Master Map — konstruksi daratan berbasis constraint kanon (seed 1647).
Constraint yang dijadikan INPUT generator (bukan cek belakangan):
  - Scar small circle (-55.5,0; r 72.5), pita 13.0 deg  [Kanon PF §3, Tension #18]
  - Darat Rhykar 23% / Aeris 15% / air 62% (berbobot cos-lat) [Kanon PF §5, CI #110]
  - Tepat 1 koridor darat lintas-sutura, lon -159..-30 (barat Teluk) [CI #110]
  - Teluk Kontak di lon 0, tepi timur-laut superbenua; sisi timur teluk = pesisir terbuka [PF §8, §5]
  - Superbenua geser barat, menjulur ke kutub S (cold desert), laut di sisi antimeridian [PF §5, §5.0]
  - Jantung Aeris di antipode (+55.5,180) ~3.5%; porsi lintas-sutura ~7.6%; 1 daratan sedang (Sadumat ~16/60) + kepulauan koridor
  - Kutub U = laut-es [PF §5.0]
"""
import numpy as np, sys
sys.path.insert(0, '/home/claude/rhykaris_map')
from geo import *
from noise import make_perm, fbm, ridged

SEED = 1647
CORR_A0, CORR_A1 = -166.19, -30.79     # azimut ujung koridor (lon -159 .. -30)
ANTI = (55.5, 180.0)

def wquant_thresh(P, w, region, target):
    """ambang t sehingga sum(w[region & P>t]) = target (fraksi permukaan)."""
    p = P[region]; ww = w[region]
    o = np.argsort(-p); cs = np.cumsum(ww[o])
    k = np.searchsorted(cs, target)
    k = min(max(k, 0), len(p) - 1)
    return p[o][k]

def std(a):
    return (a - a.mean()) / (a.std() + 1e-9)

def build(W, H, verbose=True, LL=None, stats=None):
    """LL=(LAT,LON) opsional: evaluasi di grid lain (mis. jendela resolusi tinggi).
    stats: mean/std global per medan noise (wajib bila LL diberikan agar normalisasi identik)."""
    LAT, LON = grid(W, H) if LL is None else LL
    H, W = LAT.shape
    rec_stats = {}
    def nstd(name, a):
        if stats is not None:
            m, s_ = stats[name]
        else:
            m, s_ = float(a.mean()), float(a.std())
        rec_stats[name] = (m, s_)
        return (a - m) / (s_ + 1e-9)
    w = area_w(LAT)
    d = scar_signed(LAT, LON)
    al = scar_azimuth(LAT, LON)
    X, Y, Z = [v.ravel().astype(np.float64) for v in unit(LAT, LON)]
    perm = make_perm(SEED)
    sh = (H, W)
    def F(freq, octv, gain, o, lac=2.03, x=None):
        xx, yy, zz = (X, Y, Z) if x is None else x
        return fbm(xx, yy, zz, perm, freq, octv, lac, gain, o[0], o[1], o[2]).reshape(sh)
    # --- domain warp (lapisan pembentuk garis pantai organik)
    k = 0.22
    wx = fbm(X, Y, Z, perm, 1.3, 4, 2.0, 0.5, 11.1, 3.3, 7.7)
    wy = fbm(X, Y, Z, perm, 1.3, 4, 2.0, 0.5, -5.2, 13.4, 1.9)
    wz = fbm(X, Y, Z, perm, 1.3, 4, 2.0, 0.5, 2.8, -9.9, 15.2)
    WX = (X + k * wx, Y + k * wy, Z + k * wz)
    n_cont = nstd('n_cont', F(2.1, 8, 0.55, (0.0, 0.0, 0.0), x=WX))        # garis pantai makro-meso
    n_lo = nstd('n_lo', F(0.9, 3, 0.5, (31.0, -7.0, 4.0)))               # modulasi skala benua
    n_isl = nstd('n_isl', F(6.5, 6, 0.55, (-21.0, 5.5, 9.0), x=WX))        # butir pulau
    n_fine = nstd('n_fine', F(9.0, 5, 0.5, (3.3, 44.0, -12.0), x=WX))

    # koordinat bantu
    n_clu = nstd('n_clu', F(3.2, 3, 0.5, (8.0, -17.0, 22.0)))              # pengelompok gugus pulau
    n_edge = nstd('n_edge', F(1.6, 4, 0.55, (-40.0, 12.0, 6.0), x=WX))       # distorsi tepi besar (pantai timur/kutub)
    lonE = np.interp(LAT, [-72, -64, -56, -46, -34, -22, -10, 0, 8, 15],
                          [84, 66, 54, 42, 33, 34, 39, 43, 44, 44])   # pantai timur Ferria (tepi mundur)
    lonE = lonE + 5.5 * n_edge
    lonW = np.interp(LAT, [-72, -66, -60, -54, -48, -40],
                          [-182, -178, -171, -165, -161, -158]) + 4.0 * n_edge
    L = np.where(LON < -30, LON + 360.0, LON)                           # bujur kontinu 0..330
    polar_lat = -65.5 + 3.0 * np.sin(np.radians(2 * LON + 40)) + 2.5 * np.sin(np.radians(5 * LON - 70)) + 5.5 * n_edge
    polar = smoothstep(polar_lat + 3.5, polar_lat - 3.0, LAT)          # tanah kutub S (Vastitas)
    corr = smoothstep(CORR_A0 - 2, CORR_A0 + 3, al) * (1 - smoothstep(CORR_A1 - 3, CORR_A1 + 2, al))
    corr_hard = (al >= CORR_A0) & (al <= CORR_A1)

    # ================= SISI RHYKAR (d<0) =================
    sea_anti = smoothstep(lonE - 6, lonE + 10, L) * (1 - smoothstep(lonW + 360 - 10, lonW + 360 + 5, L))
    sea_anti *= (1 - polar)
    # Teluk Kontak: sumbu N-S di lon 0, kepala ~ -2.5, mulut di tepi dalam pita
    hw = 1.8 + 17.0 * np.clip((LAT + 0.6) / 13.0, 0, None) ** 0.58 + 1.2 * n_lo
    cen = 1.6 * np.clip((LAT + 2.5) / 14.0, 0, 1)
    bay = smoothstep(hw + 4.5, hw - 3.0, np.abs(LON - cen)) * smoothstep(-3.8, 0.6, LAT) * (LAT < 26)
    # Mare Internum [Inferensi AI]: cekungan foreland di selatan las Sutura (sejajar kurva), tersambung ke teluk
    mare_a = smoothstep(-92, -80, al) * (1 - smoothstep(-16, -9, al))
    mare_c = -13.0 + 1.8 * np.sin(np.radians(al * 5.0)) + 1.0 * n_lo
    mare_hw = 4.4 + 1.6 * np.sin(np.radians(al * 3.0 + 50)) + 0.9 * n_edge
    mare = mare_a * smoothstep(mare_hw + 2.0, mare_hw - 1.5, np.abs(d - mare_c))
    # selat Mare -> teluk (sisi barat teluk, lat ~0..+5)
    strait_bay = np.exp(-((LAT - 2.0) / 3.2) ** 2) * smoothstep(-19, -14, LON) * (1 - smoothstep(-6, -2, LON)) * (d < -8)
    mare = np.maximum(mare, strait_bay)
    # pesisir Culmen / marka timur: di luar koridor, darat Rhykar berhenti di dalam pita (d ~ -3.8)
    culm_sea = (1 - corr) * smoothstep(-6.9, -3.8, d)
    TR = 1.0 - 2.3 * sea_anti - 3.0 * bay - 4.0 * mare - 3.2 * culm_sea + 1.8 * polar
    amp = 0.22 + 0.75 * np.exp(-(TR / 1.1) ** 2)
    PR = TR + 0.62 * amp * n_cont + 0.07 * n_fine

    # ================= SISI AERIS (d>0) =================
    # (1) porsi lintas-sutura superbenua: tonjolan di utara koridor
    dmax = np.interp(al, [-167, -163, -156, -148, -140, -128, -116, -104, -92, -80, -68, -60, -54, -47, -39, -33, -30],
                         [0.0, 6.0, 14.0, 1.2, 20.0, 32.0, 38.0, 43.0, 46.0, 41.0, 28.0, 9.0, 1.0, 10.0, 8.0, 3.5, 0.0])
    waist = np.exp(-((al + 148) / 5.0) ** 2) + np.exp(-((al + 54) / 5.0) ** 2)
    dmax = dmax + 2.5 * n_lo * (1 - np.clip(waist, 0, 1))
    TL = corr * (np.clip((dmax - d) / 6.0, -3, 3)) - (1 - corr) * 3.0
    PL = TL + 0.72 * n_cont + 0.10 * n_fine
    # (2) Ellumat — jantung antipode
    dA = gc_dist_deg(LAT, LON, *ANTI)
    ex, ey = azeq(LAT, LON, *ANTI)
    th = np.radians(12.0)
    exr = ex * np.cos(th) - ey * np.sin(th); eyr = ex * np.sin(th) + ey * np.cos(th)
    rE = np.sqrt((exr / 28.0) ** 2 + (eyr / 19.0) ** 2) * 23.0
    TE = (23.0 - rE) / 7.0 + 0.35 * n_lo
    PE = TE + 0.45 * n_cont + 0.08 * n_fine
    # (3) Sadumat — daratan sedang sekunder dekat Scar (~16/60)
    sx, sy = azeq(LAT, LON, 17.0, 62.0)
    th = np.radians(-22.0)
    uu = sx * np.cos(th) - sy * np.sin(th); vv = sx * np.sin(th) + sy * np.cos(th)
    lobeW = 1.0 - np.sqrt(((uu + 8.0) / 13.0) ** 2 + ((vv + 1.5) / 10.5) ** 2)
    lobeE = 1.0 - np.sqrt(((uu - 9.0) / 12.5) ** 2 + ((vv - 2.0) / 11.0) ** 2)
    TS = np.maximum(lobeW, lobeE) - 3.0 * (1 - smoothstep(5.0, 8.0, d))
    PS = TS + 0.78 * n_cont + 0.30 * n_lo + 0.12 * n_fine
    # (4) Kepulauan koridor angin (Nagu): koridor Puncak + rantai timur ke Ellumat + rantai kantong stabil bahu timur
    c1 = np.interp(LON, [-48, -30, -10, 10, 30, 42], [22, 25, 28.5, 30, 28, 30])
    dens1 = np.exp(-((LAT - c1) / 6.5) ** 2) * smoothstep(-52, -40, LON) * (1 - smoothstep(34, 46, LON))
    c2 = np.interp(LON, [78, 95, 110, 125, 140, 150], [31, 33, 35, 37, 38, 40])
    dens2 = 0.85 * np.exp(-((LAT - c2) / 5.5) ** 2) * smoothstep(72, 84, LON) * (1 - smoothstep(144, 152, LON))
    # rantai kantong stabil (bahu timur Culmen, alpha 15..25): pulau kecil di pita, tidak menyentuh kurva
    chain = np.exp(-((al - 19.0) / 4.5) ** 2) * np.exp(-(d / 9.0) ** 2) * smoothstep(1.4, 2.4, np.abs(d))
    # sebaran pulau acak ringan di Aeris (bukan taburan merata: bobot kecil)
    dens3 = 0.10 * smoothstep(0, 12, d) * (1 - smoothstep(70, 80, LAT))
    dens = np.maximum.reduce([dens1, dens2, 1.25 * chain, dens3])
    clu = smoothstep(-0.6, 0.9, n_clu)
    dens = dens * (0.35 + 0.65 * clu)
    PI = dens * 2.4 + 0.80 * n_isl - 1.25 + 0.15 * n_cont

    # lebar las (di dalam koridor) & selat Palung (di luar koridor): tepi tak beraturan + meruncing di ujung koridor,
    # supaya tidak ada garis pantai lurus buatan. Kurva di koridor tetap darat (min 0,25°), di luar tetap laut (min 0,3°).
    rag = 0.6 * n_fine + 0.4 * n_isl
    tE = np.sqrt(np.clip((CORR_A1 - al) / 3.0, 0, 1)); tW = np.sqrt(np.clip((al - CORR_A0) / 3.0, 0, 1))
    weld_w = np.maximum(np.clip(1.50 + 0.45 * rag, 0.7, 2.3) * np.minimum(tE, tW), 0.25)
    so = np.minimum((al - CORR_A1) % 360.0, (CORR_A0 - al) % 360.0)
    strait_w = np.maximum(np.clip(1.25 + 0.35 * rag, 0.8, 1.8) * np.sqrt(np.clip(so / 3.0, 0, 1)), 0.3)
    return dict(_stats=rec_stats, LAT=LAT, LON=LON, w=w, d=d, al=al, PR=PR, PL=PL, PE=PE, PS=PS, PI=PI, weld_w=weld_w, strait_w=strait_w,
                corr=corr, corr_hard=corr_hard, bay=bay, mare=mare, polar=polar, sea_anti=sea_anti,
                dA=dA, n_cont=n_cont, n_lo=n_lo, n_fine=n_fine, n_isl=n_isl)

TARGET = dict(R=0.23, A=0.15, lobe=0.076, ell=0.035, sad=0.023)

def landmask(F, verbose=True, th=None):
    """th=None: kalibrasi ambang dari target luas (grid global). th=dict: pakai ambang global (jendela)."""
    w, d, al, LAT = F['w'], F['d'], F['al'], F['LAT']
    rR = d < 0; rA = ~rR
    TH = {} if th is None else th
    def q(name, P, region, target):
        if th is None:
            TH[name] = wquant_thresh(P, w, region, target)
        return TH[name]
    # sisi Rhykar: kalibrasi 23%
    tR = q('R', F['PR'], rR, TARGET['R'])
    landR = rR & (F['PR'] > tR)
    # sisi Aeris, per komponen
    regL = rA & (F['corr'] > 0.02) & (d < 62)
    tL = q('L', F['PL'], regL, TARGET['lobe']); lob = regL & (F['PL'] > tL)
    regE = rA & (F['dA'] < 34)
    tE = q('E', F['PE'], regE, TARGET['ell']); ell = regE & (F['PE'] > tE)
    regS = rA & (np.abs(lon_diff(F['LON'], 62)) < 40) & (LAT > -12) & (LAT < 45) & (d > 1.5)
    tS = q('S', F['PS'], regS, TARGET['sad']); sad = regS & (F['PS'] > tS)
    weldA = F['corr_hard'] & (np.abs(d) < F['weld_w']) & rA
    base = lob | ell | sad | weldA
    regI = rA & ~base & (LAT < 76)
    if th is None:
        rest = TARGET['A'] - w[base].sum()
    tI = q('I', F['PI'], regI, rest if th is None else None); isl = regI & (F['PI'] > tI)
    land = landR | base | isl
    # --- constraint keras koridor tunggal ---
    strait = (~F['corr_hard']) & (np.abs(d) < F['strait_w'])   # di luar koridor: kurva = laut (Palung Sutura)
    weld = F['corr_hard'] & (np.abs(d) < F['weld_w'])          # di dalam koridor: kurva = darat kontinu
    land = (land & ~strait) | weld
    comp = dict(landR=landR & ~strait | (weld & rR), lobe=lob, ell=ell, sad=sad, isl=isl)
    F['_th'] = TH
    return land, comp

def report(F, land, comp=None):
    w, d, al = F['w'], F['d'], F['al']
    R = w[land & (d < 0)].sum(); A = w[land & (d >= 0)].sum()
    band = np.abs(d) <= 6.5
    s = dict(R=R, A=A, water=1 - R - A, overlay=w[land & band].sum(),
             hemR=w[d < 0].sum(), hemA=w[d >= 0].sum())
    if comp:
        for k2, m in comp.items():
            s[k2] = w[m & land].sum()
    # koridor: run darat sepanjang garis kurva (|d|<0.3)
    alpha = np.linspace(-180, 180, 7201)
    la, lo = curve_point(alpha)
    H, W = land.shape
    i = np.clip(((90 - la) / 180 * H).astype(int), 0, H - 1); j = np.clip(((lo + 180) / 360 * W).astype(int), 0, W - 1)
    onl = land[i, j]
    # run di sirkular
    runs = []; n = len(onl); start = None
    idx0 = np.argmin(onl) if not onl.all() else 0
    seq = np.roll(onl, -idx0); lon_seq = np.roll(lo, -idx0); al_seq = np.roll(alpha, -idx0)
    for k3 in range(n):
        if seq[k3] and start is None: start = k3
        if (not seq[k3] or k3 == n - 1) and start is not None:
            e = k3 - 1 if not seq[k3] else k3
            runs.append((round(float(al_seq[start]), 1), round(float(al_seq[e]), 1), round(float(lon_seq[start]), 1), round(float(lon_seq[e]), 1), e - start + 1))
            start = None
    s['curve_runs'] = [r for r in runs if r[4] > 3]
    return s
