"""Grid data readout (1024x512 RGB PNG): R = kode elevasi, G = kode bioma. Dibaca oleh peta (kanvas) untuk readout medan.
R: laut  code<100 -> kedalaman = -code*101 m ; darat code>=100 -> elevasi = (code-100)*60 m
G: 0 samudra dalam, 1 paparan, 2 teluk dangkal, 3 laut-es, 4 Palung Sutura,
   10 gurun besi, 11 semi-gurun, 12 stepa oker, 13 sabuk moderat, 14 hutan konifer Rhykar, 15 Altiplano basal,
   16 gurun kutub beku, 17 pegunungan tinggi Rhykar, 18 playa garam, 19 danau,
   20 hutan hujan/megaflora Aëris, 21 hutan Aëris, 22 hutan terbuka Aëris, 23 dataran tinggi Aëris, 24 alpin & salju Aëris, 25 tundra Aëris,
   26 hutan lembap Rhykar (hangat, basah)"""
import numpy as np, sys
from scipy import ndimage as ndi
from PIL import Image
sys.path.insert(0, '/home/claude/rhykaris_map')
from geo import *
from noise import make_perm, fbm
T = np.load('/home/claude/rhykaris_map/terrain_4096.npz')
W, H = 4096, 2048
LAT, LON = grid(W, H)
elev = T['elev']; land = T['land'].astype(bool); pr = T['pr']; temp = T['temp']; d = T['d']; depr = T['depr']; pol = T['pol']; alt = T['alt']
bay = T['bay']; trench = T['trench']
# es laut: tepi sama dengan render (77.5 + noise)
X, Y, Z = [v.ravel().astype(np.float64) for v in unit(LAT, LON)]
perm = make_perm(4711)
nz = lambda f, o, oc=4: fbm(X, Y, Z, perm, f, oc, 2.0, 0.5, o, -o, o * 0.5).reshape(H, W)
tex = nz(14.0, 9.0, 4)
ice = (LAT > 77.5 + 2.2 * nz(3.0, 5.0, 4) + 1.2 * tex) & ~land
# danau & playa (logika render)
lk = (((depr > 10.0) & ((pr >= 0.34) | (d >= 0))) | (depr > 70.0)) & land & (pol < 0.4)
lab, n = ndi.label(lk); keep = np.zeros_like(lk)
if n:
    sizes = ndi.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
    keep = np.isin(lab, 1 + np.where(sizes >= 40)[0])
lake = keep & ((pr >= 0.34) | (d >= 0)); playa = keep & (pr < 0.34) & (d < 0)
rR = d < 0; e = np.maximum(elev, 0)
B = np.zeros((H, W), np.uint8)
dep = -np.minimum(elev, 0)
B[~land] = 0
B[~land & (dep < 200)] = 1
B[~land & (bay > 0.5) & (d < -0.5)] = 2
B[~land & (trench > 0.5)] = 4
B[ice] = 3
L_R = land & rR
cls = np.select([pr < 0.14, pr < 0.26, pr < 0.45, pr < 0.80, temp >= 15.0], [10, 11, 12, 13, 26], 14)
B[L_R] = cls[L_R]
B[L_R & (alt > 0.5)] = 15
B[L_R & (e > 3000)] = 17
B[L_R & (pol > 0.5)] = 16
L_A = land & ~rR
clsA = np.select([pr >= 1.30, pr >= 0.80], [20, 21], 22)
B[L_A] = clsA[L_A]
B[L_A & (e > 1500)] = 23
B[L_A & (LAT > 64)] = 25
B[L_A & (e > 3500)] = 24
B[playa] = 18; B[lake] = 19
R = np.where(land, 100 + np.clip(np.round(e / 60.0), 0, 155), np.clip(np.round(dep / 101.0), 0, 99)).astype(np.uint8)
# sampel pusat blok 4x4 (bukan rata-rata: kode kategori tidak boleh dicampur)
Rs = R[2::4, 2::4]; Bs = B[2::4, 2::4]
img = np.dstack([Rs, Bs, np.zeros_like(Rs)])
Image.fromarray(img, 'RGB').save('/home/claude/rhykaris_map/datagrid.png', optimize=True)
u, c = np.unique(Bs, return_counts=True); print(dict(zip(u.tolist(), c.tolist())))
import os; print('datagrid.png', os.path.getsize('/home/claude/rhykaris_map/datagrid.png') // 1024, 'KB')
