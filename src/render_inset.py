"""Inset detail resolusi tinggi untuk wilayah inti (Sinus Adventus – Interregna – Foedera).
Tidak menambah geografi baru: garis pantai, elevasi, curah hujan, sungai diambil dari grid 4096
(di-upsample), lalu dirender ulang tajam + tekstur relief sub-grid untuk hillshade."""
import numpy as np, sys, time
from scipy import ndimage as ndi
from PIL import Image, ImageDraw
sys.path.insert(0, '/home/claude/rhykaris_map')
from geo import *
from noise import make_perm, fbm, ridged
from render import hexc, mix, ramp

PPD = float(sys.argv[1]) if len(sys.argv) > 1 else 32.0
N_, S_, W_, E_ = 23.0, -32.0, -40.0, 46.0
t0 = time.time()
H = int(round((N_ - S_) * PPD)); W = int(round((E_ - W_) * PPD))
lat = N_ - (np.arange(H) + 0.5) / PPD; lon = W_ + (np.arange(W) + 0.5) / PPD
LAT, LON = np.meshgrid(lat, lon, indexing='ij')
T = dict(np.load('/home/claude/rhykaris_map/terrain_4096.npz')); W0, H0 = 4096, 2048
K = PPD / (W0 / 360.0)                      # faktor pembesaran thd grid 4096
# crop sumber + margin
m = 10
i0 = int((90 - N_) * H0 / 180) - m; i1 = int((90 - S_) * H0 / 180) + m
j0 = int((W_ + 180) * W0 / 360) - m; j1 = int((E_ + 180) * W0 / 360) + m
si = (90 - LAT) * H0 / 180 - 0.5 - i0; sj = (LON + 180) * W0 / 360 - 0.5 - j0
def crop(a): return np.asarray(a)[i0:i1, j0:j1]
def up(a, order=3): return ndi.map_coordinates(crop(a).astype(np.float32), [si, sj], order=order, mode='nearest').astype(np.float32)
land0 = T['land'].astype(bool)
# garis pantai EKSAK di resolusi tinggi: medan potensial generator dievaluasi ulang di jendela,
# dengan normalisasi noise & ambang kalibrasi global (calib_4096.json) -> identik di titik grid 4096
import json
from masks import build, landmask
CAL = json.load(open('/home/claude/rhykaris_map/calib_4096.json'))
Fh = build(0, 0, verbose=False, LL=(LAT, LON), stats={k: tuple(v) for k, v in CAL['stats'].items()})
land, _ = landmask(Fh, th=CAL['th'])
sea = ~land
# cek konsistensi di titik-titik yang berimpit dengan pusat piksel grid 4096 (sampel terdekat)
ci = np.clip(np.round(si).astype(int) + i0, 0, H0 - 1); cj = np.clip(np.round(sj).astype(int) + j0, 0, W0 - 1)
agree = float((land == land0[ci, cj]).mean())
print(f'  kesesuaian darat/laut dg grid 4096 (nearest): {agree*100:.2f}%')
e_up = up(T['elev'])
print(f'[{time.time()-t0:5.1f}s] upsample {W}x{H} (K={K:.3f})')

X, Y, Z = [v.ravel().astype(np.float64) for v in unit(LAT, LON)]
perm = make_perm(4711)
nz = lambda f, o, oc=4: fbm(X, Y, Z, perm, f, oc, 2.0, 0.5, o, -o, o * 0.5).reshape(H, W)
grain = nz(60.0, 3.0, 3); tex = nz(14.0, 9.0, 4); tex2 = nz(28.0, 1.7, 3)
permD = make_perm(9001)
n1 = fbm(X, Y, Z, permD, 120.0, 4, 2.0, 0.5, 1.3, -2.1, 0.7).reshape(H, W)
n2 = ridged(X, Y, Z, permD, 55.0, 5, 2.1, 0.55, -4.2, 1.1, 3.3).reshape(H, W)
n2 = n2 - np.float32(np.mean(n2))
print(f'[{time.time()-t0:5.1f}s] noise')

cd = up(T['cd']).clip(0)
e_land = np.maximum(e_up, 8.0)
relief = 0.25 + np.clip(e_land / 1500.0, 0, 1.6)
cdw = smoothstep(0.0, 30.0, cd)
e_land = e_land + cdw * relief * (22.0 * n1 + 55.0 * n2)
e_sea = np.minimum(e_up, -20.0)
elev = np.where(land, e_land, e_sea).astype(np.float32)
pr = up(T['pr']).clip(0); d = scar_signed(LAT, LON).astype(np.float32)
bay = Fh['bay'].astype(np.float32); bank = up(T['bank']).clip(0, 1); alt = up(T['alt']).clip(0, 1); pol = up(T['pol']).clip(0, 1)
depr = up(T['depr'], 1).clip(0)

def hillshade(el, zf=1.0, az=315.0, altd=42.0):
    px_km = (2 * np.pi * R_KM / 360.0) / PPD
    e = el / 1000.0 * zf
    gy, gx = np.gradient(e)
    coslat = np.cos(np.radians(LAT)).clip(0.05, 1)
    dzdx = gx / (px_km * coslat); dzdy = -gy / px_km
    slope = np.arctan(np.hypot(dzdx, dzdy) * zf * 95.0)
    aspect = np.arctan2(dzdy, -dzdx)
    azr = np.radians(360 - az + 90); altr = np.radians(altd)
    sh = np.sin(altr) * np.cos(slope) + np.cos(altr) * np.sin(slope) * np.cos(azr - aspect)
    return np.clip(sh, 0, 1)

# ---------------- LAUT ----------------
dep = -np.minimum(elev, 0)
ocean = ramp(dep, [(0, '#4f9aa6'), (40, '#428ca0'), (160, '#2f7390'), (600, '#1f5877'), (1800, '#184868'),
                   (3500, '#143f5d'), (4800, '#113651'), (6500, '#0c2944'), (10000, '#081d33')])
bayt = smoothstep(0.15, 0.7, bay) * smoothstep(-0.5, -5.5, d) * sea
bayt = ndi.gaussian_filter(bayt.astype(np.float32), 2.0 * 2 * K)
ocean = mix(ocean, hexc('#579a98'), 0.26 * bayt)
ocean = mix(ocean, hexc('#2c6f84'), 0.18 * bank)
rcap = (d < 0) & sea
ocean = np.where(rcap[..., None], ocean * np.array([0.90, 0.92, 0.95], np.float32), ocean)
ocean *= (1.0 + 0.035 * tex)[..., None]

# ---------------- DARAT ----------------
e = np.maximum(elev, 0); rR = d < 0
colR = ramp(pr, [(0.02, '#6f4336'), (0.14, '#86503d'), (0.26, '#9a6a52'), (0.38, '#9c8566'),
                 (0.52, '#8c8763'), (0.68, '#7a805a'), (0.85, '#5e6844'), (1.2, '#4b5538')])
dune = np.clip(tex, 0, 1) * (pr < 0.3)
colR = mix(colR, hexc('#b08058'), 0.30 * dune)
colR = mix(colR, hexc('#3f3533'), 0.35 * np.clip(-tex2 - 0.15, 0, 1) * (pr < 0.4))
colR = mix(colR, hexc('#5e4f4b'), 0.50 * alt)
polc = mix(hexc('#5f5a5f'), hexc('#a9a7b0'), np.clip(0.45 + 0.9 * tex, 0, 1))
polc = mix(polc, hexc('#7a5850'), 0.30 * np.clip(0.6 - tex2 * 2, 0, 1))
polc = mix(polc, hexc('#d8dbe2'), 0.35 * np.clip(tex2 * 3 - 0.6, 0, 1))
colR = mix(colR, polc, np.clip(pol * 1.15, 0, 1))
colA = ramp(pr, [(0.2, '#8a9366'), (0.6, '#62905a'), (1.0, '#4d8654'), (1.3, '#367148'), (1.6, '#285f3d')])
colA = mix(colA, hexc('#93a474'), np.clip((e - 1200) / 2000.0, 0, 1) * 0.65)
col = np.where(rR[..., None], colR, colA)
col *= (0.92 + 0.10 * np.clip(e / 2500.0, 0, 1))[..., None]
rock = mix(hexc('#5a504c'), hexc('#7a736c'), np.clip(0.5 + tex2, 0, 1))
col = mix(col, rock, np.clip((e - 2400) / 2200.0, 0, 1) * 0.85)
snowline = 4300 + 900 * rR - 110 * np.abs(LAT) / 10
snow = smoothstep(snowline - 200, snowline + 450, e) * np.clip(0.55 + 0.7 * tex, 0, 1)
col = mix(col, hexc('#eef0f1'), snow)
col *= (1.0 + 0.05 * tex + 0.03 * tex2)[..., None]
lk = (((depr > 10.0) & ((pr >= 0.34) | (d >= 0))) | (depr > 70.0)) & land & (pol < 0.4)
lab, n = ndi.label(lk)
keep = np.zeros_like(lk)
if n:
    sizes = ndi.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
    big = 1 + np.where(sizes >= 40 * K * K)[0]
    keep = np.isin(lab, big)
lake = keep & ((pr >= 0.34) | (d >= 0)); playa = keep & (pr < 0.34) & (d < 0)
col = np.where(lake[..., None], hexc('#3b7892'), col)
pl_soft = ndi.gaussian_filter(playa.astype(np.float32), 0.8 * 2 * K)
col = mix(col, mix(hexc('#c9b99c'), hexc('#ddd2bc'), np.clip(0.5 + tex, 0, 1)), 0.78 * np.clip(pl_soft * 1.4, 0, 1))
hs = hillshade(elev * land, 1.0)
hs_s = hillshade(np.where(land, 0, elev), 0.05)
col *= (0.38 + 0.82 * hs)[..., None]
ocean *= (0.90 + 0.16 * hs_s)[..., None]
img = np.where(land[..., None], col, ocean)
print(f'[{time.time()-t0:5.1f}s] colours')

# ---------------- PITA SCAR ----------------
bandw = smoothstep(7.2, 5.8, np.abs(d))
img = np.where(land[..., None], mix(img, hexc('#b4492c'), 0.18 * bandw), mix(img, hexc('#4a2233'), 0.14 * bandw))
crystal = (tex2 > 0.52) & (bandw > 0.5) & land
img = mix(img, hexc('#ff9a5a'), 0.35 * crystal)
rift = (np.abs(d) < 0.12) & land
img = mix(img, hexc('#3a1010'), 0.55 * rift)

# ---------------- GARIS PANTAI ----------------
st = np.ones((3, 3))
er = ndi.binary_erosion(land, structure=st, iterations=2, border_value=1)
edgeL = land & ~er
di1 = ndi.binary_dilation(land, structure=st, iterations=2)
edgeS = di1 & ~land
di2 = ndi.binary_dilation(di1, iterations=int(round(2 * K))) & ~di1
img = mix(img, hexc('#2a2622'), 0.50 * edgeL)
img = mix(img, hexc('#a9d4dc'), 0.28 * edgeS)
img = mix(img, hexc('#8cc4cf'), 0.10 * di2)
img *= (1.0 + 0.022 * grain)[..., None]

# ---------------- SUNGAI (rantai D8 dari grid 4096, dihaluskan Chaikin) ----------------
acc = T['acc']; rec = T['rec'].ravel(); depr0 = T['depr']
thr = np.percentile(acc[land0], 98.6)
riv = (acc > thr) & land0 & (depr0 < 1.0)
win = np.zeros_like(riv); win[i0:i1, j0:j1] = True
riv &= win
rivf = riv.ravel(); accf = acc.ravel()
idx = np.nonzero(rivf)[0]
indeg = np.zeros(rivf.size, np.int32)
for k in idx:
    r = rec[k]
    if r >= 0 and rivf[r]: indeg[r] += 1
def xy(k):
    i, j = divmod(int(k), W0)
    la = 90 - (i + 0.5) * 180 / H0; lo = -180 + (j + 0.5) * 360 / W0
    return ((lo - W_) * PPD, (N_ - la) * PPD)
visited = np.zeros(rivf.size, bool)
chains = []
for s in idx[indeg[idx] == 0]:
    path = [s]; k = s; visited[k] = True
    while True:
        r = rec[k]
        if r < 0: break
        ri, rj = divmod(int(r), W0); ki, kj = divmod(int(k), W0)
        if abs(rj - kj) > 2: break
        path.append(r)
        if not rivf[r] or visited[r]: break
        visited[r] = True; k = r
    if len(path) >= 2: chains.append(path)
def chaikin(P, it=2):
    P = np.asarray(P, float)
    for _ in range(it):
        if len(P) < 3: return P
        Q = [P[0]]
        for a, b in zip(P[:-1], P[1:]):
            Q.append(0.75 * a + 0.25 * b); Q.append(0.25 * a + 0.75 * b)
        Q.append(P[-1]); P = np.array(Q)
    return P
ss = 2
lay = Image.new('L', (W * ss, H * ss), 0); dr = ImageDraw.Draw(lay)
for path in chains:
    P = np.array([xy(k) for k in path]) * ss
    A = np.array([accf[k] if rivf[k] else accf[path[-2]] for k in path], float)
    Ps = chaikin(P, 2)
    As = np.interp(np.linspace(0, 1, len(Ps)), np.linspace(0, 1, len(A)), A)
    for (x0, y0), (x1, y1), a in zip(Ps[:-1], Ps[1:], As[:-1]):
        wpx = (0.55 + 1.05 * np.log10(max(a / thr, 1.0))) * ss * (K / 2.8125) ** 0.5
        dr.line([(x0, y0), (x1, y1)], fill=255, width=max(1, int(round(wpx))))
        rr = wpx / 2.0
        if rr >= 1.0: dr.ellipse([x1 - rr, y1 - rr, x1 + rr, y1 + rr], fill=255)
lay = lay.resize((W, H), Image.LANCZOS)
mr = np.asarray(lay, np.float32) / 255.0 * (land & ~lake)
rc = np.where(rR[..., None], hexc('#3f7d9c'), hexc('#3c7fa3'))
img = mix(img, rc, 0.82 * np.clip(mr * 1.15, 0, 1))
print(f'[{time.time()-t0:5.1f}s] rivers ({len(chains)} chains)')

# ---------------- alpha tepi (feather) ----------------
ii = np.arange(H)[:, None]; jj = np.arange(W)[None, :]
dist = np.minimum(np.minimum(ii, H - 1 - ii), np.minimum(jj, W - 1 - jj)).astype(np.float32)
alpha = smoothstep(0.0, 1.6 * PPD, dist)
rgba = np.dstack([np.clip(img, 0, 1), alpha[..., None]])
im = Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA')
im.save('/home/claude/rhykaris_map/inset_%d.png' % int(PPD))
for q in (78, 84):
    im.save('/home/claude/rhykaris_map/inset_%d_q%d.webp' % (int(PPD), q), quality=q, alpha_quality=80, method=6)
print(f'[{time.time()-t0:5.1f}s] saved {W}x{H}')
