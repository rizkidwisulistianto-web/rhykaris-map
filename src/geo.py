"""Rhykaris — geometri kanon: small circle Scar (pusat -55.5/0, r 72.5), grid equirectangular."""
import numpy as np

SCAR_CLAT, SCAR_CLON, SCAR_R = -55.5, 0.0, 72.5
BAND_HALF = 6.5          # lebar pita 13.0 deg (Tension #18 Resolved) -> setengah 6.5
R_KM = 1.3 * 6371.0      # radius planet (Planetary Form §1) ~ 8282 km

def grid(W, H):
    lat = 90.0 - (np.arange(H) + 0.5) * 180.0 / H
    lon = -180.0 + (np.arange(W) + 0.5) * 360.0 / W
    LON, LAT = np.meshgrid(lon, lat)
    return LAT, LON

def unit(lat, lon):
    la = np.radians(lat); lo = np.radians(lon)
    return np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)

C = np.array(unit(SCAR_CLAT, SCAR_CLON))
N_C = np.array([-np.sin(np.radians(SCAR_CLAT)) * np.cos(0), 0.0, np.cos(np.radians(SCAR_CLAT))])  # 'utara' lokal di C
E_C = np.array([0.0, 1.0, 0.0])

def scar_signed(lat, lon):
    """d < 0 = sisi Rhykar (dalam cap), d > 0 = sisi Aëris. Derajat."""
    x, y, z = unit(lat, lon)
    dot = np.clip(x * C[0] + y * C[1] + z * C[2], -1, 1)
    return np.degrees(np.arccos(dot)) - SCAR_R

def scar_azimuth(lat, lon):
    """Azimut di sekitar pusat cap: 0 = puncak (+17,0), +90 = lereng timur, ±180 = palung."""
    x, y, z = unit(lat, lon)
    pn = x * N_C[0] + y * N_C[1] + z * N_C[2]
    pe = x * E_C[0] + y * E_C[1] + z * E_C[2]
    return np.degrees(np.arctan2(pe, pn))

def curve_point(alpha_deg, dist=SCAR_R):
    """Titik pada jarak sudut `dist` dari pusat cap, azimut alpha. -> (lat, lon)."""
    a = np.radians(alpha_deg); r = np.radians(dist)
    la1 = np.radians(SCAR_CLAT)
    lat = np.arcsin(np.sin(la1) * np.cos(r) + np.cos(la1) * np.sin(r) * np.cos(a))
    lon = np.arctan2(np.sin(a) * np.sin(r) * np.cos(la1), np.cos(r) - np.sin(la1) * np.sin(lat))
    return np.degrees(lat), np.degrees(lon)

def gc_dist_deg(lat1, lon1, lat2, lon2):
    x1, y1, z1 = unit(lat1, lon1); x2, y2, z2 = unit(lat2, lon2)
    return np.degrees(np.arccos(np.clip(x1 * x2 + y1 * y2 + z1 * z2, -1, 1)))

def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def lon_diff(a, b):
    return (a - b + 180.0) % 360.0 - 180.0

def area_w(LAT):
    w = np.cos(np.radians(LAT))
    return w / w.sum()

def azeq(lat, lon, lat0, lon0):
    """Proyeksi azimuthal-equidistant lokal (derajat busur) di sekitar (lat0, lon0) -> (x timur, y utara)."""
    dist = gc_dist_deg(lat, lon, lat0, lon0)
    p1 = np.radians(lat0); p2 = np.radians(lat); dl = np.radians(lon - lon0)
    th = np.arctan2(np.sin(dl) * np.cos(p2), np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl))
    return dist * np.sin(th), dist * np.cos(th)
