"""Stage 2b — relief assets for the 3D globe (epistemic status: Turunan).

Builds NEW files in assets/3d/ next to the canon v4 layer (nothing in assets/*.png|webp|svg or data/ is touched):

  height_<W>.png     land heights, 16-bit split into two 8-bit channels of a lossless PNG: R = high byte, G = low byte
                     (value = (R*256 + G) / 65535 * hmax_m). Sea is 0 (displacement is land-only; the sea stays flat).
  slope.webp         surface gradient for per-pixel lighting (lossless WebP, so R and G are never chroma-blurred). R = d(h)/d(east),
                     G = d(h)/d(north), dimensionless (km per km on the sphere), square-root encoded for fine precision near zero:
                     b = 127 + 127 * sign(v) * sqrt(|v|), v = clip(s / smax, -1, 1)   (127 = flat, exactly; decode s = smax * sign(x) * x^2).
                     Sea carries a gentle bathymetric slope (x SEA_GAIN) so the ocean floor is hinted, not shown.
  albedo_q84.webp    the v4 palette WITHOUT baked hillshade (render.py --albedo); lighting is dynamic in 3D.
  relief.json        manifest: sizes, constants, provenance, verification result.

Pipeline source: terrain.py (seed 1647) -> terrain_4096.npz in $RHYKARIS_WORK (default <repo>/work, git-ignored).
Reproduction check (mandatory): the regenerated elevation, quantised to the datagrid scheme, must match assets/datagrid.png
(R channel) within +-1 code on >= 99.5 % of pixels. If it does NOT, the regenerated heights are NOT used and the fallback is built
from datagrid.png itself (bicubic upsampling + light smoothing to remove the stair-steps), labelled "Turunan (diinterpolasi)".

    python src/terrain.py 4096 2048              # once, ~2 min, writes work/terrain_4096.npz
    python src/make_relief.py                    # writes assets/3d/*
    python src/make_relief.py --force-fallback   # build the interpolated fallback instead (for testing)
"""
import argparse, hashlib, json, os, sys, time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import work, ASSETS, ROOT
from geo import grid, gc_dist_deg, R_KM

OUT = os.path.join(ASSETS, '3d')
HMAX_M = 8192.0          # 65535 steps over 0..8192 m  ->  0.125 m per step (tallest regenerated land point is ~7.4 km)
SEA_GAIN = 0.3           # ocean-floor slope gain (the 2D map's sea hillshade is also deliberately gentle)
W, H = 4096, 2048
PASS_FRACTION = 0.995


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def datagrid_r():
    return np.asarray(Image.open(os.path.join(ASSETS, 'datagrid.png')).convert('RGB'))[..., 0]


def quantise_like_datagrid(elev, land):
    """Same scheme as make_datagrid.py: land code = 100 + round(e/60) (0..155), sea code = round(depth/101) (0..99); centre sample of each 4x4 block."""
    e = np.maximum(elev, 0); dep = -np.minimum(elev, 0)
    R = np.where(land, 100 + np.clip(np.round(e / 60.0), 0, 155), np.clip(np.round(dep / 101.0), 0, 99)).astype(np.uint8)
    return R[2::4, 2::4]


def verify(elev, land):
    Rs, Rg = quantise_like_datagrid(elev, land), datagrid_r()
    if Rs.shape != Rg.shape:
        return dict(ok=False, reason='shape mismatch', exact=0.0, within1=0.0, max_diff=None)
    d = np.abs(Rs.astype(int) - Rg.astype(int))
    within1 = float((d <= 1).mean())
    return dict(ok=within1 >= PASS_FRACTION, exact=float((d == 0).mean()), within1=within1, max_diff=int(d.max()), threshold=PASS_FRACTION)


def fallback_from_datagrid():
    """Interpolated heights built from the canon datagrid only: bicubic x4, then a light gaussian to remove the 60 m stair-steps."""
    g = datagrid_r().astype(np.float32)
    elev = np.where(g >= 100, (g - 100) * 60.0, -g * 101.0)
    up = ndi.zoom(elev, 4, order=3, mode='grid-wrap', grid_mode=True)[:H, :W]
    up = ndi.gaussian_filter(up, 2.0, mode=('nearest', 'wrap'))
    land = ndi.zoom((g >= 100).astype(np.float32), 4, order=1, mode='grid-wrap', grid_mode=True)[:H, :W] > 0.5
    return up.astype(np.float32), land


def slope_maps(elev, land):
    """Gradient of the surface as dimensionless slopes, east and north, on the equirectangular grid (same geometry as render.hillshade)."""
    LAT, _ = grid(W, H)
    px_km = 2 * np.pi * R_KM / W
    h = np.where(land, np.maximum(elev, 0), elev * SEA_GAIN) / 1000.0          # km; ocean floor at a gentle gain
    gy = np.gradient(h, axis=0)
    gx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / 2.0                  # wraps across the antimeridian (no seam in the slope map)
    coslat = np.cos(np.radians(LAT)).clip(0.05, 1)
    return gx / (px_km * coslat), -gy / px_km                                    # east, north (rows run south)


def build_albedo(Z):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import render
    LAT, LON = grid(W, H)
    Z = dict(Z); Z['F_ellhi'] = np.exp(-(gc_dist_deg(LAT, LON, 55.5, 180.0) / 10.0) ** 2).astype(np.float32)
    path = work('albedo_4096.png')
    render.render(Z, W, H, path, shade=False)
    return Image.open(path).convert('RGB')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--force-fallback', action='store_true', help='build the interpolated fallback even if the regeneration verifies')
    ap.add_argument('--height-size', type=int, default=4096, choices=(2048, 4096), help='width of the packed height PNG (default 4096)')
    ap.add_argument('--out', default=OUT)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    Z = dict(np.load(work('terrain_4096.npz')))
    elev, land = Z['elev'].astype(np.float32), Z['land'].astype(bool)
    v = verify(elev, land)
    print(f"[{time.time() - t0:5.1f}s] reproduction vs datagrid.png: exact {v['exact'] * 100:.4f} %  within +-1 code {v['within1'] * 100:.4f} %  max diff {v['max_diff']}  -> {'OK' if v['ok'] else 'MISMATCH'}")
    source = 'terrain.py regenerated (seed 1647), verified against datagrid.png'
    label = 'Turunan'
    if a.force_fallback or not v['ok']:
        elev, land = fallback_from_datagrid()
        source = 'datagrid.png upsampled (bicubic) and lightly smoothed — regeneration did not verify' if not a.force_fallback else 'datagrid.png upsampled (bicubic) and lightly smoothed (forced fallback)'
        label = 'Turunan (diinterpolasi)'
        print('using the interpolated fallback:', source)

    # ---- height (land only), packed R/G
    hland = np.where(land, np.clip(elev, 0, HMAX_M), 0.0)
    assert hland.max() < HMAX_M, 'raise HMAX_M'
    hs = hland if a.height_size == W else hland.reshape(H // 2, 2, W // 2, 2).mean(axis=(1, 3))
    u16 = np.clip(np.round(hs / HMAX_M * 65535.0), 0, 65535).astype(np.uint16)
    hh, ww = u16.shape
    packed = np.dstack([(u16 >> 8).astype(np.uint8), (u16 & 255).astype(np.uint8), np.zeros((hh, ww), np.uint8)])
    hname = f'height_{ww}.png'
    Image.fromarray(packed, 'RGB').save(os.path.join(a.out, hname), optimize=True, compress_level=9)
    print(f"[{time.time() - t0:5.1f}s] {hname}  {ww}x{hh}  max {hs.max():.0f} m  step {HMAX_M / 65535:.3f} m  {os.path.getsize(os.path.join(a.out, hname)) / 1e6:.2f} MB")
    back = (u16.astype(np.float64) / 65535.0) * HMAX_M
    print(f"      round-trip error: max {np.abs(back - hs).max():.3f} m (quantisation step {HMAX_M / 65535:.3f} m)")

    # ---- slope map (4096 x 2048), lossless WebP, square-root encoded
    se, sn = slope_maps(elev, land)
    smax = float(np.ceil(np.max(np.hypot(se[land], sn[land])) * 20) / 20)
    smax = max(smax, 0.1)
    def enc(s):
        v = np.clip(s / smax, -1, 1)
        return np.clip(np.round(127 + 127 * np.sign(v) * np.sqrt(np.abs(v))), 0, 254).astype(np.uint8)
    simg = np.dstack([enc(se), enc(sn), np.full((H, W), 127, np.uint8)])
    sp = os.path.join(a.out, 'slope.webp')
    Image.fromarray(simg, 'RGB').save(sp, lossless=True, quality=100, method=4, exact=True)
    dec = np.asarray(Image.open(sp).convert('RGB')).astype(np.float64)
    assert np.array_equal(dec.astype(np.uint8), simg), 'lossless WebP changed pixel values'
    x = (dec[..., :2] - 127) / 127
    back = smax * np.sign(x) * x * x
    err = np.abs(back - np.dstack([se, sn]).clip(-smax, smax))
    print(f"[{time.time() - t0:5.1f}s] slope.webp  smax {smax:.2f}  {os.path.getsize(sp) / 1e6:.2f} MB  lossless; encode error: mean {err.mean():.2e}  max {err.max():.2e}  (flat = byte 127)")

    # ---- albedo without hillshade
    alb = build_albedo(Z) if not a.force_fallback and v['ok'] else build_albedo(Z)
    ap_ = os.path.join(a.out, 'albedo_q84.webp')
    alb.save(ap_, quality=84, method=6)
    print(f"[{time.time() - t0:5.1f}s] albedo_q84.webp  {os.path.getsize(ap_) / 1e6:.2f} MB")

    files = {n: dict(bytes=os.path.getsize(os.path.join(a.out, n)), sha256=sha(os.path.join(a.out, n))) for n in sorted(os.listdir(a.out)) if n != 'relief.json'}
    man = dict(
        version=1, epi='turunan', label=label,
        note='Relief of the globe is DERIVED from the physical layer v4 (seed 1647); it is not a new canon claim. Vertical exaggeration in the viewer is for legibility and is not to scale: real relief is about +-10 km on a radius of 8,282 km (~0.1 %).',
        source=source, seed=1647, generator='src/terrain.py + src/make_relief.py',
        verification=dict(against='assets/datagrid.png (R channel)', exact=round(v['exact'], 6), within1=round(v['within1'], 6), max_diff=v['max_diff'], threshold=PASS_FRACTION, passed=bool(v['ok'])),
        height=dict(file=hname, width=int(ww), height=int(hh), packing='R = high byte, G = low byte, B = 0; value = (R*256+G)/65535*hmax_m', hmax_m=HMAX_M, step_m=round(HMAX_M / 65535, 4), land_only=True,
                    max_land_m=round(float(hs.max()), 1)),
        slope=dict(file='slope.webp', width=W, height=H, smax=smax, encoding='sqrt: b = 127 + 127*sign(v)*sqrt(|v|), v = clip(s/smax,-1,1); R = d(h)/d(east), G = d(h)/d(north)', sea_gain=SEA_GAIN, lossless=True),
        albedo=dict(file='albedo_q84.webp', width=W, height=H, note='v4 palette without baked hillshade'),
        radius_km=R_KM, files=files)
    with open(os.path.join(a.out, 'relief.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(man, f, indent=1, ensure_ascii=False); f.write('\n')
    tot = sum(f['bytes'] for f in files.values())
    print(f"[{time.time() - t0:5.1f}s] done -> {a.out}  total {tot / 1e6:.2f} MB  label: {label}")


if __name__ == '__main__':
    main()
