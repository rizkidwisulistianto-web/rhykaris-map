"""Rhykaris Master Map — renderer atlas fisik (hillshade + palet kanon Planetary Form §9)."""
import numpy as np, sys, time
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi
sys.path.insert(0, '/home/claude/rhykaris_map')
from geo import *
from noise import make_perm, fbm

def hexc(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0

def mix(a, b, t):
    t = np.asarray(t, np.float32)[..., None] if np.ndim(t) else t
    return a * (1 - t) + b * t

def ramp(x, stops):
    """stops: list (nilai, warna_hex) terurut -> warna per piksel (interpolasi linear)."""
    vals = np.array([s[0] for s in stops], np.float32)
    cols = np.stack([hexc(s[1]) for s in stops])
    out = np.empty(x.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(x, vals, cols[:, c])
    return out

def hillshade(elev, LAT, W, H, az=315.0, alt=42.0, zf=1.0):
    px_km = 2 * np.pi * R_KM / W
    e = elev / 1000.0 * zf
    gy, gx = np.gradient(e)
    coslat = np.cos(np.radians(LAT)).clip(0.05, 1)
    dzdx = gx / (px_km * coslat); dzdy = -gy / px_km
    slope = np.arctan(np.hypot(dzdx, dzdy) * zf * 95.0)
    aspect = np.arctan2(dzdy, -dzdx)
    azr = np.radians(360 - az + 90); altr = np.radians(alt)
    sh = np.sin(altr) * np.cos(slope) + np.cos(altr) * np.sin(slope) * np.cos(azr - aspect)
    return np.clip(sh, 0, 1)

def render(T, W, H, out_path, rivers=True, verbose=True):
    t0 = time.time()
    LAT, LON = grid(W, H)
    elev = T['elev']; land = T['land'].astype(bool); pr = T['pr']; temp = T['temp']; d = T['d']
    sea = ~land
    X, Y, Z = [v.ravel().astype(np.float64) for v in unit(LAT, LON)]
    perm = make_perm(4711)
    nz = lambda f, o, oc=4: fbm(X, Y, Z, perm, f, oc, 2.0, 0.5, o, -o, o * 0.5).reshape(H, W)
    grain = nz(60.0, 3.0, 3); tex = nz(14.0, 9.0, 4); tex2 = nz(28.0, 1.7, 3)

    # ---------------- LAUT ----------------
    dep = -np.minimum(elev, 0)
    ocean = ramp(dep, [(0, '#4f9aa6'), (40, '#428ca0'), (160, '#2f7390'), (600, '#1f5877'), (1800, '#184868'),
                       (3500, '#143f5d'), (4800, '#113651'), (6500, '#0c2944'), (10000, '#081d33')])
    bayt = smoothstep(0.15, 0.7, T['bay']) * smoothstep(-0.5, -5.5, d) * sea
    bayt = ndi.gaussian_filter(bayt.astype(np.float32), 2.0 * W / 2048)
    ocean = mix(ocean, hexc('#579a98'), 0.26 * bayt)                                            # teluk dangkal kehijauan
    ocean = mix(ocean, hexc('#2c6f84'), 0.18 * T['bank'])                                         # bank Tehari (halus)
    rcap = (d < 0) & sea
    ocean = np.where(rcap[..., None], ocean * np.array([0.90, 0.92, 0.95], np.float32), ocean)  # laut sisi Rhykar lebih kelabu
    ocean *= (1.0 + 0.035 * tex)[..., None]
    ice_edge = 77.5 + 2.2 * nz(3.0, 5.0, 4) + 1.2 * tex
    ice = smoothstep(ice_edge - 1.2, ice_edge + 1.0, LAT) * sea
    icecol = mix(hexc('#d9e5ec'), hexc('#f3f7f9'), np.clip(0.5 + 0.9 * tex2, 0, 1))
    icecol = icecol - (np.abs(tex2) < 0.035)[..., None] * 0.12
    ocean = mix(ocean, icecol, ice)

    # ---------------- DARAT ----------------
    e = np.maximum(elev, 0)
    rR = d < 0
    # Rhykar (PF §9: abu / merah-besi / hitam): gurun besi -> stepa oker-kelabu -> sabuk moderat -> hutan konifer
    colR = ramp(pr, [(0.02, '#6f4336'), (0.14, '#86503d'), (0.26, '#9a6a52'), (0.38, '#9c8566'),
                     (0.52, '#8c8763'), (0.68, '#7a805a'), (0.85, '#5e6844'), (1.2, '#4b5538')])
    dune = np.clip(tex, 0, 1) * (pr < 0.3)
    colR = mix(colR, hexc('#b08058'), 0.30 * dune)
    colR = mix(colR, hexc('#3f3533'), 0.35 * np.clip(-tex2 - 0.15, 0, 1) * (pr < 0.4))           # singkapan basal gelap
    colR = mix(colR, hexc('#5e4f4b'), 0.50 * T['alt'])                                               # Altiplano basal
    polc = mix(hexc('#5f5a5f'), hexc('#a9a7b0'), np.clip(0.45 + 0.9 * tex, 0, 1))
    polc = mix(polc, hexc('#7a5850'), 0.30 * np.clip(0.6 - tex2 * 2, 0, 1))                         # batu besi beku
    polc = mix(polc, hexc('#d8dbe2'), 0.35 * np.clip(tex2 * 3 - 0.6, 0, 1))                         # bercak embun beku
    colR = mix(colR, polc, np.clip(T['pol'] * 1.15, 0, 1))
    # Aeris (PF §9: biru samudra + krem/hijau): hutan subur, megaflora zamrud, dataran tinggi krem
    colA = ramp(pr, [(0.2, '#8a9366'), (0.6, '#62905a'), (1.0, '#4d8654'), (1.3, '#367148'), (1.6, '#285f3d')])
    colA = mix(colA, hexc('#b9b88c'), 0.55 * T['F_ellhi'] * np.clip(e / 1800.0, 0, 1))
    colA = mix(colA, hexc('#93a474'), np.clip((e - 1200) / 2000.0, 0, 1) * 0.65)
    col = np.where(rR[..., None], colR, colA)
    # dataran rendah sedikit lebih gelap, dataran tinggi lebih terang (hipsometri halus)
    col *= (0.92 + 0.10 * np.clip(e / 2500.0, 0, 1))[..., None]
    rock = mix(hexc('#5a504c'), hexc('#7a736c'), np.clip(0.5 + tex2, 0, 1))
    col = mix(col, rock, np.clip((e - 2400) / 2200.0, 0, 1) * 0.85)
    snowline = 4300 + 900 * rR - 110 * np.abs(LAT) / 10
    snow = smoothstep(snowline - 200, snowline + 450, e) * np.clip(0.55 + 0.7 * tex, 0, 1)
    col = mix(col, hexc('#eef0f1'), snow)
    col *= (1.0 + 0.05 * tex + 0.03 * tex2)[..., None]

    # danau & playa (playa garam khusus Rhykar kering)
    depr = T['depr']
    lk = (((depr > 10.0) & ((pr >= 0.34) | (d >= 0))) | (depr > 70.0)) & land & (T['pol'] < 0.4)
    lab, n = ndi.label(lk)
    keep = np.zeros_like(lk)
    if n:
        sizes = ndi.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
        big = 1 + np.where(sizes >= max(8, (W / 2048) ** 2 * 10))[0]
        keep = np.isin(lab, big)
    lake = keep & ((pr >= 0.34) | (d >= 0)); playa = keep & (pr < 0.34) & (d < 0)
    col = np.where(lake[..., None], hexc('#3b7892'), col)
    pl_soft = ndi.gaussian_filter(playa.astype(np.float32), 0.8 * W / 2048)
    col = mix(col, mix(hexc('#c9b99c'), hexc('#ddd2bc'), np.clip(0.5 + tex, 0, 1)), 0.78 * np.clip(pl_soft * 1.4, 0, 1))

    # hillshade (darat tajam, laut sangat halus)
    hs = hillshade(elev * land, LAT, W, H, zf=1.0)
    hs_s = hillshade(np.where(land, 0, elev), LAT, W, H, zf=0.05)
    col *= (0.38 + 0.82 * hs)[..., None]
    ocean *= (0.90 + 0.16 * hs_s)[..., None]
    img = np.where(land[..., None], col, ocean)

    # ---------------- PITA SCAR (tint raster halus; glow vektor ada di peta interaktif) ----------------
    bandw = smoothstep(7.2, 5.8, np.abs(d))
    img = np.where(land[..., None], mix(img, hexc('#b4492c'), 0.18 * bandw), mix(img, hexc('#4a2233'), 0.14 * bandw))
    crystal = (tex2 > 0.52) & (bandw > 0.5) & land
    img = mix(img, hexc('#ff9a5a'), 0.35 * crystal)
    rift = (np.abs(d) < 0.22 * (W / 2048) ** -0.5 * 1.2) & land
    img = mix(img, hexc('#3a1010'), 0.55 * rift)

    # ---------------- GARIS PANTAI ----------------
    er = ndi.binary_erosion(land, structure=np.ones((3, 3)), border_value=1)
    edgeL = land & ~er
    di1 = ndi.binary_dilation(land, structure=np.ones((3, 3)))
    edgeS = di1 & ~land
    di2 = ndi.binary_dilation(di1, iterations=max(1, W // 2048)) & ~di1
    img = mix(img, hexc('#2a2622'), 0.55 * edgeL)
    img = mix(img, hexc('#a9d4dc'), 0.30 * edgeS * (1 - ice))
    img = mix(img, hexc('#8cc4cf'), 0.12 * di2 * (1 - ice))
    img *= (1.0 + 0.022 * grain)[..., None]
    img8 = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    im = Image.fromarray(img8, 'RGB')

    # ---------------- SUNGAI (supersample 2x -> AA) ----------------
    if rivers:
        acc = T['acc']; rec = T['rec']
        thr = np.percentile(acc[land], 98.6)
        riv = (acc > thr) & land & (T['depr'] < 1.0)
        ii, jj = np.nonzero(riv)
        ss = 2
        lay = Image.new('L', (W * ss, H * ss), 0); dr = ImageDraw.Draw(lay)
        recf = rec.ravel()
        for i, j in zip(ii, jj):
            k = i * W + j; r = recf[k]
            if r < 0: continue
            ri, rj = divmod(int(r), W)
            if abs(rj - j) > 2: continue
            a = acc[i, j] / thr
            wpx = (0.35 + 1.05 * np.log10(a)) * (W / 2048) * ss * 0.85
            wpx = max(1, int(round(wpx)))
            dr.line([(j * ss + ss / 2, i * ss + ss / 2), (rj * ss + ss / 2, ri * ss + ss / 2)], fill=255, width=wpx)
        lay = lay.resize((W, H), Image.LANCZOS)
        m = np.asarray(lay, np.float32) / 255.0 * land
        rc = np.where(rR[..., None], hexc('#3f7d9c'), hexc('#3c7fa3'))
        arr = np.asarray(im, np.float32) / 255.0
        arr = mix(arr, rc, 0.80 * np.clip(m * 1.15, 0, 1))
        im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGB')
    im.save(out_path, quality=90)
    if verbose: print(f'render {W}x{H} -> {out_path} [{time.time()-t0:.1f}s]')
    return im

if __name__ == '__main__':
    W, H = int(sys.argv[1]), int(sys.argv[2])
    Z = dict(np.load(f'/home/claude/rhykaris_map/terrain_{W}.npz'))
    LAT, LON = grid(W, H)
    Z['F_ellhi'] = np.exp(-(gc_dist_deg(LAT, LON, 55.5, 180.0) / 10.0) ** 2).astype(np.float32)
    render(Z, W, H, sys.argv[3])
