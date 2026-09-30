> **Public-edition note.** Below is the README of the original v4 archive, kept verbatim (in Indonesian) as the canon and status record. In this repository:
>
> - the built map is **`index.html`** at the repository root (the archive called it `out/master_map_rhykaris.html`); rasters and the SVG preview live in **`assets/`** (the archive's `out/`);
> - **`scripts/build_index.py`** replaces `src/build_html.py` (step 8 below): same bundling logic, repo-relative paths, Python standard library only;
> - links from popups to the author's private Notion vault were removed — every `url` field is `null`, and `src/places_data.py` / `src/build_data.py` use `url=None`;
> - the scripts in `src/` still carry the archive's absolute paths (`/home/claude/rhykaris_map/`).

---

# Rhykaris — Master Map v4 (kanon 29 Sep 2026)

Arsip sumber & keluaran peta kanon Rhykaris. Seed **1647**. Proyeksi equirectangular 4096×2048
(0,088°/px ≈ 12,7 km/px) + inset Teluk Kontak (Sinus Adventus) 40 px/°.

## Status kanon — dua lapisan
- **Lapisan fisik** (garis pantai, relief, sungai, bioma, batimetri, geometri Scar): kanon stabil.
  Perubahan hanya lewat versi peta baru (v5, …) + entri Change Log — tidak diedit diam-diam.
- **Lapisan politik** (wilayah, perbatasan, kerajaan, titik kota yang belum dikunci Atlas): snapshot AS 1647,
  boleh bertambah/bergeser tanpa mengubah versi lapisan fisik.
- Hierarki: constraint Planetary Form/Cosmology > peta. Angka terukur dari peta kanon = Turunan.
  Posisi titik yang belum dikunci di Atlas = Inferensi AI sampai diketok per entri.

## Keputusan kanon sesudah v4 (29 Sep 2026)
- **Cincin Scar Proximity** (Canon Index #209): jarak sudut ke kurva — Within ≤ 6,5° · Adjacent ≤ 19,5° · Peripheral ≤ 32,5° · Unaffected > 32,5°.
  Polity diukur dari ibukota, wilayah fisik dari sentroid; benua/samudra lintas-cincin tanpa nilai tunggal. Sabuk Transisi Sutura = Adjacent + Peripheral.
  Nilai Convergence Zone (field Hemisphere) dipensiunkan.
- **Zona Ambang Ellumāt** = Unaffected (Canon Index #210); di bawahnya kantong anomali massa #3 (bongkahan litosfer Rhykar).
  Titik Zona Ambang & kantong #3 di peta = Inferensi AI; posisi persis → Tension #17.
- Peta interaktif **v1.3** mengikuti keduanya (ambang = kanon, kantong #3 ditandai, audit Zona Ambang & Notes Ellumāt = Ditutup).
- Peta interaktif **v1.4**: rujukan v3-D jadi riwayat (acuan = v4); Contradiction #49 Resolved (Situs Dies Ignis tetap Adjacent); Mare Internum & fitur lapisan fisik (bank samudra, massif Šadûmāt, megaflora) berlabel Turunan; kartu audit diurutkan Friksi → Blank spot → Pola → Ditutup.

## Angka terukur (berbobot cos-lat)
| Besaran | Nilai |
|---|---|
| Darat Rhykar (d ≤ 0) | 23,002 % |
| Darat Aëris (d > 0) | 14,997 % — jantung Ellumāt 3,500 · Šadûmāt 2,300 · kepulauan 1,554 · porsi lintas-sutura 7,600 |
| Air | 62,000 % |
| Hemisfer (luas cap) | Rhykar 34,964 % / Aëris 65,036 % |
| Overlay darat dalam pita Scar 13,0° | 3,989 % (lebar untuk tepat 4,000 % = 13,03°) |
| Koridor darat lintas-sutura | satu; bujur −158,9°..−30,0° (azimut kurva −166,2°..−30,8°) |
| Kurva Scar di darat / laut | 37,6 % / 62,4 % panjang (daratan hanya di koridor) |
| Kepala Sinus Adventus (bujur 0°) | lat −2,3° |
| Jarak ke kurva | Dies Ignis 18,25° (≈2.640 km) · Litus Primum 19,35° · Libbāl 107,5° · tepi terdekat Ellumāt 73,5° |

Geometri Scar: small circle pusat −55,5°/0°, radius 72,5°; d = jarak sudut ke pusat − 72,5 (d < 0 = sisi Rhykar);
azimut α: 0 = puncak +17° di bujur 0°, +90 = lereng timur, ±180 = palung. Radius planet 1,3 × Bumi ≈ 8.282 km.

## Menjalankan ulang pipeline
Python 3.11 · numpy 2.4 · scipy 1.17 · numba 0.67 · Pillow 12.2 · scikit-image 0.26.
Semua path ditulis absolut ke `/home/claude/rhykaris_map/` — taruh berkas di sana atau ganti path-nya.
Leaflet 1.9.4 (npm) dibutuhkan `build_html.py` untuk meng-inline `leaflet.css` (`vendor/node_modules/leaflet/dist/`).

1. `terrain.py` → `terrain_4096.npz` (memanggil `masks.build()` + `masks.landmask()`; constraint kanon ada di docstring `masks.py`)
2. `calib_global.py` → `calib_4096.json` (statistik noise global + ambang, dipakai inset)
3. `render.py` → `base_4096.png` (tekstur fisik) → konversi ke `base_q84.webp` (Pillow, quality 84, method 6)
4. `render_inset.py` → `inset_40.png` + `inset_40_q84.webp`
5. `make_datagrid.py` → `datagrid.png` (R = elevasi, G = kelas bioma; dipakai readout)
6. `politics.py` → `politics.json` (teritori, region, mandala, kontur — lapisan politik)
7. `build_data.py` (+ `places_data.py`) → `data.json`
8. `build_html.py` → `master_map_rhykaris.html` (satu berkas; Leaflet dari cdnjs → unpkg → jsDelivr)
9. `make_svg_preview.py` → `rhykaris_master_map_v4.svg` (pratinjau statis lapisan fisik)

## Isi arsip
- `src/` — pipeline Python + `calib_4096.json`
- `app/` — `app.js`, `style.css`, `body.html` (viewer)
- `data/` — `data.json`, `politics.json`
- `out/` — `master_map_rhykaris.html`, `rhykaris_master_map_v4.svg`, `base_4096.png`, `inset_40.png`, `datagrid.png`

`terrain_4096.npz` (~190 MB) tidak disertakan; dibangkitkan ulang oleh langkah 1.
