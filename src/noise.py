"""Rhykaris Master Map — noise 3D di permukaan bola (Perlin improved + fBm + ridged), numba."""
import numpy as np
from numba import njit, prange

def make_perm(seed):
    rng = np.random.default_rng(seed)
    p = np.arange(256, dtype=np.int32)
    rng.shuffle(p)
    return np.concatenate([p, p]).astype(np.int32)

@njit(cache=True, fastmath=True, inline='always')
def _fade(t):
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)

@njit(cache=True, fastmath=True, inline='always')
def _lerp(t, a, b):
    return a + t * (b - a)

@njit(cache=True, fastmath=True, inline='always')
def _grad(h, x, y, z):
    h = h & 15
    u = x if h < 8 else y
    if h < 4:
        v = y
    elif h == 12 or h == 14:
        v = x
    else:
        v = z
    r = u if (h & 1) == 0 else -u
    r += v if (h & 2) == 0 else -v
    return r

@njit(cache=True, fastmath=True)
def perlin3(x, y, z, perm):
    fx = np.floor(x); fy = np.floor(y); fz = np.floor(z)
    X = int(fx) & 255; Y = int(fy) & 255; Z = int(fz) & 255
    x -= fx; y -= fy; z -= fz
    u = _fade(x); v = _fade(y); w = _fade(z)
    A = perm[X] + Y; AA = perm[A] + Z; AB = perm[A + 1] + Z
    B = perm[X + 1] + Y; BA = perm[B] + Z; BB = perm[B + 1] + Z
    return _lerp(w,
        _lerp(v, _lerp(u, _grad(perm[AA], x, y, z), _grad(perm[BA], x - 1, y, z)),
                 _lerp(u, _grad(perm[AB], x, y - 1, z), _grad(perm[BB], x - 1, y - 1, z))),
        _lerp(v, _lerp(u, _grad(perm[AA + 1], x, y, z - 1), _grad(perm[BA + 1], x - 1, y, z - 1)),
                 _lerp(u, _grad(perm[AB + 1], x, y - 1, z - 1), _grad(perm[BB + 1], x - 1, y - 1, z - 1))))

@njit(cache=True, fastmath=True, parallel=True)
def fbm(px, py, pz, perm, freq, octaves, lac, gain, ox, oy, oz):
    n = px.size
    out = np.empty(n, dtype=np.float32)
    for i in prange(n):
        s = 0.0; a = 1.0; f = freq; norm = 0.0
        for o in range(octaves):
            s += a * perlin3(px[i] * f + ox + o * 17.13, py[i] * f + oy - o * 7.31, pz[i] * f + oz + o * 3.77, perm)
            norm += a; a *= gain; f *= lac
        out[i] = s / norm
    return out

@njit(cache=True, fastmath=True, parallel=True)
def ridged(px, py, pz, perm, freq, octaves, lac, gain, ox, oy, oz):
    n = px.size
    out = np.empty(n, dtype=np.float32)
    for i in prange(n):
        s = 0.0; a = 1.0; f = freq; norm = 0.0; prev = 1.0
        for o in range(octaves):
            v = perlin3(px[i] * f + ox + o * 11.7, py[i] * f + oy + o * 5.3, pz[i] * f + oz - o * 9.1, perm)
            v = 1.0 - abs(v) * 1.6
            if v < 0.0:
                v = 0.0
            v = v * v
            s += a * v * prev
            prev = min(1.0, v * 1.5)
            norm += a; a *= gain; f *= lac
        out[i] = s / norm
    return out
