# -*- coding: utf-8 -*-
"""Rhykaris Master Map — tabel mozaik Interregna (AS 1647), versi 2 (02 Okt 2026).

SATU sumber kebenaran untuk mozaik kedaulatan koridor tengah:
  * src/interregna.py  membaca `POLITIES` (benih, ukuran sasaran, bentuk) dan menggambar ulang batasnya;
  * src/build_data.py  membaca `ir_factions()` (nama, jenis, warna, blurb, baris fakta) untuk data.json.
Nama dan teks lore tiap polity (usulan, 3 Okt 2026) ditulis di src/interregna_lore.py; tabel ini hanya mengimpornya, jadi
`name_of`, `label_of`, `blurb_of`, dan `ir_factions` tetap satu pintu.

Dasar kanon (Atlas — Interregna, Notion; Powers — Interregna):
  * "Mozaik: kerajaan vassal yang keluar saat Era Serpihan, kota merdeka, wilayah adat, mikro-polity." [Turunan]
    -> empat tipe di bawah (K, C, A, M).
  * "belasan-lebih kerajaan kecil bekas vassal ... masing-masing berdaulat" dan "Jumlah & nama kerajaan — sengaja tidak
    dikunci" [Terbuka; knob Master Map]. Jumlah di sini = ILUSTRATIF.
  * Cassivalla (jatuh) -> Tarvenna (di jalur kampanye) -> ... -> Aventalia (masih merasa punya waktu), timur -> barat.
    Front Florian = batas Provincia Cassivallae / Silva Nullius vs TARVENNA -> Tarvenna wajib bersentuhan dengan keduanya
    (dijaga lewat `front=True` + validator). Placeholder baru TIDAK menunjuk siapa yang berikutnya di daftar Florian
    (knob) dan TIDAK menunjuk enklaf Satvan Perbatasan (knob #3) — keduanya tetap Terbuka.

Semua entri kecuali dua jangkar kanon (aventalia, tarvenna; cassivalla & nundina dibekukan di interregna.py) berstatus
[Inferensi AI]: tipe, batas, dan luas = knob terbuka. Sejak 3 Okt 2026 tiap polity juga punya NAMA USULAN (entri Atlas —
Interregna, Draft; Inferensi AI yang disetujui pengarang, belum dikunci) dan ringkasan lore di `interregna_lore.py`. Nama tidak
menyentuh geometri; jumlah polity dan batasnya tetap ilustratif.

Penempatan (derivation-first): kota merdeka di simpul hidrologi terrain kanon (pertemuan sungai, tepi danau); wilayah
adat di bukit tertinggi dataran tinggi dan di pita kaki pegunungan selatan; kerajaan besar di stepa kering tempat penduduk
jarang, kerajaan kecil di lembah sungai utara/barat/tenggara. Koordinat = benih Dijkstra, bukan titik kota (tak ada
marker baru).

Tipe: K kerajaan (bekas vassal) · C kota merdeka · A wilayah adat · M mikro-polity.
Urutan baris = urutan gambar & hit-test di peta (yang kemudian menang): induk dulu, kantong sesudahnya; nomor ir_N naik
mengikuti urutan itu. Kolom:
  seed      (lat, lon) benih pertumbuhan / pusat kantong
  target    luas sasaran, piksel grid 4096 x 2048 (~150 km2/px di lintang ini)
  axis      arah memanjang (bearing, derajat; 0 = utara-selatan) mengikuti lembah / pita kaki gunung
  aniso     0..1, seberapa lonjong
  r_km      ada = KANTONG yang dipotong dari induknya (C, M, A-enklaf); luas dikalibrasi ke `target`
  host      induk yang diharapkan; kantong digeser ke dalam induk supaya benar-benar terkurung (enklaf).
            Tanpa host = kantong bebas: benih sebaiknya di simpang batas; validator menuntut kontak >= 6 px dengan >= 2
            tetangga (label lain atau tepi footprint), jadi teks "berdiri bebas" tak mungkin menyimpang dari geometri
  front     benih tambahan di sepanjang front Florian (Tarvenna)
  exclaves  potongan terpisah milik polity ini, dipotong dari induk lain (host)
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))     # interregna_lore.py duduk di samping berkas ini
from interregna_lore import NAMES, LORE                              # noqa: E402

ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII',
         'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV']
TYPE_NAME = {'K': 'Kerajaan', 'C': 'Kota merdeka', 'A': 'Wilayah adat', 'M': 'Mikro-polity'}    # cadangan bila polity belum bernama
KIND = {
    'K': 'Interregna · kerajaan bekas vassal · nama usulan (Draft) · batas ilustratif',
    'C': 'Interregna · kota merdeka · nama usulan (Draft) · batas ilustratif',
    'A': 'Interregna · wilayah adat Satvan · nama usulan (Draft) · batas ilustratif',
    'M': 'Interregna · mikro-polity · nama usulan (Draft) · batas ilustratif',
}

POLITIES = [
    # ---- jangkar kanon (batas digambar ulang, titik jangkar tetap di dalam) -----------------------------
    dict(id='aventalia', type='K', seed=(-12.5, -7.5), target=2500, axis=100, aniso=0.3),
    dict(id='tarvenna', type='K', seed=(-13.5, -1.8), target=4300, axis=5, aniso=0.5, front=True),
    # ---- tujuh kerajaan ilustratif lama (ID dipertahankan; posisi & ukuran dirancang ulang) ----------------
    dict(id='ir_1', type='K', n=1, seed=(-17.0, -10.2), target=4000, axis=15, aniso=0.4),
    dict(id='ir_2', type='K', n=2, seed=(-20.8, -3.6), target=8000),
    dict(id='ir_3', type='K', n=3, seed=(-22.0, 3.4), target=3600, axis=100, aniso=0.4),
    dict(id='ir_4', type='K', n=4, seed=(-25.6, -9.2), target=5600, axis=40, aniso=0.5),
    dict(id='ir_5', type='K', n=5, seed=(-26.4, -2.6), target=4200, axis=95, aniso=0.5),
    dict(id='ir_6', type='K', n=6, seed=(-25.9, 5.6), target=6200, axis=25, aniso=0.6),
    dict(id='ir_7', type='K', n=7, seed=(-8.6, -2.5), target=1900, axis=10, aniso=0.6),
    # ---- kerajaan baru ---------------------------------------------------------------------------------
    dict(id='ir_8', type='K', n=8, seed=(-16.4, -6.6), target=2300, axis=150, aniso=0.5),
    dict(id='ir_9', type='K', n=9, seed=(-18.6, 0.9), target=900, axis=110, aniso=0.5),
    dict(id='ir_10', type='K', n=10, seed=(-20.9, 7.4), target=1600, axis=20, aniso=0.5),
    dict(id='ir_11', type='K', n=11, seed=(-29.6, -4.6), target=650, axis=90, aniso=0.8),
    # ---- wilayah adat: bukit tertinggi dataran tinggi (enklaf) + pita kaki pegunungan selatan ---------------
    dict(id='ir_12', type='A', n=1, seed=(-24.4, -1.8), r_km=190, target=520, host='ir_5'),
    dict(id='ir_13', type='A', n=2, seed=(-21.1, -5.3), r_km=150, target=330, host='ir_2'),
    dict(id='ir_14', type='A', n=3, seed=(-29.2, 3.2), target=1700, axis=85, aniso=0.7,
         exclaves=[dict(seed=(-27.2, 6.3), target=220, host='ir_6')]),
    # ---- kota merdeka: simpul hidrologi ------------------------------------------------------------------
    dict(id='ir_15', type='C', n=1, seed=(-6.5, -1.7), r_km=70, target=90),
    dict(id='ir_16', type='C', n=2, seed=(-9.6, -3.0), r_km=75, target=60, host='ir_7'),
    dict(id='ir_17', type='C', n=3, seed=(-12.3, 0.1), r_km=75, target=110, host='tarvenna'),
    dict(id='ir_18', type='C', n=4, seed=(-17.97, -12.08), r_km=80, target=130, host='ir_1'),
    dict(id='ir_19', type='C', n=5, seed=(-20.35, 0.31), r_km=75, target=45),     # simpang tiga batas ir_2 / ir_3 / ir_9
    dict(id='ir_20', type='C', n=6, seed=(-28.17, 0.04), r_km=75, target=80, host='ir_5'),
    # ---- mikro-polity -----------------------------------------------------------------------------------
    dict(id='ir_21', type='M', n=1, seed=(-7.9, -0.4), r_km=150, target=260),
    dict(id='ir_22', type='M', n=2, seed=(-23.9, 9.0), r_km=150, target=300),     # simpang ir_6 / ir_10 / tepi timur
    dict(id='ir_23', type='M', n=3, seed=(-21.1, -5.3), r_km=55, target=70, host='ir_13'),
]

# Palet kerajaan Interregna: tujuh warna lama (build_data.py v1) + sembilan baru, semuanya redup agar terbaca di atas terrain.
PALETTE = ['#c9a86a', '#a58fd0', '#d88b6b', '#8fb07a', '#c98fb2', '#7fa4c9', '#b8a27d', '#d4c15a', '#6fb5a6', '#d6788f',
           '#9aa0e0', '#e08f4f', '#8aa3a8', '#b977b8', '#a3c46a', '#7fc2d6']

# Warna per polity (hex). Hasil `python src/interregna.py --colors` (pewarnaan graf: tetangga dan induk-enklaf berjauhan di CIE-Lab,
# juga terhadap Aventalia, Tarvenna, Hesperia, Foedera, Cassivalla, Nundina, Kloaka). Diisi setelah geometri stabil.
COLORS = {
    'ir_1': '#c9a86a', 'ir_2': '#8fb07a', 'ir_3': '#7fa4c9', 'ir_4': '#8aa3a8', 'ir_5': '#d6788f', 'ir_6': '#e08f4f',
    'ir_7': '#d88b6b', 'ir_8': '#c98fb2', 'ir_9': '#a58fd0', 'ir_10': '#b977b8', 'ir_11': '#c9a86a', 'ir_12': '#7fa4c9',
    'ir_13': '#9aa0e0', 'ir_14': '#8fb07a', 'ir_15': '#d4c15a', 'ir_16': '#a58fd0', 'ir_17': '#c98fb2', 'ir_18': '#6fb5a6',
    'ir_19': '#d4c15a', 'ir_20': '#b8a27d', 'ir_21': '#a3c46a', 'ir_22': '#7fc2d6', 'ir_23': '#b8a27d',
}


def name_of(p):
    """Nama polity di peta: usulan Atlas (NAMES). Polity yang belum diberi nama jatuh ke penanda lama "(tak bernama) N"."""
    nm = NAMES.get(p['id'])
    if nm:
        return nm
    return f"{TYPE_NAME[p['type']]} Interregna (tak bernama) {ROMAN[p['n'] - 1]}"


# ------------------------------------------------------------------------------------------------ data faksi (build_data.py)
CANON_ANCHORS = ('aventalia', 'tarvenna')      # entri faksi-nya tetap ditulis tangan di build_data.py


def by_id():
    return {p['id']: p for p in POLITIES}


def label_of(pid):
    if pid == 'aventalia':
        return 'Aventalia'
    if pid == 'tarvenna':
        return 'Tarvenna'
    return name_of(by_id()[pid])


BLURB = {
    'K': 'Salah satu dari "belasan kedaulatan terpisah" [Kanon] — kerajaan kecil bekas vassal yang keluar saat Era Serpihan [Turunan]. '
         'Nama, batas, dan luas = knob terbuka [Inferensi AI]; jumlah di peta ini ilustratif.',
    'C': 'Kota merdeka beserta lahan di sekelilingnya — salah satu bentuk mozaik Interregna [Turunan]. Letaknya di simpul hidrologi terrain '
         '(pertemuan sungai / tepi danau); nama, status, dan batasnya = knob terbuka [Inferensi AI].',
    'A': 'Wilayah adat — tanah klan/suku yang tak pernah tunduk pada satu mahkota [Turunan: tipologi mozaik]. Garis putus-putus = klaim yang '
         'memang kabur; letak, luas, dan penghuninya = knob terbuka [Inferensi AI].',
    'M': 'Mikro-polity — kedaulatan seluas beberapa lembah yang bertahan karena tak menarik bagi tetangga [Turunan: tipologi mozaik]. '
         'Letak, luas, dan statusnya = knob terbuka [Inferensi AI].',
}


def blurb_of(p):
    """Paragraf kartu: ringkasan lore (LORE) + kalimat struktural dari geometri (enklaf, eksklaf, apa yang dikelilingi).
    Polity tanpa entri LORE jatuh ke teks generik per tipe (BLURB)."""
    pid = p['id']
    lore = LORE.get(pid)
    out = lore['blurb'] if lore else BLURB[p['type']]
    host = p.get('host')
    if host:
        hh = by_id().get(host, {}).get('host') if host in by_id() else None
        if hh:
            out += f' Enklaf tingkat dua: dikelilingi {label_of(host)}, yang sendiri dikelilingi {label_of(hh)}.'
        else:
            out += f' Enklaf: seluruh perbatasannya dikelilingi {label_of(host)}.'
    elif 'r_km' in p:
        out += ' Berdiri bebas (bukan enklaf): perbatasannya menyentuh lebih dari satu tetangga atau tepi wilayah Interregna.'
    for e in p.get('exclaves', []):
        out += f' Punya satu eksklaf (potongan terpisah) di dalam {label_of(e["host"])}.'
    holds = [label_of(q['id']) for q in POLITIES if q.get('host') == pid]
    holds += [label_of(q['id']) + ' (eksklaf)' for q in POLITIES for e in q.get('exclaves', []) if e['host'] == pid]
    if holds:
        out += ' Mengelilingi: ' + '; '.join(holds) + '.'
    if lore:
        if p['type'] == 'A':
            out += ' Garis putus-putus = klaim yang memang kabur [Turunan: tipologi mozaik].'
        out += ' Nama usulan; batas dan luas = knob terbuka [Inferensi AI].'
    return out


def ir_factions():
    """Entri FACTIONS untuk semua polity baru/redesain (selain dua jangkar kanon)."""
    out = {}
    for p in POLITIES:
        if p['id'] in CANON_ANCHORS:
            continue
        f = dict(name=name_of(p), kind=KIND[p['type']], color=COLORS[p['id']], epi='inferensi', blurb=blurb_of(p))
        if p['id'] in LORE:
            f['facts'] = [list(r) for r in LORE[p['id']]['facts']]
        if p['type'] == 'A':
            f['dashed'] = True
        out[p['id']] = f
    return out


def composition():
    """Hitungan per tipe (Aventalia & Tarvenna dihitung kerajaan; Cassivalla & Nundina di luar tabel)."""
    c = {'K': 0, 'C': 0, 'A': 0, 'M': 0}
    for p in POLITIES:
        c[p['type']] += 1
    return c
