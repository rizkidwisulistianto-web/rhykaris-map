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

C = dict(  # warna faksi (terbaca di atas terrain)
    hesperia='#c0394b', cw='#e08a96', kloaka='#8a8a8a', foedera='#2aa38a', cassivalla='#7fd1bd', liminara='#9b6fd6', ktonia='#9fb6c6', pylora='#d4a76a',
    anabasim='#ff6a2b', emporys='#f5c542', perates='#4f86e8', anusarri='#e6d47a', andura='#4cc3a8', vasundha='#b58a52', nundina='#ffd970',
    tarvenna='#e0a33a', aventalia='#86a8e6', ir='#b99ad6')
FACTIONS = {
 'hesperia': dict(name='Hesperia', kind='Empire · Active · Continental', color=C['hesperia'], epi='inferensi', url=None,
     blurb='Payung Commonwealth yang menyusut; militer terbesar Rhykaris; penjaga standar Fides. Rival: Foedera, Interregna, Anabasim.'),
 'cw_a': dict(name='Vasal Commonwealth (tak bernama) I', kind='Usulan — kerajaan vasal di bawah payung Hesperia', color=C['cw'], epi='inferensi', hatch=True,
     blurb='Commonwealth = konfederasi kerajaan vassal di bawah payung Hesperia. Nama & jumlah = knob [Inferensi AI].'),
 'cw_b': dict(name='Vasal Commonwealth (tak bernama) II', kind='Usulan', color=C['cw'], epi='inferensi', hatch=True, blurb='Idem.'),
 'cw_c': dict(name='Vasal Commonwealth (tak bernama) III', kind='Usulan', color=C['cw'], epi='inferensi', hatch=True, blurb='Idem.'),
 'kloaka': dict(name='Kloaka', kind='Kingdom · Fractured · Local', color=C['kloaka'], epi='inferensi', dashed=True, url=None,
     blurb='Fragmentasi yang stabil — terlalu tidak terorganisir untuk jadi ancaman, terlalu berguna untuk dihancurkan. Posisi = usulan (ledger: "bawah-Aurelia").'),
 'aventalia': dict(name='Aventalia', kind='Interregna · belum tersentuh', color=C['aventalia'], epi='inferensi', url=None, blurb='Front terjauh kampanye Florian; "masih merasa punya waktu".'),
 'tarvenna': dict(name='Tarvenna', kind='Interregna · Contested (panggung Arc 1)', color=C['tarvenna'], epi='inferensi', hatch=True, url=None, blurb='Simpul perlintasan koridor tengah; bekas motor liga defensif yang gagal.'),
 'cassivalla': dict(name='Provincia Cassivallae', kind='Dianeksasi Foedera (~AS 1630-an)', color=C['cassivalla'], epi='inferensi', hatch=True, url=None, blurb='Kerajaan pertama yang ditelan; kini dilabeli ulang dengan tria nomina institusional Foedera.'),
 'nundina': dict(name='Nundina', kind='Kota merdeka', color=C['nundina'], epi='inferensi', url=None, blurb='Pasar spot terbesar koridor; Omneris berkuasa de facto tanpa kursi formal.'),
 'foedera': dict(name='Foedera', kind='Kingdom · Rising · Continental', color=C['foedera'], epi='inferensi', url=None,
     blurb='Koalisi militer lintas ras + Ordo Foederis (akses Sistem II-B via Pharmakeia). Legitimasi: perjanjian (foedus), bukan warisan.'),
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
      body='Hesperia (barat) ↔ mozaik Interregna (selatan kepala teluk) ↔ Foedera (timur teluk) ↔ frontier Lereng Timur ↔ Anabasim. Rute Arc 1 (Sharanya → Silva Nullius → Nundina) memotong tepat di jahitan Foedera–Interregna.', refs='Atlas — Hesperia, Foedera, Interregna'),
]

_KORDER = {'friksi': 0, 'blank': 1, 'pola': 2, 'tutup': 3}
AUDIT.sort(key=lambda a: _KORDER[a['kind']])

LEDGER = [
 ('Portus — kota pelabuhan utama Sinus Adventus', 'Kecil', 'Usulan di peta: muara sungai Aurelia, sambungan Mare–teluk.'),
 ('Pelabuhan induk Peratēs', 'Kecil', 'Usulan: ujung semenanjung Culmen.'),
 ('Simpul pasar netral Emporys', 'Besar', 'Usulan: pulau pita Scar di mulut teluk (turunan Culmen).'),
 ('HQ faksi tertutup (Abaton, Liminara, Ordo Lacunae, Ktonia, Kloaka, dkk.)', 'Besar', 'Usulan: Liminara, Ktonia, Kloaka. Abaton & Ordo Lacunae sengaja tidak dipetakan.'),
 ('Teritori Satvan: Pedalaman, Frontier Konsolidasi, + posisi Vasundha', 'Kecil', 'Usulan: Vasundha di pedalaman selatan Foedera.'),
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

pol = json.load(open('/home/claude/rhykaris_map/politics.json'))
DATA = dict(places=PLACES, anomalies=ANOMALIES, routes=ROUTES, fronts=FRONTS, factions=FACTIONS, unmapped=UNMAPPED, audit=AUDIT,
            ledger=LEDGER, banks=BANKS, stats=STATS, territories=pol['territories'], regions=pol['regions'], mandala=pol['mandala'],
            contours=pol['contours'], thresholds=dict(within=6.5, adjacent=ADJ, peripheral=PER))
json.dump(DATA, open('/home/claude/rhykaris_map/data.json', 'w'), ensure_ascii=False, separators=(',', ':'))
import os
print('data.json', os.path.getsize('/home/claude/rhykaris_map/data.json') // 1024, 'KB')
bad = [(p['name'], p['scar'], p['prox_calc'], p['d']) for p in PLACES if p.get('prox_match') is False]
print('proximity mismatches (non-label):', bad)
print('points in sea:', [(p['name'], p['elev']) for p in PLACES if not p['on_land'] and not p.get('label_only')])
