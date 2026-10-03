# -*- coding: utf-8 -*-
# Public edition: links to the private Notion vault were removed (url=None).
import json, os, sys, numpy as np
sys.path.insert(0, '/home/claude/rhykaris_map')
sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))   # interregna_table.py duduk di samping skrip ini
from geo import *
from places_data import PLACES, ANOMALIES, ROUTES, FRONTS, N
import interregna_table as IRT
Z = np.load('/home/claude/rhykaris_map/terrain_4096.npz')
land = Z['land']; elev = Z['elev']; H, W = land.shape
ADJ, PER = 19.5, 32.5
def prox(dd):
    a = abs(dd)
    return 'Within Scar' if a <= 6.5 else 'Adjacent' if a <= ADJ else 'Peripheral' if a <= PER else 'Unaffected'
def ij(lat, lon):
    return int(np.clip((90 - lat) / 180 * H, 0, H - 1)), int((lon + 180) / 360 * W) % W

for p in PLACES:
    dd = float(scar_signed(p['lat'], p['lon']))
    i, j = ij(p['lat'], p['lon'])
    p['d'] = round(dd, 2); p['d_km'] = int(round(abs(dd) * np.pi / 180 * R_KM))
    p['prox_calc'] = prox(dd); p['side'] = 'Rhykar' if dd < 0 else 'Aëris'
    p['on_land'] = bool(land[i, j]); p['elev'] = int(elev[i, j])
    if p.get('scar') and not p.get('label_only'):
        p['prox_match'] = (p['scar'] == p['prox_calc'])
for a in ANOMALIES:
    a['d'] = round(float(scar_signed(a['lat'], a['lon'])), 2)


# ---------------------------------------------------------------------------------------------------------------------
# Lapisan politik v3 (02 Okt 2026): semua angka di kartu di bawah dibaca dari blok `v3` di politics.json (ditulis src/politics_v3.py),
# supaya teks tidak pernah berbeda dari geometri. Skrip ini hanya merangkai kalimat; tidak ada angka dihitung ulang di sini.
pol = json.load(open('/home/claude/rhykaris_map/politics.json'))
assert 'v3' in pol, 'politics.json belum memuat blok v3 — jalankan src/politics_v3.py --write dan salin data/politics.json ke folder cermin'
V3 = pol['v3']; BL, MK, SV, FO, KL, CO, PR, IC = (V3[k] for k in ('belts', 'marka', 'satvan', 'foedera', 'kloaka', 'coast', 'params', 'ic'))


def idn(x, d=0):
    """Angka berformat Indonesia: titik ribuan, koma desimal."""
    return f'{x:,.{d}f}'.replace(',', '§').replace('.', ',').replace('§', '.')


def mkm(x, d=2):
    return idn(x, d) + ' juta km²'


def r50(x):
    """Pembulatan ke 50 km terdekat untuk ambang (angka PLACEHOLDER, tak perlu presisi palsu)."""
    return int(round(x / 50.0) * 50)


PLH = 'PLACEHOLDER, bukan kanon'
KM = lambda x: idn(x) + ' km'  # noqa: E731

C = dict(  # warna faksi (terbaca di atas terrain)
    hesperia='#c0394b', ic='#d9455f', marka='#e08a96', kloaka='#8a8a8a', foedera='#2aa38a', cassivalla='#7fd1bd', liminara='#9b6fd6', ktonia='#9fb6c6', pylora='#d4a76a',
    anabasim='#ff6a2b', emporys='#f5c542', perates='#4f86e8', anusarri='#e6d47a', andura='#4cc3a8', vasundha='#b58a52', nundina='#ffd970',
    tarvenna='#e0a33a', aventalia='#86a8e6', ir='#b99ad6', satvan='#e6dcc3')
# Kartu faksi. Bidang opsional (dibaca viewer, app.js · factionHTML):
#   style  = kunci gaya gambar di app/core.js (C.TSTYLE); tanpa `style`, gaya turun dari hatch/dashed seperti sebelumnya
#   method = kalimat "bagaimana batas ini digambar" (pengganti kalimat standar partisi sadar-medan)
#   facts  = [[label, epi, teks(, keyakinan)], ...] baris epistemik tambahan; epi ∈ kanon | turunan | inferensi | terbuka
#   tag    = lencana kecil di bawah judul (mis. "PLACEHOLDER, bukan kanon")
FACTIONS = {
 'imperial_commonwealth': dict(name='Imperial Commonwealth', kind='Payung konfederasi · yurisdiksi nominal · paramount: Hesperia', color=C['ic'], epi='inferensi', style='ic', tag='Gabungan dua poligon · tepi marka = PLACEHOLDER, bukan kanon', url=None,
     blurb='Konfederasi kerajaan vassal di bawah payung Hesperia, yang menjadi paramount-nya. Poligon ini hanya menunjukkan sejauh mana payung itu masih berlaku di AS 1647: tanah yang diperintah langsung Hesperia ditambah sabuk vassal di tepinya.',
     method=f'Gabungan dua poligon yang sudah ada, Hesperia (≈{mkm(IC["hesperia_mkm2"])}) dan sabuk kerajaan marka (≈{mkm(IC["marka_mkm2"])}), menjadi ≈{mkm(IC["area_mkm2"])}. Tidak ada lahan baru; hanya celah rambut di antara keduanya yang ditutup. Digambar di bawah keduanya dengan garis putus-putus, sehingga klik pada Hesperia atau pada sabuk marka tetap membuka kartu masing-masing.',
     facts=[
      ['Nama', 'kanon', 'Imperial Commonwealth: Atlas → Hesperia menyebut Hesperia "wilayah asal Imperial Commonwealth, kursi paramount sejak abad-abad awal AS". Powers → Hesperia: Commonwealth tetap konfederasi kerajaan vassal di bawah payung Hesperia, payung yang menyusut tetapi belum runtuh.'],
      ['Paramount', 'kanon', 'Hesperia adalah kursi paramount: bukan penerus Commonwealth, melainkan pusat yang masih menahannya (Powers → Hesperia). Karena itu poligon payung ini dan poligon Hesperia digambar terpisah.'],
      ['Isi payung', 'turunan', 'Hesperia (diperintah langsung, ±50 provinsi) ditambah kerajaan vassal. Yang sudah keluar dari payung, seperti Foedera dan Interregna, bukan bagian. Setelah pembacaan ulang peta (#213), vassal yang tersisa digambar sebagai satu sabuk sempit kerajaan marka.'],
      ['Luas', 'inferensi', f'≈{mkm(IC["area_mkm2"])} = Hesperia ≈{mkm(IC["hesperia_mkm2"])} + marka ≈{mkm(IC["marka_mkm2"])}. Yurisdiksi nominal (#215), bukan lahan hunian. Lebar sabuk marka = {PLH}, jadi tepi luar payung di sisi marka ikut berstatus itu.'],
      ['Tidak dijawab peta', 'terbuka', 'Jumlah dan identitas kerajaan vassal di dalam payung, dan apakah masih ada vassal di luar sabuk marka. Peta tidak menggambar garis apa pun di dalam payung selain batas Hesperia dan sabuk marka.'],
      ['Kosakata', 'turunan', '"Provinsi" hanya untuk tanah yang diperintah langsung Hesperia; anggota payung = "kerajaan", bukan provinsi dan bukan "federasi" (#214).']]),
 'hesperia': dict(name='Hesperia', kind='Empire · Paramount · Active · Continental', color=C['hesperia'], epi='inferensi', url=None,
     blurb='Paramount Imperial Commonwealth: Senat + Imperator, kursi paramount sejak abad-abad awal AS, memerintah langsung ±50 provinsi. Militer terbesar Rhykaris; penjaga standar Fides. Rival: Foedera, Interregna, Anabasim.',
     method='Poligon = wilayah yurisdiksi nominal (#215): satu lapis, tidak dipotong, bukan peta lahan hunian. Batasnya digambar lewat partisi sadar-medan dari jangkar kanon; snapshot AS 1647. Payung di atasnya digambar terpisah sebagai Imperial Commonwealth (bersama sabuk marka).',
     facts=[
      ['Paramount', 'kanon', 'Kursi paramount Imperial Commonwealth: bukan penerus Commonwealth, melainkan pusat yang masih menahannya (Powers → Hesperia; Atlas → Hesperia). Poligon ini hanya tanah yang diperintah langsung; payung di atasnya digambar sebagai Imperial Commonwealth.'],
      ['Luas poligon', 'inferensi', f'≈{mkm(BL["hesperia_mkm2"])} (teks Powers Hesperia ±12,55 juta km²) — luas yurisdiksi, bukan lahan hunian. Kontrol di sini mahal (gubernur, sensus, pajak), jadi luasnya dibatasi jumlah gubernur.'],
      ['Provinsi', 'turunan', f'±50 provinsi diperintah langsung — satu-satunya tempat kata "provinsi" dipakai di peta (#214). Tiga sabuk menurut jarak ke laut: Pesisir {BL["prov"][0]} · Transisi {BL["prov"][1]} · Pedalaman {BL["prov"][2]} (angka = Inferensi AI – Sedang). Sabuk tersedia sebagai layer opsional (default mati); batas tiap provinsi tidak digambar.'],
      ['Tepi pantai', 'inferensi', f'Poligon berhenti ≈{idn(CO["gap_median_km"])} km (satu piksel grid) sebelum pantai fisik; sisi pantainya terukur ≈{idn(round(CO["poly_coast_chord_km"], -2))}–{idn(round(CO["poly_coast_ring_km"], -2))} km, teks Powers Hesperia ±5.300 km. Blank spot di tab Audit.'],
      ['Commonwealth', 'turunan', 'Payung konfederasi kerajaan vassal, digambar sebagai poligon Imperial Commonwealth (Hesperia + sabuk marka). Yang tersisa di tepi wilayah langsung hanya sabuk sempit kerajaan marka (usulan); jumlah dan identitas kerajaannya = Terbuka.']]),
 'hes_marka': dict(name='Kerajaan marka Commonwealth (sabuk usulan)', kind='Konfederasi kerajaan vassal · tepi wilayah langsung Hesperia', color=C['marka'], epi='inferensi', hatch=True, style='marka', tag=PLH,
     blurb='Sisa vassal Commonwealth: satu sabuk sempit di tepi wilayah yang diperintah langsung Hesperia, bagian payung Imperial Commonwealth. Anggotanya kerajaan, bukan provinsi dan bukan "federasi" (#214).',
     method=f'Sabuk selebar nominal {KM(MK["width_km"])} (variasi ±{idn(100 * PR["MARKA_VAR"])} %) menyusuri tepi darat wilayah langsung Hesperia di sisi selatan dan barat daya. Tidak menimpa Hesperia, Interregna, Foedera, maupun Kloaka. Lebar = {PLH}.',
     facts=[
      ['Isi sabuk', 'terbuka', 'Jumlah dan identitas kerajaan marka belum diputuskan — karena itu tidak ada garis di dalam sabuk.'],
      ['Luas', 'inferensi', f'≈{mkm(MK["area_mkm2"])} ({idn(MK["share_of_hesperia_pct"], 1)} % luas poligon Hesperia). {PLH}.'],
      ['Kosakata', 'turunan', '"Kerajaan" untuk anggota Commonwealth (bukan provinsi, bukan "federasi"); "kerajaan marka" untuk vassal di tepi wilayah langsung Hesperia (#214, #213).']]),
 'hes_pesisir': dict(name='Hesperia · Sabuk Pesisir (usulan)', kind=f'Sabuk provinsi · {BL["prov"][0]} provinsi · jarak ke laut < ≈{idn(r50(BL["thr_km"][0]))} km', color=C['hesperia'], epi='inferensi', style='belt0', tag='Label kerja (#212)',
     blurb='Provinsi kecil dan padat di sepanjang Mare Internum dan Sinus Adventus: simpul pelabuhan, muara, dan jalur air.',
     method=f'Sabuk dihitung dari jarak busur-besar ke Mare Internum + Sinus Adventus (satu-satunya air besar di sisi Hesperia dalam kanon). Ambang ≈{idn(r50(BL["thr_km"][0]))} km = {PLH}. Layer opsional, default mati.',
     facts=[
      ['Provinsi', 'inferensi', f'{BL["prov"][0]} dari ±50 (#212; angka = Inferensi AI – Sedang).'],
      ['Luas sabuk', 'inferensi', f'≈{mkm(BL["area_mkm2"][0])} · {idn(BL["share_pct"][0], 1)} % poligon · rata-rata ≈{idn(BL["prov_avg_kkm2"][0])} ribu km² per provinsi (teks Powers Hesperia ±140 ribu).'],
      ['Batas', 'terbuka', 'Nama provinsi, batas tepat sabuk, dan istilah dunia-dalam untuk sabuk belum diputuskan; batas provinsi tidak digambar.']]),
 'hes_transisi': dict(name='Hesperia · Sabuk Transisi (usulan)', kind=f'Sabuk provinsi · {BL["prov"][1]} provinsi · jarak ke laut ≈{idn(r50(BL["thr_km"][0]))}–{idn(r50(BL["thr_km"][1]))} km', color=C['hesperia'], epi='inferensi', style='belt1', tag='Label kerja (#212)',
     blurb='Provinsi menengah di sepanjang simpul jalan antara pesisir dan dataran tinggi kering.',
     method=f'Jarak ke laut antara ≈{idn(r50(BL["thr_km"][0]))} dan ≈{idn(r50(BL["thr_km"][1]))} km (median seluruh poligon ≈{idn(round(BL["median_sea_km"], -1))} km, teks Powers Hesperia ±1.050 km). Ambang = {PLH}. Layer opsional, default mati.',
     facts=[
      ['Provinsi', 'inferensi', f'{BL["prov"][1]} dari ±50 (#212; angka = Inferensi AI – Sedang).'],
      ['Luas sabuk', 'inferensi', f'≈{mkm(BL["area_mkm2"][1])} · {idn(BL["share_pct"][1], 1)} % poligon · rata-rata ≈{idn(BL["prov_avg_kkm2"][1])} ribu km² per provinsi (teks Powers Hesperia ±300 ribu).'],
      ['Batas', 'terbuka', 'Nama provinsi, batas tepat sabuk, dan istilah dunia-dalam untuk sabuk belum diputuskan; batas provinsi tidak digambar.']]),
 'hes_pedalaman': dict(name='Hesperia · Sabuk Pedalaman (usulan)', kind=f'Sabuk provinsi · {BL["prov"][2]} provinsi · jarak ke laut > ≈{idn(r50(BL["thr_km"][1]))} km', color=C['hesperia'], epi='inferensi', style='belt2', tag='Label kerja (#212)',
     blurb='Tujuh provinsi besar yang jarang penduduknya di dataran tinggi kering dengan tambang besi dan nikel; legiun di bawah komando terpisah.',
     method=f'Jarak ke laut > ≈{idn(r50(BL["thr_km"][1]))} km = {PLH}. Layer opsional, default mati. Zona persebaran Satvan Pedalaman diberi penyangga dari sabuk ini.',
     facts=[
      ['Provinsi', 'inferensi', f'{BL["prov"][2]} dari ±50 (#212; angka = Inferensi AI – Sedang).'],
      ['Luas sabuk', 'inferensi', f'≈{mkm(BL["area_mkm2"][2])} · {idn(BL["share_pct"][2], 1)} % poligon · rata-rata ≈{idn(BL["prov_avg_kkm2"][2])} ribu km² per provinsi (teks Powers Hesperia ±550 ribu).'],
      ['Batas', 'terbuka', 'Nama provinsi, batas tepat sabuk, dan istilah dunia-dalam untuk sabuk belum diputuskan; batas provinsi tidak digambar.']]),
 'satvan_pedalaman': dict(name='Satvan Pedalaman · zona persebaran (usulan)', kind='Zona persebaran · bukan wilayah berdaulat · tanpa garis batas', color=C['satvan'], epi='inferensi', style='sat', tag=PLH,
     blurb='Pita interior selatan berkepadatan sangat rendah di belakang Sabuk Pedalaman Hesperia: kelompok Satvan yang tersebar, tanpa negara dan tanpa perbatasan. Jarak penyangga dari tambang membuat mereka nyaris tak terlihat manusia.',
     method=f'Digambar sebagai bintik berjenjang, bukan poligon berbatas. Aturan penempatan: ≥{KM(PR["SAT_BUF_HES_PED"])} dari Sabuk Pedalaman Hesperia (tambang), ≥{KM(PR["SAT_BUF_INTERREGNA"])} dari zona Interregna, ≥{KM(PR["SAT_BUF_FOEDERA"])} dari klaim Foedera, ≥{KM(PR["SAT_BUF_VASUNDHA"])} dari Vasundha (tidak digeser); lebar pita {KM(PR["SAT_WIDTH_KM"])}. Semua angka = {PLH}.',
     facts=[
      ['Posisi', 'inferensi', 'Geographic Range di entri Satvan Pedalaman masih USULAN (Draft, 2 Okt 2026): pita interior selatan Ferria, dari belakang Sabuk Pedalaman Hesperia sampai selatan Foedera. Poligon ini hanya satu pembacaannya.'],
      ['Terhadap The Scar', 'inferensi', f'Aturan cincin Canon Index #209 (dari sentroid, karena zona bukan polity): sentroid ≈{idn(abs(SV["scar"]["centroid"][0]), 1)}° LS, {idn(abs(SV["scar"]["centroid"][1]), 1)}° BB berjarak ≈{idn(abs(SV["scar"]["d_centroid"]), 1)}° dari kurva → {SV["scar"]["ring_centroid"]}. Seluruh zona {idn(SV["scar"]["abs_min"], 1)}°–{idn(SV["scar"]["abs_max"], 1)}° dari kurva (> 32,5°), jadi tidak melintasi cincin mana pun. Usulan, belum dikanonkan.'],
      ['Status hukum', 'terbuka', 'Apakah Satvan di dalam poligon yurisdiksi "tidak terhitung" (label fauna) belum jadi kanon (#215). Peta tidak menjawabnya: zona ini tanpa garis dan tidak menunjuk yurisdiksi mana pun.'],
      ['Bukan', 'terbuka', 'Bukan "Satvan Perbatasan" (knob Terbuka, posisi kedua) dan bukan Vasundha — keduanya tidak digeser dan tidak disamakan dengan zona ini.']]),
 'kloaka': dict(name='Kloaka', kind='Kingdom · Fractured · Local', color=C['kloaka'], epi='inferensi', dashed=True, style='klo_claim', url=None,
     blurb='Kerajaan nominal, tanpa penegakan: raja masih ada di istananya dan menandatangani dekrit yang tak ditegakkan siapa pun. Fragmentasi yang stabil — terlalu tidak terorganisir untuk jadi ancaman, terlalu berguna untuk dihancurkan.',
     method='Garis putus-putus tipis = klaim NOMINAL (tanah yang secara hukum milik kerajaan), bukan wilayah yang dikuasai; kendali sesungguhnya digambar terpisah sebagai zona bergeser. Posisi tidak digeser dan tetap usulan (Inferensi AI – Rendah): kanon tidak memuat lokasi Kloaka (ledger: "bawah-Aurelia").',
     facts=[
      ['Status', 'kanon', 'Kerajaan nominal, tanpa penegakan. Faction Type "Kingdom" sengaja dipertahankan.'],
      ['Mengapa masih berdiri', 'kanon', 'Ditopang bangsawan lintas yurisdiksi yang menjaga raja dan istana tetap hidup (murah, pasif); wilayahnya tetap sah milik kerajaan, tak bisa dinyatakan kosong atau ditinggalkan, jadi tak seorang pun punya dalih mencaplok "demi memulihkan ketertiban" (#216). Rincian = Inferensi AI – Sedang.'],
      ['Tidak dijawab peta', 'terbuka', 'Siapa bangsawannya dan dari yurisdiksi mana; apakah raja tahu gelarnya berguna bagi orang lain; apakah ada zona yang cukup terkonsolidasi untuk tampak seperti mini-kerajaan; apakah ada sumber daya tersembunyi.'],
      ['Peran', 'kanon', 'Kloaka adalah katup pelepas tekanan sistemik — ruang tempat pihak lain bertarung, bukan pemain — dan bukan penyangga geopolitik.'],
      ['Letak', 'inferensi', 'Di peta Kloaka tidak digabung ke Interregna dan tidak dipasang sebagai penyangga Hesperia–Foedera. Letaknya di jahitan tiga wilayah hanyalah usulan posisi (Inferensi AI – Rendah): kanon tidak memuat lokasi.']]),
 'kloaka_zona': dict(name='Kloaka · zona kontrol bergeser (usulan)', kind='Zona pengaruh tanpa batas tegas · di dalam klaim nominal', color=C['kloaka'], epi='inferensi', style='klo_zone', tag=PLH,
     blurb='Siapa menguasai apa di sini berubah mengikuti pertarungan terakhir; tidak ada yang mengontrol apa pun secara konsisten. Kerajaan nominal, tanpa penegakan.',
     method='Bintik berjenjang tanpa garis batas, sengaja: kanon menyebut batas zona pengaruh bergerak. Satu zona difus di dalam klaim — bukan kantong-kantong terpisah — agar peta tidak menjawab apakah ada zona yang cukup terkonsolidasi untuk jadi mini-kerajaan.',
     facts=[
      ['Bentuk', 'inferensi', f'Tiga jenjang (rapat di tengah, jarang di tepi) di dalam klaim ≈{idn(KL["claim_mkm2"] * 1000)} ribu km². Letak dan kepadatannya ilustrasi snapshot AS 1647; pertarungan berikutnya menggesernya.'],
      ['Status hukum', 'kanon', 'Kerajaan nominal, tanpa penegakan (#216).']]),
 'foedera_inti': dict(name='Foedera · inti berpenduduk tipis (usulan)', kind='Inti hunian tipis di sepanjang jalur air · di dalam klaim Foedera', color=C['foedera'], epi='inferensi', style='foe_core', tag=PLH,
     blurb='Tempat garnisun dan permukiman Foedera benar-benar ada: lembah sungai besar dan jalur pantai atau danau. Di luar inti, klaim hanya garis garnisun.',
     method=f'Jaringan sungai besar (aliran > {idn(PR["FCORE_ACC_K"], 0)}× ambang sungai; tebal mengikuti log aliran) ditambah jalur pantai atau danau selebar ≈{KM(PR["FCORE_COAST_KM"])}, hanya komponen yang tersambung ke pantai. Semua parameter = {PLH}.',
     facts=[
      ['Luas', 'inferensi', f'≈{mkm(FO["inti_mkm2"])} = {idn(FO["inti_share_pct"], 0)} % dari klaim Foedera.'],
      ['Subdivisi', 'terbuka', 'Tidak digambar. Tiga lapis ikatan (#211) hanya label kerja.']]),
 'aventalia': dict(name='Aventalia', kind='Interregna · belum tersentuh', color=C['aventalia'], epi='inferensi', url=None, blurb='Front terjauh kampanye Florian; "masih merasa punya waktu".'),
 'tarvenna': dict(name='Tarvenna', kind='Interregna · Contested (panggung Arc 1)', color=C['tarvenna'], epi='inferensi', hatch=True, url=None, blurb='Simpul perlintasan koridor tengah; bekas motor liga defensif yang gagal.'),
 'cassivalla': dict(name='Cassivalla', kind='Kerajaan Interregna · dianeksasi Foedera (~AS 1630-an)', color=C['cassivalla'], epi='inferensi', hatch=True, url=None,
     blurb='Kerajaan pertama yang ditelan; kini dilabeli ulang dengan tria nomina institusional Foedera.',
     facts=[['Nama', 'inferensi', '"Cassivalla" adalah nama di peta, legenda, dan kartu (#214). "Provincia Cassivallae" hanya eksonim Foedera — label institusional pihak pencaplok — bukan nama kerajaan dan bukan provinsi Hesperia.', 'Tinggi']]),
 'nundina': dict(name='Nundina', kind='Kota merdeka', color=C['nundina'], epi='inferensi', url=None, blurb='Pasar spot terbesar koridor; Omneris berkuasa de facto tanpa kursi formal.'),
 'foedera': dict(name='Foedera', kind='Kingdom · Rising · Continental', color=C['foedera'], epi='inferensi', url=None, hatch=True, style='foe_claim',
     blurb='Koalisi militer lintas ras + Ordo Foederis (akses Sistem II-B via Pharmakeia). Legitimasi: perjanjian (foedus), bukan warisan.',
     method='Arsiran = klaim luas (yurisdiksi nominal, #215), tidak dipotong: kontrol di Foedera murah — garnisun di garis — sehingga luasnya tidak dibatasi jumlah gubernur seperti Hesperia. Blok pekat di dalamnya = inti berpenduduk tipis di sepanjang jalur air.',
     facts=[
      ['Luas klaim', 'inferensi', f'≈{mkm(FO["area_mkm2"])} (teks Powers Hesperia ±16,6 juta km²) — luas yurisdiksi nominal, bukan lahan hunian; inti berpenduduk tipis ≈{mkm(FO["inti_mkm2"])} ({idn(FO["inti_share_pct"], 0)} %).'],
      ['Tiga lapis ikatan', 'inferensi', 'Marka Inti · Komunitas Berpakta · Wilayah Caplokan (#211) hanyalah LABEL KERJA, bukan istilah dunia-dalam; istilah dunia-dalam tiap lapis masih Terbuka.'],
      ['Batas antar lapis', 'turunan', 'Entri Powers: tidak ada peta wilayah seragam di Foedera; batas antar lapis adalah soal syarat, bukan garis di peta. Karena itu peta tidak menggambar subdivisi apa pun di dalam Foedera.']]),
 'liminara': dict(name='Liminara', kind='Kingdom · Regional — posisi usulan', color=C['liminara'], epi='inferensi', url=None, blurb='Benteng medan; manufaktur senjata dari besi Ktonia; flora gunung.'),
 'ktonia': dict(name='Ktonia', kind='Kingdom · Regional — posisi usulan', color=C['ktonia'], epi='inferensi', url=None, blurb='Satu-satunya deposit iridescent — material yang memutus proyeksi Sistem II-B.'),
 'pylora': dict(name='Pylora', kind='Kingdom · Local — usulan (Draft)', color=C['pylora'], epi='inferensi', url=None,
     blurb='Penjaga satu-satunya celah tebing pesisir timur; gerbang dua arah (nilai-padat keluar, komoditas Hesperia masuk); klien Peratēs.'),
 'anabasim': dict(name='Anabasim', kind='Tribe (konfederasi Birath–Satvan) · Rising · Regional', color=C['anabasim'], epi='turunan', hatch=True, url=None,
     blurb='Zona konsolidasi di daratan pita Lereng Timur + pijakan zona penyangga Fase 1. Umur teraih Birath ~40–55 tahun di Scar: wilayah = tahun yang dikembalikan.'),
 'emporys': dict(name='Emporys', kind='City-state · Regional — posisi usulan', color=C['emporys'], epi='turunan', url=None, blurb='Simpul pasar netral; netralitas sebagai properti geografis (tanah pita tak bisa diklaim).'),
 'perates': dict(name='Peratēs', kind='Oligarchy · Continental — pelabuhan induk usulan', color=C['perates'], epi='inferensi', url=None, blurb='Mengendalikan jalur, bukan lahan.'),
 'anusarri': dict(name='Anušarri', kind='Empire (Elvari) · Continental — gradasi mandala', color=C['anusarri'], epi='turunan', gradient=True, url=None,
     blurb='Slow Wealth: gandum, besi, kayu. Digambar sebagai GRADASI tanpa tepi (Ring 0→2), sesuai kanon peta Elvari.'),
 'andura': dict(name='Andurā', kind='Rebel Cell (Napûm) · Local', color=C['andura'], epi='inferensi', url=None,
     blurb='Generasi kedua Napûm yang tidak bisa diancam kehilangan sesuatu yang tidak pernah mereka miliki. Territory = Zona Ambang [Kanon].'),
 'vasundha': dict(name='Vasundha', kind='Tribe (Satvan) · Local — posisi usulan', color=C['vasundha'], epi='inferensi', dashed=True, url=None, blurb='Satvan pedalaman yang menolak memilih.'),
}
# Mozaik Interregna v2 (02 Okt 2026): nama, jenis, warna, dan blurb semua polity ir_* datang dari src/interregna_table.py
# (satu sumber kebenaran bersama src/interregna.py yang menggambar batasnya). Aventalia & Tarvenna tetap ditulis tangan di atas.
FACTIONS.update(IRT.ir_factions())

UNMAPPED = [
 ('Iluhar', 'Kanon: hadir "tanpa alamat" — kasta, bukan teritori. Sengaja tidak dipetakan.', None),
 ('Abaton', 'Pagar Contradiction #36: entri sengaja Scar-agnostik (nol klaim posisi) sampai audit Bestiary (Deepmother) menutupnya. Tidak dipetakan.', None),
 ('Ordo Foederis', 'Markas: Synodia vs garnisun frontier = knob terbuka (entri Foedera).', None),
 ('Ordo Lacunae', 'Tidak punya wajah publik; keberadaannya disangkal — lokasi HQ tidak layak ditandai.', None),
 ('Garbhên', 'Klan Dharên terdalam — wilayah vertikal (bawah tanah); ditandai hanya sebagai indikasi Zona Garbhên.', None),
 ('Pharmakeia', 'HQ + jaringan fasilitas bedah = slot ledger OPEN (Besar): posisi HQ adalah pernyataan politik.', None),
 ('Theoria', 'HQ = slot ledger OPEN (Besar): distrik akademik Aurelia vs kota ilmu terpisah.', None),
 ('Theriaca', 'Beroperasi di hotspot hemisfer & sub-zona stabil Scar — jaringan lapangan, bukan teritori.', None),
 ('Illibatus', 'Sel-sel tersebar; basis = siapa pun yang dirugikan sistem xenograft.', None),
 ('Chrematia · Omneris · Venditarii', 'Jaringan global lintas-yurisdiksi; tidak punya teritori.', None),
 ('Faksi II-B', 'Operator lapangan Sistem II-B; tanpa HQ di kanon.', None),
]

def _inside(rings, la, lo):
    """Titik-dalam-poligon even-odd (vektor numpy); rings = [[(lat, lon), ...], ...]."""
    c = np.zeros(la.shape, bool)
    for ring in rings:
        r = np.asarray(ring, float); n = len(r)
        for i in range(n):
            y1, x1 = r[i]; y2, x2 = r[(i + 1) % n]
            c ^= ((y1 > la) != (y2 > la)) & (lo < (x2 - x1) * (la - y1) / (y2 - y1 + 1e-300) + x1)
    return c


def route_split(route_id, step_km=0.5):
    """Panjang rute (km, busur besar) di dalam poligon Foedera, di dalam poligon polity lain, dan di tanah tak berpoligon.
    Dipakai kartu audit "Catok tiga rahang" supaya klaim "memotong jahitan" selalu terukur dari geometri final."""
    rt = next(r for r in ROUTES if r['id'] == route_id)
    pts = np.asarray(rt['pts'], float); la_, lo_ = pts[:, 0], pts[:, 1]
    seg = np.radians(np.hypot(np.diff(la_), np.diff(lo_) * np.cos(np.radians((la_[1:] + la_[:-1]) / 2)))) * R_KM
    n = max(2000, int(seg.sum() / step_km)); t = np.linspace(0, len(pts) - 1, n + 1)
    la = np.interp(t, np.arange(len(pts)), la_); lo = np.interp(t, np.arange(len(pts)), lo_)
    mid_la, mid_lo = (la[1:] + la[:-1]) / 2, (lo[1:] + lo[:-1]) / 2
    step = np.radians(np.hypot(np.diff(la), np.diff(lo) * np.cos(np.radians(mid_la)))) * R_KM
    SUB = {'imperial_commonwealth', 'hes_pesisir', 'hes_transisi', 'hes_pedalaman', 'foedera_inti', 'kloaka_zona', 'satvan_pedalaman', 'anabasim', 'emporys', 'perates', 'andura', 'anusarri'}
    base = [t_ for t_ in pol['territories'] if 'of' not in t_ and t_['id'] not in SUB]
    inF = np.zeros(mid_la.shape, bool); inO = np.zeros(mid_la.shape, bool)
    for t_ in base:
        m = _inside(t_['rings'], mid_la, mid_lo)
        if t_['id'] == 'foedera': inF |= m
        else: inO |= m
    return dict(total=float(step.sum()), foedera=float(step[inF].sum()), lain=float(step[inO & ~inF].sum()), none=float(step[~inF & ~inO].sum()))


ARC = route_split('arc1')

AUDIT = [
 dict(kind='tutup', title='Zona Ambang Ellumāt: Peripheral → Unaffected (ditutup 29 Sep 2026)',
      body='Field diisi 3 Jul (pra-v3-D), saat Ellumāt masih diasumsikan dekat bahu timur Culmen; seluruh Ellumāt ternyata ≥73,5° dari kurva. Diketok Opsi B: Zona Ambang tetap di pesisir Ellumāt dan menjadi Unaffected; kontras Napûm Berteritori datang dari kantong anomali massa #3 di bawahnya (bongkahan litosfer Rhykar). Kaskade: Canon Index #87, #181, #185, #188, #201; Atlas Ellumāt; delapan entri Compendium; satu entri Timeline.', refs='Contradiction #58 → Canon Index #210 · Change Log #70'),
 dict(kind='tutup', title='Notes Ellumāt (T2, 4 Jul): "posisi Ellumāt condong ke bahu timur Culmen" — ditutup 29 Sep 2026',
      body='Rute Penyeberangan tetap sah secara topologi (flank timur teluk → bahu timur Culmen → Zona Ambang → Ring 2), tetapi kini = penyeberangan pita + pelayaran ~120° bujur ke timur lewat Šadûmāt dan rantai Nagû timur.', refs='Atlas — Ellumāt · Races — Elvari (Batch 3: benteng antipode)'),
 dict(kind='friksi', title='Hesperia "pita pesisir utara Ferria di barat teluk" vs koridor lintas-sutura (lon −159..−30)',
      body='Entri Hesperia (2 Jul) ditulis sebelum v3-D, saat sutura masih dianggap garis pantai. Koridor lintas-sutura (dikunci v3-D, dipertahankan v4) menghapus pesisir utara harfiah di barat lon −30. Peta merekonsiliasinya lewat Mare Internum — badan airnya kanon fisik sejak ketok v4; nama dan relasi pesisir Hesperia masih butuh ketok.', refs='Atlas — Hesperia · Change Log #6 · Development Backlog (Mare Internum)'),
 dict(kind='tutup', title='Kepala Teluk Kontak lat −38 & jarak Situs Dies Ignis — ditutup 29 Sep 2026',
      body='Lat −38 hanya tercatat di memori sesi v3-D; Atlas dan peta v4 menaruh kepala teluk di lat −2,3 (≈2.800 km dari puncak kurva), sehingga Litus Primum & Situs Dies Ignis tetap Adjacent. Jarak itu dijawab Contradiction #49 (Opsi A): "jauh dari The Scar" di Ādi Vidāra = pemisahan mekanisme (Cosmology §3), bukan jarak — Situs Dies Ignis 18,25° ≈ 2.640 km dari kurva, Adjacent resmi sejak Canon Index #209.', refs='Atlas — Sinus Adventus, Litus Primum, Situs Dies Ignis · Contradiction #49 (Resolved 29 Sep 2026)'),
 dict(kind='friksi', title='Ima Cicatricis (laut×laut) vs ujung barat koridor las',
      body='Dengan batas busur per-azimut, sepertiga barat Ima (lon −159..−120) tertimpa las benua×benua. "Ekspresi dominan" masih laut×laut (2/3 busur) — friksi kecil, bisa ditutup dengan menggeser batas Latus Occidentale ke azimut −166°.', refs='Atlas — Ima Cicatricis, Latus Occidentale'),
 dict(kind='blank', title='Porsi lintas-sutura superbenua ≈7,6% permukaan — NOL entri Atlas',
      body='Daratan terbesar tanpa nama di vault: litosfer Aëris yang menyatu dengan Ferria lewat Pegunungan Sutura, tujuan satu-satunya jalur darat antar-hemisfer. Siapa di sana?', refs='Canon Index #110 · Change Log #6'),
 dict(kind='blank', title='Segmen akuatik The Scar — ≈62% panjang kurva melintasi laut',
      body='Kurva hanya di darat sepanjang koridor las (azimut −166°..−31°); sisanya ≈225° azimut = laut, digambar sebagai Palung Sutura. Belum ada entri segmen akuatik; slot ledger masih Open (blokirnya — Contradiction #24 — terangkat 29 Sep 2026).', refs='Location Debt Ledger — Segmen akuatik The Scar'),
 dict(kind='blank', title='Laut sisi antimeridian dalam cap Rhykar (~9% permukaan)',
      body='Bagian Tâmtu terbesar yang bercorak Rhykar (laut di atas litosfer padat). Tanpa sub-entri; Ima Cicatricis ada di tepinya.', refs='Planetary Form §5 · Atlas — Tâmtu'),
 dict(kind='pola', title='Tiga meridian, tiga klaim',
      body='0° historis = Litus Primum (kedatangan). Meridian resmi = Aurelia (≈8,31° barat, ≈1.200 km — kekuasaan). Meridian Elvari = Libbāl di 180°: nol-nya Elvari adalah antimeridian manusia. Readout koordinat peta bisa dialihkan ke ketiganya.', refs='Planetary Form §9 · Mandala Kemurnian'),
 dict(kind='pola', title='Semua ekspresi busur Scar terkonfirmasi — dengan satu koreksi pasangan',
      body='Culmen benua×laut ✓ · Latus Orientale benua-menipis×laut ✓ (+ pinggir Šadûmāt) · Ima laut×laut ✓ (dominan) · Latus Occidentale benua×benua ✓ — tapi pasangan kontaknya porsi lintas-sutura superbenua, bukan daratan sedang Aëris (Šadûmāt ada di lereng TIMUR).', refs='Atlas — 4 entri busur (ekspresi T3)'),
 dict(kind='pola', title='Catok tiga rahang terbaca di tanah',
      body=f'Hesperia (barat; di tepi selatan dan barat dayanya, sabuk sempit kerajaan marka vassal) ↔ mozaik Interregna (selatan kepala teluk) ↔ Foedera (timur teluk) ↔ frontier Lereng Timur ↔ Anabasim. Rute Arc 1 (Sharanya → Silva Nullius → Nundina) memotong jahitan Foedera–Interregna: ≈{idn(round(ARC["foedera"], -1))} km di dalam poligon Foedera, ≈{idn(round(ARC["none"], -1))} km di tanah tak berpoligon (Silva Nullius — jahitan di sini berupa celah, bukan garis batas bersama), lalu masuk Nundina. Kloaka duduk di jahitan tiga wilayah di kepala teluk tetapi bukan rahang: kanon menyebutnya katup pelepas tekanan, bukan penyangga.', refs='Atlas — Hesperia, Foedera, Interregna · Powers — Kloaka'),
 dict(kind='pola', title='Poligon = yurisdiksi nominal, bukan lahan hunian — dua ukuran biaya kontrol',
      body=f'Hesperia (≈{mkm(BL["hesperia_mkm2"])}) dan Foedera (≈{mkm(FO["area_mkm2"])}) sama-sama digambar sebagai wilayah yurisdiksi nominal (#215). Hesperia mahal dikontrol — gubernur, sensus, pajak — sehingga luasnya dibatasi jumlah gubernur: ±50 provinsi dalam tiga sabuk menurut jarak ke laut ({BL["prov"][0]} · {BL["prov"][1]} · {BL["prov"][2]}), satu lapis, tidak dipotong, sabuk hanya layer opsional (default mati) dan batas provinsi tidak digambar. Foedera murah dikontrol — garnisun di garis — sehingga klaimnya boleh jauh lebih luas: dua lapis, arsiran klaim ditambah inti berpenduduk tipis (≈{mkm(FO["inti_mkm2"])}, {idn(FO["inti_share_pct"], 0)} %) di sepanjang jalur air. Kloaka mengikuti pola yang sama dengan hukum tanpa penegakan: garis putus-putus untuk klaim nominal, bintik tanpa tepi untuk kendali yang bergeser.', refs='Canon Index #211, #212, #215 · Powers — Hesperia, Foedera, Kloaka'),
 dict(kind='pola', title='Payung Imperial Commonwealth = Hesperia (paramount) + kerajaan vassal, bukan satu wilayah',
      body=f'Label besar yang dulu bertuliskan "Hesperia" kini menamai payung: Imperial Commonwealth, ≈{mkm(IC["area_mkm2"])}, gabungan poligon Hesperia (≈{mkm(IC["hesperia_mkm2"])}, diperintah langsung, paramount) dan sabuk kerajaan marka (≈{mkm(IC["marka_mkm2"])}, usulan). Tidak ada lahan baru dan tidak ada keputusan kanon baru: payung hanya menggabungkan dua poligon yang sudah ada, digambar di bawah keduanya, dan sabuk marka kini punya layer sendiri, "Kerajaan-kerajaan Commonwealth". Kata "Kerajaan" tidak dipakai untuk Hesperia: Hesperia = Empire, dan #214 mengunci "kerajaan" untuk anggota Commonwealth. Jumlah dan identitas kerajaan di dalam payung tetap Terbuka.', refs='Atlas — Hesperia · Powers — Hesperia · Canon Index #213, #214, #215'),
 dict(kind='pola', title='Tanpa garis bila kanon tidak menarik garis: zona Satvan, zona Kloaka, lapis Foedera',
      body='Tiga tempat peta sengaja tidak menggambar batas tegas karena kanon pun tidak: zona persebaran Satvan Pedalaman (bukan wilayah berdaulat — hanya bintik berjenjang), zona kontrol Kloaka (batasnya bergerak mengikuti pertarungan terakhir — bintik berjenjang di dalam klaim nominal), dan tiga lapis ikatan Foedera (batas antar lapis soal syarat, bukan garis di peta — tidak ada subdivisi). Kepadatan bintik dan jenjangnya ilustrasi, bukan pengukuran.', refs='Canon Index #211, #213, #216 · Powers — Kloaka, Foedera · Satvan Pedalaman (Draft)'),
 dict(kind='pola', title='Satu kata, satu aturan: "provinsi" hanya untuk wilayah yang diperintah langsung Hesperia',
      body='Di peta, legenda, dan kartu: anggota Commonwealth = "kerajaan" (bukan provinsi, bukan "federasi"); vassal di tepi wilayah langsung Hesperia = "kerajaan marka"; Cassivalla = kerajaan Interregna yang dianeksasi, bukan provinsi Hesperia, dan tidak termasuk ±50 provinsi. "Provincia Cassivallae" hanya muncul sebagai eksonim Foedera di popup Cassivalla, berlabel.', refs='Canon Index #214'),
 dict(kind='friksi', title='Kata "provinsi" di entri Powers Foedera vs #214',
      body='Powers Foedera (Founded dan Struktur Teritorial) masih memakai "provinsi" untuk Foedera ("mendeklarasikan provinsi yang dipegangnya", "bekas provinsi terjauh"), padahal #214 membatasi kata itu pada wilayah yang diperintah langsung Hesperia. Peta mengikuti #214 dan tidak memakai kata itu untuk Foedera; sapuan kosakata di vault (Powers Foedera, entri Timeline) masih menunggu.', refs='Canon Index #214 (pending sweep) · Powers — Foedera'),
 dict(kind='blank', title='Status hukum Satvan "tidak terhitung" di dalam poligon yurisdiksi — belum kanon',
      body='Poligon Hesperia dan Foedera adalah yurisdiksi nominal, bukan lahan hunian (#215). Apakah Satvan yang hidup di dalamnya "tidak terhitung" secara hukum (label fauna) belum jadi kanon, sehingga peta tidak menggambar mereka di dalam poligon mana pun. Zona Satvan Pedalaman digambar di luar kedua poligon, sebagai bintik tanpa garis yang tidak menunjuk yurisdiksi — jadi tidak menjawab pertanyaan ini, dan tidak disamakan dengan knob Terbuka "Satvan Perbatasan".', refs='Canon Index #215 · Atlas — Hesperia · Satvan Pedalaman (Draft)'),
 dict(kind='blank', title='Jumlah dan nama polity Interregna — tetap knob Terbuka',
      body='Peta menggambar %(n)d polity ilustratif (%(K)d kerajaan termasuk Aventalia dan Tarvenna, %(C)d kota merdeka, %(A)d wilayah adat, %(M)d mikro-polity), ditambah Cassivalla dan Nundina yang dibekukan. Jumlah, nama, jenis, dan batas tiap polity = Terbuka dan Inferensi AI (tak bernama); yang berdasar kanon hanya jangkar cerita — Cassivalla, Tarvenna, Aventalia, Nundina — dan urutan jatuhnya kampanye Florian. Peta tidak menjawabnya.' % dict(IRT.composition(), n=sum(IRT.composition().values())), refs='Atlas — Interregna · Powers — Interregna · Location Debt Ledger'),
 dict(kind='blank', title='Garis pantai Hesperia berhenti sebelum pantai fisik',
      body=f'Poligon politik Hesperia berhenti ≈{idn(CO["gap_median_km"])} km (sekitar satu piksel grid; persentil 90 ≈{idn(CO["gap_p90_km"])} km) sebelum garis pantai fisik Mare Internum dan Sinus Adventus. Panjang sisi pantainya terukur ≈{idn(round(CO["poly_coast_chord_km"], -2))}–{idn(round(CO["poly_coast_ring_km"], -2))} km (tergantung toleransi poligon), sedangkan Powers → Hesperia menyebut ±5.300 km — angka itu sendiri Inferensi AI – Sedang, dan Powers mencatat bahwa ia bergantung pada toleransi poligon politik yang berhenti sebelum garis pantai fisik. Peta tidak memotong poligon agar cocok (#215: poligon = yurisdiksi nominal) dan tidak menggeser pantai fisik.', refs='Canon Index #212, #215 · Powers — Hesperia (Struktur Teritorial, callout audit) · lapisan fisik v4'),
 dict(kind='blank', title='Posisi Kloaka — kanon tidak memuat lokasi',
      body=f'Posisi Kloaka di peta (Inferensi AI – Rendah) hanya mengikuti ledger "bawah-Aurelia", dan jatuh di jahitan Hesperia–Interregna–Foedera dekat kepala teluk. Geometri itu bisa terbaca sebagai "penyangga", padahal kanon menyebut Kloaka katup pelepas tekanan sistemik; peta tidak mengklaimnya dan tidak menggabungkan Kloaka ke Interregna. Posisi tidak digeser; tumpang-tindih kecil dengan Hesperia ({KL["overlap_by"]["hesperia"]} px), Foedera dan satu polity Interregna ({KL["overlap_by"]["foedera"]} px masing-masing) dibereskan dengan memotong klaim Kloaka ({idn(KL["old_px"])} → {idn(KL["claim_px"])} px), bukan tetangganya. Tiga knob Terbuka Powers — zona mini-kerajaan, sumber daya tersembunyi, apakah raja tahu gelarnya berguna — tidak dijawab.', refs='Atlas — Kloaka · Powers — Kloaka · Canon Index #216'),
 dict(kind='tutup', title='Tiga "Vasal Commonwealth" bernomor dicabut; sisanya sabuk kerajaan marka — ditutup 2 Okt 2026',
      body=f'Tiga poligon vassal bernomor (±11,26 juta km², terpisah dari poligon Hesperia) dibuat dengan asumsi Hesperia kekaisaran berpayung vassal luas — bukan kanon — dan dicabut (#213); tidak digabung ke Hesperia. Koridor tengah kini diisi mozaik Interregna; sisa vassal Commonwealth = satu sabuk sempit kerajaan marka (≈{mkm(MK["area_mkm2"])}) di tepi wilayah langsung Hesperia; pedalaman selatan = zona persebaran Satvan Pedalaman, bukan wilayah berdaulat. Jumlah dan identitas kerajaan marka tetap Terbuka.', refs='Canon Index #213'),
]

_KORDER = {'friksi': 0, 'blank': 1, 'pola': 2, 'tutup': 3}
AUDIT.sort(key=lambda a: _KORDER[a['kind']])

LEDGER = [
 ('Portus — kota pelabuhan utama Sinus Adventus', 'Kecil', 'Usulan di peta: muara sungai Aurelia, sambungan Mare–teluk.'),
 ('Pelabuhan induk Peratēs', 'Kecil', 'Usulan: ujung semenanjung Culmen.'),
 ('Simpul pasar netral Emporys', 'Besar', 'Usulan: pulau pita Scar di mulut teluk (turunan Culmen).'),
 ('HQ faksi tertutup (Abaton, Liminara, Ordo Lacunae, Ktonia, Kloaka, dkk.)', 'Besar', 'Usulan: Liminara, Ktonia, Kloaka. Abaton & Ordo Lacunae sengaja tidak dipetakan.'),
 ('Teritori Satvan: Pedalaman, Frontier Konsolidasi, + posisi Vasundha', 'Kecil',
  f'Usulan: zona persebaran Satvan Pedalaman (≈{mkm(SV["area_mkm2"], 1)}; bintik tanpa batas, bukan wilayah berdaulat; terhadap The Scar = {SV["scar"]["single"]}, Inferensi AI) dan Vasundha di pedalaman selatan Foedera (tidak digeser). Satvan Perbatasan = knob Terbuka, tidak dipetakan.'),
 ('Kerajaan-kerajaan Interregna individual + medan Kampanye Florian', 'Besar',
  'Peta menggambar mozaik ilustratif: %(K)d kerajaan (termasuk Aventalia & Tarvenna), %(C)d kota merdeka, %(A)d wilayah adat, %(M)d mikro-polity '
  '(+ Cassivalla & Nundina) + front AS 1647. Jumlah, nama, dan batas = knob terbuka.' % IRT.composition()),
 ('Waypoint jalur Economy: Jalur Laut Utama, Jalur Darat, Koridor Xenograft', 'Kecil', 'Usulan: koridor angin Puncak + jalur darat Sutura.'),
 ('Wilayah komunitas Tehari (Pesisir / Sungai Pedalaman / Laut Dalam)', 'Kecil', 'Peta hanya menampilkan bank samudra (lapisan fisik v4: bentuk & posisi Turunan; kaitan ke komunitas Tehari = Inferensi AI).'),
 ('Jaringan wilayah klan Dharên (bawah tanah Ferria)', 'Kecil', 'Hanya Zona Garbhên yang ditandai (turunan).'),
 ('Landmark era awal: situs Tiga Prasasti + medan Perang Erosi', 'Nol', 'Belum ditandai (vertikal, bergantung slot Dharên).'),
 ('HQ Theoria (pusat akademik-arsip)', 'Besar', 'Belum ditandai.'),
 ('HQ Pharmakeia + jaringan fasilitas bedahnya', 'Besar', 'Belum ditandai.'),
 ('Situs religius utama per cluster', 'Kecil', 'Belum ditandai.'),
 ('Segmen akuatik The Scar — dan status Tâmtu terhadapnya', 'Kecil', 'Geometri pita digambar; entri belum ada.'),
]

BANKS = [dict(lat=a, lon=b, r=c) for a, b, c in [(38.0, -96.0, 5.5), (43.0, 28.0, 5.0), (8.0, 118.0, 6.0), (22.0, 160.0, 5.0), (-18.0, 150.0, 5.5), (60.0, -40.0, 5.0)]]

STATS = dict(rhykar=23.002, aeris=14.997, water=62.000, overlay=3.989, width_canon=13.0, width_derived=13.03, hemR=34.964, hemA=65.036,
             corridor='lon −158,9 .. −30,0 (azimut −166,2 .. −30,8)', seed=1647, grid='4096 × 2048 (0,088°/px ≈ 12,7 km/px)',
             aurelia_lon=-8.31, radius_km=round(R_KM), circ_km=round(2 * np.pi * R_KM))

DATA = dict(places=PLACES, anomalies=ANOMALIES, routes=ROUTES, fronts=FRONTS, factions=FACTIONS, unmapped=UNMAPPED, audit=AUDIT,
            ledger=LEDGER, banks=BANKS, stats=STATS, territories=pol['territories'], regions=pol['regions'], mandala=pol['mandala'],
            contours=pol['contours'], thresholds=dict(within=6.5, adjacent=ADJ, peripheral=PER))
json.dump(DATA, open('/home/claude/rhykaris_map/data.json', 'w'), ensure_ascii=False, separators=(',', ':'))
import os
print('data.json', os.path.getsize('/home/claude/rhykaris_map/data.json') // 1024, 'KB')
bad = [(p['name'], p['scar'], p['prox_calc'], p['d']) for p in PLACES if p.get('prox_match') is False]
print('proximity mismatches (non-label):', bad)
print('points in sea:', [(p['name'], p['elev']) for p in PLACES if not p['on_land'] and not p.get('label_only')])
