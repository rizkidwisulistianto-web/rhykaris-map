# -*- coding: utf-8 -*-
"""Rhykaris Master Map — nama dan lore popup polity Interregna (AS 1647). Ditambahkan 3 Okt 2026.

Isi
  NAMES  id polity -> nama di peta (23 polity ilustratif; Aventalia, Tarvenna, Cassivalla, Nundina bukan di sini)
  LORE   id polity -> dict(blurb=..., facts=[[label, epi, teks(, keyakinan)], ...]) untuk kartu faksi di peta

Sumber: 23 entri Atlas (Locations) "Interregna — koridor tengah" di vault Notion, dibuat 3 Okt 2026 dengan Canon Status = Draft.
Nama dan lore itu Inferensi AI yang disetujui pengarang pada hari yang sama, tetapi BELUM dikunci. Karena itu:
  * kartu menandai nama sebagai "nama usulan"; tiap baris membawa status epistemik sesuai label di entri Atlas-nya
    (kanon / turunan / inferensi / terbuka) dan tag [Kanon — sumber] di dalam teks dipertahankan;
  * jumlah polity, batas, dan luas tetap ilustratif (knob Terbuka) — nama tidak mengubah geometri sama sekali;
  * teks ini ringkasan publik: kait cerita dan detail yang di vault masih disimpan tertutup sengaja tidak dimuat;
  * tidak ada kalimat yang menyiratkan perjanjian dengan Satvan (Contradiction #52: pengecualian Satvan struktural lewat
    kategori fauna), tidak ada penunjukan siapa yang berikutnya di daftar Florian (knob), dan bentuk hubungan
    Vicinia–Favilla tetap Terbuka.

Cara mengubah satu nama atau satu teks: sunting di sini, lalu jalankan ulang rantai build
(docs/INTERREGNA_V2_NOTES.md → "Update 3 Okt 2026 — nama"). Tidak ada file lain yang menyimpan nama.
"""

S = 'Sedang'     # keyakinan Inferensi AI
R = 'Rendah'


def _n(teks):
    """Baris "Nama": etimologi nama usulan (selalu Inferensi AI — Sedang)."""
    return ['Nama', 'inferensi', teks, S]


def _t(teks):
    """Baris "Terbuka": knob yang di entri Atlas belum dikunci."""
    return ['Terbuka', 'terbuka', teks]


NAMES = {
    # kerajaan
    'ir_1': 'Vergentia', 'ir_2': 'Latifonda', 'ir_3': 'Secura', 'ir_4': 'Veteria', 'ir_5': 'Ussana', 'ir_6': 'Novalia',
    'ir_7': 'Vicinia', 'ir_8': 'Postera', 'ir_9': 'Perfugia', 'ir_10': 'Terminia', 'ir_11': 'Ultima',
    # wilayah adat Satvan
    'ir_12': 'Sthiragiri', 'ir_13': 'Sandhigiri', 'ir_14': 'Akṣata',
    # kota merdeka
    'ir_15': 'Lustra', 'ir_16': 'Favilla', 'ir_17': 'Conventa', 'ir_18': 'Tabularia', 'ir_19': 'Trevia', 'ir_20': 'Compascua',
    # mikro-polity
    'ir_21': 'Peregrina', 'ir_22': 'Stipendia', 'ir_23': 'Tāladvāra',
}

LORE = {
    # ------------------------------------------------------------------------------------------------ kerajaan
    'ir_1': dict(
        blurb='Kerajaan stepa terendah di koridor dan satu-satunya yang airnya mengalir ke barat: sungai dan dagangnya condong '
              'ke Hesperia, lalu kiblat politiknya ikut miring.',
        facts=[
            _n('Communis dialek vassal, dari vergere: condong, menurun ke arah. Kerajaan yang sungainya, dagangnya, dan kiblat '
               'politiknya miring ke barat — dan belum jatuh ke mana pun.'),
            ['Asal', 'inferensi',
             'Dataran stepa paling rendah di Interregna (±180–480 m), dan satu-satunya kerajaan koridor yang airnya mengalir ke barat, '
             'ke Mare Internum: jalur sungai lalu laut ke heartland Hesperia, yang termurah bagi Commonwealth. Dalam bacaan '
             'jarak-sebagai-ongkos, Vergentia termasuk gelombang terakhir yang keluar dari payung — bukan karena paling setia, tapi '
             'karena paling terjebak secara ekonomis untuk tetap tampak patuh. [Kanon — mekanisme Era Serpihan; penerapan = Inferensi AI]', S],
            ['Cara bertahan', 'inferensi',
             'Masih memasang harga dalam Fides, dan pilihan satuan hitung itu dibaca publik sebagai kiblat [Kanon — Interregna, Jahitan '
             'Moneter]. Dari tiga hitungan kerajaan di jalur kampanye — melawan, bernegosiasi, berlindung ke Hesperia — Vergentia paling '
             'siap untuk yang ketiga [Kanon — Powers Interregna, Internal Factions; posisi Vergentia = Inferensi AI]. Di dalam '
             'wilayahnya berdiri Tabularia, kota berpiagam yang memberi Hesperia pijakan hukum.', S],
            ['Tekanan', 'inferensi',
             'Condong bukan berarti dilindungi. Hesperia belum pernah memutuskan apa pun tentang Foedera tanpa konsensus tiga kubu '
             'Senat [Kanon — Powers Hesperia, Tiga Kubu Internal], dan Vergentia bertaruh pada keputusan yang belum pernah diambil.', S],
            _t('ibukota dan titik peta · kapan persisnya keluar dari payung · skala populasi.'),
        ]),
    'ir_2': dict(
        blurb='Estat penggembalaan kekaisaran yang rumah prokuratornya akhirnya memakai mahkota: kerajaan terluas di koridor, '
              'dan yang paling sedikit ia kuasai dari luas itu.',
        facts=[
            _n('Communis dialek vassal, dari latifundium: estat yang luas. Kerajaan terluas di koridor, dan yang paling sedikit ia '
               'kuasai dari luas itu.'),
            ['Asal', 'inferensi',
             'Di bawah Commonwealth, plato semi-gurun ini bukan kerajaan, tapi estat penggembalaan kekaisaran yang dikelola seorang '
             'prokurator. Ketika laporan tahunan berhenti dikirim dan tidak ada yang bertanya kenapa, rumah prokurator itulah yang '
             'tersisa memerintah — dan lama-lama memakai mahkota. Gelombang keluar: tengah. [Konsisten dengan Era Serpihan: ketaatan '
             'berhenti lewat ketiadaan tindakan, bukan lewat deklarasi]', S],
            ['Cara kerja kekuasaan', 'inferensi',
             'Semi-gurun dan stepa kering 240–900 m, berpenduduk jarang. Mahkota memegang sumur dan pos jalan; klan-klan gembala memegang '
             'sisanya. Ini Era Serpihan dalam skala kecil, terulang di dalam perutnya sendiri: semakin jauh dari sumur istana, semakin '
             'formal kepatuhan itu. Di tengah wilayahnya ada bukit yang tidak bisa ia sentuh — Sandhigiri, dengan gerbang Dharên '
             'Tāladvāra di dalamnya. Latifonda memungut jalan yang menuju ke sana, bukan gerbangnya.', S],
            ['Tekanan', 'inferensi',
             'Luas tanpa kepadatan berarti tidak ada yang layak direbut Florian di sini — untuk sekarang. Yang menggerogoti Latifonda '
             'bukan front, tapi jaraknya sendiri.', S],
            _t('asal estat · nama dinasti · batas kuasa riil mahkota · skala populasi.'),
        ]),
    'ir_3': dict(
        blurb='Kerajaan semi-gurun di selatan Cassivalla yang tetap utuh karena tidak menarik bagi Florian, bukan karena jauh.',
        facts=[
            _n('Communis dialek vassal, dari securus: tanpa cemas. Akarnya se-cura — tanpa kepedulian.'),
            ['Asal', 'inferensi',
             'Semi-gurun 600–780 m di selatan Cassivalla. Gelombang keluar: awal — plato jauh yang mahal dijangkau dari pusat.', S],
            ['Mengapa masih utuh', 'inferensi',
             'Secura berbatasan langsung dengan Cassivalla yang sudah jatuh, dan tetap tidak tersentuh. Kampanye Florian menyusuri simpul '
             'koridor — benteng, perlintasan, jalur dagang — bukan semi-gurun di selatannya [Turunan — Strategic Value Cassivalla dan '
             'Tarvenna]. Secura aman karena tidak menarik, bukan karena jauh: versi kedua dari delusi "masih punya waktu". Aventalia '
             'membaca jarak sebagai jaminan; Secura membaca ketidakpedulian lawan sebagai jaminan. Keduanya membaca hal yang sama dengan '
             'keliru. [Kanon — tipologi posisi Interregna; varian Secura = Inferensi AI]', S],
            ['Tekanan', 'inferensi',
             'Kalau Tarvenna jatuh, koridor yang disusuri Florian tidak lagi berhenti di utara Secura. Dan tetangga timurnya, Terminia, '
             'sudah menghitung dalam Pactum.', S],
            _t('apa yang dihasilkan semi-gurun ini · skala populasi.'),
        ]),
    'ir_4': dict(
        blurb='Keturunan koloni legiun: tradisi militer paling rapi di Interregna, tapi seluruh doktrinnya menghadap ke arah yang salah.',
        facts=[
            _n('Communis dialek vassal, dari veterani: para veteran.'),
            ['Asal', 'inferensi',
             'Lahir dari koloni legiun di tepi plato pedalaman — wilayah yang di sisi Hesperia sekarang dijaga legiun berkomando '
             'terpisah [Kanon — Atlas Hesperia, Sabuk Pedalaman; asal koloni = Inferensi AI]. Ketika gaji dan perintah dari pusat berhenti '
             'datang, para veteran tidak memberontak; mereka cukup tetap tinggal, dan anak-cucu mereka yang kemudian memakai mahkota. '
             'Gelombang keluar: awal.', S],
            ['Doktrin', 'inferensi',
             'Dataran tinggi selatannya, sampai ±1.500 m, adalah benteng alam, dan tradisi kemiliterannya paling rapi di Interregna. '
             'Tapi seluruh doktrin itu menghadap barat — ke legiun pedalaman Hesperia, sekitar tujuh puluh kilometer dari batasnya — dan '
             'ke selatan. Front Florian ada di timur laut, dua kerajaan jauhnya.', S],
            ['Tekanan', 'inferensi',
             'Tentara terbaik koridor tidak punya alasan untuk bergerak sampai semuanya terlambat. Itu pola Interregna, dimampatkan ke '
             'dalam satu kerajaan.', S],
            _t('jumlah pasukan · apakah Veteria pernah menjual tentaranya · skala populasi.'),
        ]),
    'ir_5': dict(
        blurb='Kerajaan oasis di plato selatan dengan nama serapan Satvan: hidup dari air bersama di Compascua dan bertetangga '
              'dengan Satvan di dalam batasnya sendiri.',
        facts=[
            _n('Serapan Communis dari Satvan utsa: mata air (ts menjadi ss). Namanya Satvan, airnya dulu Satvan, dan hukumnya menyebut '
               'Satvan ternak.'),
            ['Asal nama', 'inferensi',
             'Toponimi substrat: nama melekat ke tempat, bukan ke orang. Manusia yang tiba di plato selatan mengikuti air [Kanon — Races '
             'Satvan, 1647 Tahun Erosi], dan yang tahu letak air adalah penghuni sebelumnya. Bunyinya diwarisi lewat register kontak '
             'Perbatasan; artinya tidak, karena tidak ada yang menganggap pemilik kata itu cukup setara untuk ditanya. Lidah native, '
             'terutama Satvan Perbatasan, memang sumber serapan utama Communis [Kanon — Lexicon Communis]; presedennya tar- di '
             'Tarvenna. Satu-satunya nama kerajaan usulan di mozaik ini yang berasal dari serapan Satvan.', S],
            ['Wilayah', 'inferensi',
             'Semi-gurun 600–1.140 m; gelombang keluar: awal. Jantung kerajaan ini adalah oasis Compascua, dan di dalam batasnya berdiri '
             'bukit Satvan, Sthiragiri. Dua kantong itu adalah alasan Ussana ada sekaligus batas kuasanya.', S],
            ['Tekanan', 'inferensi',
             'Klaim pemulihan tanah Satvan yang dibawa Anabasim tidak perlu menyeberangi perbatasan untuk sampai ke Ussana — penerima '
             'klaim itu sudah tinggal di dalamnya. [Kanon — Interregna, Papan Target: klaim Anabasim; penerapan = Inferensi AI]', S],
            _t('siapa di Ussana yang tahu arti namanya · ibukota · skala populasi.'),
        ]),
    'ir_6': dict(
        blurb='Kerajaan lembah sungai tenggara yang masih membuka tanah mengikuti air: takut pada Florian di utara sambil '
              'melakukan hal yang sama ke selatan.',
        facts=[
            _n('Communis dialek vassal, dari novale: tanah bukaan baru. Baru bagi yang membukanya.'),
            ['Asal', 'inferensi',
             'Padang oker dan semi-gurun di tenggara, 240–720 m, dengan satu-satunya sungai permanen di selatan koridor, mengalir ke '
             'arah selatan. Gelombang keluar: awal. Tapi identitas Novalia bukan soal keluar dari payung — melainkan soal maju: ekspansi '
             'manusia di sini masih mengikuti air, persis pola yang menggerus Satvan selama 1647 tahun. [Kanon — Races Satvan, 1647 Tahun '
             'Erosi; penerapan = Inferensi AI]', S],
            ['Front erosi', 'inferensi',
             'Di Novalia, erosi Satvan bukan sejarah, tapi pekerjaan musim ini. Akṣata menempel di selatan, dan satu potongan tanah '
             'Akṣata sudah terkepung penuh oleh Novalia — eksklaf yang tidak pernah diserahkan.', S],
            ['Tekanan', 'inferensi',
             'Kalau klaim pemulihan Anabasim pernah menjadi tindakan, Novalia adalah alamat pertamanya. Kalau Florian berbelok ke selatan '
             'lewat Terminia, Novalia juga alamat berikutnya. Kerajaan ini terjepit di antara dua penagih.', S],
            _t('siapa yang bermukim di lembah sungai · ritme ekspansi · skala populasi.'),
        ]),
    'ir_7': dict(
        blurb='Kerajaan terpadat dan paling bertetangga di Interregna: mengaku pewaris garis Pontifex Kontinuitas dan memeluk '
              'takhtanya, Favilla.',
        facts=[
            _n('Communis dialek vassal: ketetanggaan, kedekatan. Kerajaan yang mendefinisikan diri dari siapa yang dekat dengannya.'),
            ['Asal', 'inferensi',
             'Satu-satunya kerajaan Interregna di sabuk moderat (240–540 m): lembah-lembah sungai yang mengalir ke utara menuju Sinus '
             'Adventus, tanah terpadat di koridor. Dekat Aurelia, dekat pesisir; jalurnya murah, dan karena itu ia termasuk gelombang '
             'terakhir yang keluar dari payung.', S],
            ['Klaim legitimasi', 'inferensi',
             'Klaimnya adalah kedekatan dengan sumber: ia mengaku pewaris garis Pontifex Kontinuitas — keuskupan yang paling dekat dengan '
             'jantung lama Imperium — dan memeluk takhtanya, Favilla. [Bersandar pada Blok Kontinuitas di Perang Para Pontifex, yang '
             'sendiri Inferensi]', S],
            ['Delapan tetangga', 'inferensi',
             'Hesperia, Foedera, Kloaka, Tarvenna, Aventalia, ditambah tiga kantong berdaulat: Favilla, Lustra, Peregrina. Kerajaan '
             'paling bertetangga di mozaik, dan karena itu yang paling banyak harus ditenangkan.', S],
            ['Tekanan', 'inferensi',
             'Di peta, Litus Primum — pantai pendaratan AS 0, sumber yang diklaim Vicinia — jatuh di dalam klaim Foedera [Inferensi AI — '
             'poligon peta v1.7.0]. Legitimasi Vicinia berjangkar di pantai yang ada di dalam klaim Foedera, dan jalan ke sana melewati '
             'Peregrina.', S],
            _t('bentuk hubungan Vicinia–Favilla · ibukota · skala populasi.'),
        ]),
    'ir_8': dict(
        blurb='Kerajaan stepa di belakang Aventalia yang menolak liga pertahanan Tarvenna — dan merasa berdiri di belakang front yang '
              'sebenarnya berbatasan langsung dengannya.',
        facts=[
            _n('Communis dialek vassal, dari posterus: yang di belakang, yang menyusul; posteri: anak-cucu. Namanya dulu janji pada '
               'keturunan; kini terbaca sebagai lokasi.'),
            ['Asal', 'inferensi',
             'Stepa oker 420–840 m di antara Aventalia, Vergentia, Latifonda, dan Tarvenna. Gelombang keluar: tengah.', S],
            ['Penolak liga', 'inferensi',
             'Ketika Tarvenna merintis liga pertahanan, Postera menolak dengan argumen paling jujur di antara semua penolak: liga adalah '
             'payung, dan Postera ada justru karena menolak payung. Argumen itu benar, dan justru kebenarannya yang membuat Interregna '
             'bisa ditelan satu per satu. [Kanon — liga Tarvenna ditolak tetangganya; argumen Postera = Inferensi AI]', S],
            ['Tekanan', 'inferensi',
             'Postera merasa berdiri di belakang front. Padahal ia berbatasan langsung dengan Tarvenna: kalau Tarvenna jatuh, Postera '
             'bukan barisan kedua — ia garis depan yang baru.', S],
            _t('siapa yang bicara atas nama Postera saat liga ditolak · urutan sasaran Florian setelah Tarvenna · skala populasi.'),
        ]),
    'ir_9': dict(
        blurb='Kerajaan kecil di selatan Tarvenna yang menampung bagian terbesar diaspora Cassivalla; mitos tempat berlindungnya '
              'kini menjadi beban sekaligus provokasi.',
        facts=[
            _n('Communis dialek vassal, dari perfugium: tempat berlindung. Kanselarei Hesperia menulisnya Perfuga — pembelot. Hinaan '
               'satu huruf.'),
            ['Asal', 'inferensi',
             'Kecil (±138 rb km²), semi-gurun 660–840 m, terjepit di antara Tarvenna, Latifonda, Secura, dan Cassivalla. Mitos '
             'pendiriannya: tempat lari orang-orang yang menerima dua surat ekskomunikasi dalam satu musim, di masa para Pontifex saling '
             'mengutuk — klaim pendirian, bukan historiografi. Gelombang keluar: tengah.', R],
            ['Perlindungan sebagai provokasi', 'inferensi',
             'Sisa penduduk Cassivalla menjadi diaspora ke kerajaan Interregna lain [Kanon — Atlas Cassivalla], dan Perfugia, tetangga '
             'terdekatnya, menampung bagian terbesar [Inferensi AI]. Menampung pengungsi dari kerajaan yang dicaplok berarti menampung '
             'saksi, keluhan, dan mungkin seorang penuntut takhta.', S],
            ['Tekanan', 'inferensi',
             'Pangan dan air semi-gurun tidak bertambah karena pengungsi datang. Dan Florian tidak bisa membiarkan klaim Cassivalla tetap '
             'hidup di sebelah wilayah caplokannya selamanya.', S],
            _t('apakah ada penuntut takhta Cassivalla di Perfugia · jumlah pengungsi · skala populasi.'),
        ]),
    'ir_10': dict(
        blurb='Kerajaan sisi timur, bekas penanda marka timur Commonwealth, yang sudah memasang harga dalam Pactum.',
        facts=[
            _n('Communis dialek vassal, dari terminus: batu batas, dan dewa penjaganya.'),
            ['Asal', 'inferensi',
             'Semi-gurun 540–780 m di sisi timur mozaik, bekas penanda marka timur Commonwealth: tempat payung lama berakhir. Gelombang '
             'keluar: awal.', S],
            ['Aneksasi lewat buku besar', 'inferensi',
             'Berbatasan dengan Cassivalla dan paling dekat ke Foedera selatan, Terminia sudah memasang harga dalam Pactum. Pilihan satuan '
             'hitung adalah sinyal kiblat yang dibaca publik [Kanon — Interregna, Jahitan Moneter]; bagi Terminia, sinyal itu sudah '
             'terkirim. Aneksasinya mungkin tidak datang lewat legiun, tapi lewat utang yang tercatat dalam Pactum. [Inferensi AI]', S],
            ['Tekanan', 'inferensi',
             'Batu batas yang dulu menandai ujung payung lama kini menandai awal kekuasaan yang lain — tanpa bergeser satu langkah pun.', S],
            _t('seberapa dalam kreditor Foedera di Terminia · skala populasi.'),
        ]),
    'ir_11': dict(
        blurb='Kerajaan terkecil dan tertinggi di Interregna: paling jauh dari pusat, paling lama merdeka, dan belum tahu apakah ia '
              'kuat atau cuma jauh.',
        facts=[
            _n('Communis dialek vassal, dari ultimus: yang terjauh.'),
            ['Asal', 'inferensi',
             'Kerajaan terkecil (±93 rb km²) dan tertinggi (900–1.380 m) di Interregna, di dataran tinggi kasar tepi selatan. Paling '
             'mahal dijangkau dari pusat — dan karena itu yang pertama berhenti mengirim laporan. Yang terjauh keluar duluan: mekanisme '
             'Era Serpihan dalam bentuknya yang paling bersih. [Kanon — Era Serpihan; Ultima sebagai instans = Inferensi AI]', S],
            ['Kehidupan', 'inferensi',
             'Medan patah, sedikit tanah datar, tetangga cuma dua: Ussana dan Veteria. Ultima tidak ikut politik koridor bukan karena '
             'netral, tapi karena tidak ada yang sampai.', S],
            ['Tekanan', 'inferensi',
             'Kerajaan yang paling lama merdeka adalah yang paling sedikit diuji kemerdekaannya. Ia belum tahu apakah ia kuat, atau cuma '
             'jauh.', S],
            _t('hubungan dengan Satvan di dataran tinggi selatan · skala populasi.'),
        ]),
    # ------------------------------------------------------------------------------------------------ wilayah adat Satvan
    'ir_12': dict(
        blurb='Bukit Satvan: sisa tanah Satvan di plato yang bertahan karena terlalu mahal direbut, dan jangkar klaim pemulihan '
              'Anabasim di dalam Interregna.',
        facts=[
            _n('Satvan, sthira (teguh, tak bergeser) + giri (bukit). Label kartografi manusia untuk tanah seperti ini: ager '
               'arcifinius — tanah berbatas alam yang tidak pernah diukur.'),
            ['Kenapa bukit', 'turunan',
             'Perang Erosi dimenangkan formasi Romawi-analog di tanah terbuka, bukan oleh kekuatan individu [Kanon — Races Satvan, Origin '
             'Story]. Di medan patah, formasi kehilangan keunggulannya, dan mobilitas kuadrupedal Satvan menang [Kanon — Races Satvan, '
             'Physical Traits]. Sisa tanah Satvan di plato bertahan persis di bukit-bukit seperti ini: bukan karena tidak diinginkan, tapi '
             'karena terlalu mahal direbut.'],
            ['Penghuni', 'inferensi',
             'Enklaf di dalam Ussana. Garisnya bermassa besar — paling lambat pulih dari kehilangan, dan karena itu paling condong ke '
             'konsolidasi Anabasim [Inferensi AI, dari Reproduction Mode Satvan]. Kontak harian dengan manusia lewat air bersama di '
             'Compascua menjadikannya komunitas Perbatasan menurut aksis persebaran [Turunan — Races Satvan, Internal Variation].', S],
            ['Tekanan', 'inferensi',
             'Jangkar konkret klaim pemulihan Anabasim di dalam Interregna [Kanon — Interregna, Papan Target; penerapan = Inferensi AI]. '
             'Satu-satunya tawaran yang pernah datang untuk membalik 1647 tahun erosi datang dari Birath — dan garis yang paling lambat '
             'pulih punya paling sedikit waktu untuk menolaknya.', S],
            ['Bukan', 'terbuka',
             'Bukan enklaf kurir Satvan Perbatasan (knob #3 Interregna, Terbuka): jaraknya ±1.600 km dari Silva Nullius. Peta tidak '
             'menyamakan keduanya.'],
            _t('bentuk garis persis · sikap komunitas terhadap Anabasim (condong belum berarti bergabung) · skala populasi.'),
        ]),
    'ir_13': dict(
        blurb='Bukit Satvan yang memeluk gerbang Tāladvāra: zona kontak Dharên–Satvan yang masih hidup, bernilai justru karena '
              'tidak diperhatikan.',
        facts=[
            _n('Satvan, sandhi (sambungan, pertemuan) + giri (bukit).'),
            ['Posisi', 'inferensi',
             'Enklaf bukit di tengah Latifonda, dan memeluk Tāladvāra di dalamnya: enklaf bersarang. Urutan wadahnya adalah urutan '
             'kedatangan, dibaca seperti stratigrafi — Dharên di dalam Satvan di dalam manusia.', S],
            ['Zona kontak', 'inferensi',
             'Persilangan Dharên×Satvan yang melahirkan garis Urdhai baru terjadi di zona kontak Dharên Permukaan atau Gunung dengan '
             'garis Satvan permukaan, dan makin jarang karena erosi Satvan menyusutkan zona kontak itu sendiri [Kanon — Races Urdhai, '
             'Reproduction Mode]. Sandhigiri adalah salah satu zona kontak yang masih hidup — mungkin salah satu yang terakhir [Inferensi '
             'AI].', S],
            ['Memilih diam', 'inferensi',
             'Nilai Sandhigiri bergantung pada tidak diperhatikan. Manusia butuh melintasi tanahnya untuk sampai ke gerbang logam '
             'Tāladvāra, dan itu memberinya posisi tawar tanpa pernah perlu bersuara. Komunitas ini tidak condong ke Anabasim maupun ke '
             'siapa pun: menunggu dan melihat arah angin. [Kanon — Races Satvan, posisi komunitas perbatasan; penerapan = Inferensi AI]', S],
            ['Bukan', 'terbuka',
             'Bukan enklaf kurir Satvan Perbatasan (knob #3 Interregna, Terbuka). Peta tidak menyamakan keduanya.'],
            _t('garis bentuk yang tinggal di sini · kapan garis Urdhai terakhir lahir di sini · skala populasi.'),
        ]),
    'ir_14': dict(
        blurb='Tanah Satvan konservatif di tepi selatan mozaik, tempat erosi Satvan paling terbaca di peta — satu-satunya eksklaf '
              'di Interregna.',
        facts=[
            _n('Satvan register konservatif: utuh, tak terpecah (juga butir beras utuh dalam ritus). Tanah bernama utuh yang terbelah '
               'dua.'),
            ['Posisi', 'inferensi',
             'Pita di tepi selatan mozaik, bertetangga dengan Novalia dan Ussana. Satu potongannya terpisah dan terkepung penuh di dalam '
             'Novalia: eksklaf satu-satunya di Interregna. Akṣata bukan tepi zona persebaran Satvan Pedalaman — di peta, zona itu '
             'terletak sekitar seribu kilometer lebih ke selatan.', S],
            ['Kemurnian di tempat yang salah', 'inferensi',
             'Satvan Pedalaman menjaga kemurnian lewat jarak. Akṣata menjaga kemurnian yang sama tanpa jarak: kontak dengan manusia '
             'diminimalkan secara prinsip, tanah tidak diserahkan dan tidak dinegosiasikan — di tempat yang justru paling tidak '
             'memungkinkannya. [Turunan — nilai dan tabu Satvan Pedalaman; posisi Akṣata = Inferensi AI]', S],
            ['Eksklaf sebagai fosil erosi', 'inferensi',
             'Potongan di dalam Novalia adalah tanah satu garis yang dikepung ketika permukiman Novalia mengikuti sungai ke selatan. Ia '
             'tidak pernah diserahkan; Novalia cukup mengalir di sekelilingnya. Erosi Satvan selama 1647 tahun, tanpa satu pun kebijakan '
             'pengusiran [Kanon — Races Satvan], terlihat di sini dalam bentuk peta.', S],
            _t('posisi pada aksis persebaran (doktrin Pedalaman di letak kontak) · agama · garis bentuk · skala populasi.'),
        ]),
    # ------------------------------------------------------------------------------------------------ kota merdeka
    'ir_15': dict(
        blurb='Kota merdeka kecil di hulu pesisir Kloaka tempat barang dan dokumen dari Kloaka masuk kembali ke legalitas — hidup '
              'dari segel yang cukup bersih.',
        facts=[
            _n('Communis, dari lustrum: ritus penyucian — dan juga lustra, sarang binatang. Dua arti, satu kota.'),
            ['Cara bertahan', 'inferensi',
             'Kloaka adalah zona tempat badge Omneris tidak diakui dan dokumen Venditarii tidak perlu diverifikasi [Kanon — Powers '
             'Kloaka]. Barang dan surat yang keluar dari sana tidak bisa dipakai di pasar yang sah — kecuali melewati yurisdiksi yang '
             'segelnya diakui pengadilan lain. Lustra adalah yurisdiksi itu: di sini barang Kloaka masuk kembali ke legalitas. Hukum yang '
             'tidak konsisten antar-yurisdiksi adalah warisan Era Serpihan yang paling menguntungkan siapa pun yang tahu cara '
             'membacanya. [Kanon — Era Serpihan, Long-term Consequence; peran Lustra = Inferensi AI]', S],
            ['Tekanan', 'inferensi',
             'Omneris menolak membuka meja verifikasi di sini: memverifikasi barang yang dicuci adalah kegagalan yang mereka takutkan '
             'tentang diri sendiri [Kanon — Omneris, Failure Mode; penerapan = Inferensi AI]. Kota ini hidup dari kepercayaan semua orang '
             'bahwa segelnya cukup bersih — sementara semua orang tahu dari mana barangnya datang.', S],
            _t('siapa pemegang segel kota · hubungan dengan bangsawan pembeking Kloaka · skala populasi.'),
        ]),
    'ir_16': dict(
        blurb='Kota takhta seorang Pontifex garis Kontinuitas: kemerdekaan sakral yang bergantung pada raja yang ia berkati.',
        facts=[
            _n('Communis: bara; juga abu yang masih menyimpan panas. Kota yang mengaku menjaga api yang tak pernah padam — dengan nama '
               'yang berarti sisa pembakaran.'),
            ['Klaim', 'inferensi',
             'Takhta seorang Pontifex garis Kontinuitas. Kuilnya mengaku api altarnya disulut dari bara Flamma Infracta yang tak terputus '
             'sejak sebelum fragmentasi — klaim yang tidak bisa dibuktikan maupun dibantah, karena tidak ada satu api pun yang pernah '
             'dicatat sebagai titik rujukan. [Turunan — mekanisme silsilah api di Perang Para Pontifex (Inferensi Sedang di entri itu); '
             'Favilla sebagai pemegangnya = Inferensi AI]', S],
            ['Cara bertahan', 'inferensi',
             'Raja Vicinia butuh pemberkatan Pontifex atas mahkotanya [Kanon — Cultus Perpetuus, Pemberkatan Kekuasaan]. Menelan Favilla '
             'berarti mengubah pemberkatan menjadi pernyataan diri sendiri — dan pemberkatan yang diberikan oleh tawanan tidak memberkati '
             'apa pun. Logikanya sama dengan Nundina: merebutnya membunuh apa yang membuatnya berharga.', S],
            ['Tekanan', 'inferensi',
             'Theologia Foederis tumbuh bersama Foedera [Kanon — Religions & Doctrines]. Kalau Vicinia jatuh, Favilla akan menjadi entah '
             'alat Florian, entah saksi yang harus dibungkam.', S],
            _t('nama Pontifex · apakah Favilla diakui Pontifex lain · bentuk hubungan Vicinia–Favilla · skala populasi.'),
        ]),
    'ir_17': dict(
        blurb='Kota netral di tepi danau: bekas kursi liga pertahanan yang tidak pernah bersidang, dengan piagam netral yang tetap '
              'berlaku.',
        facts=[
            _n('Communis, dari conventus (berkumpul) dan conventa: hal-hal yang disepakati.'),
            ['Asal', 'inferensi',
             'Tanah di tepi danau — salah satu dari sedikit perairan tetap di stepa koridor — yang dilepas Tarvenna dari kedaulatannya '
             'sendiri untuk menjadi kursi netral liga pertahanan yang ia rintis: tanda kesungguhan bagi tetangga yang diminta bergabung, '
             'seperti Delos bagi liga kota-kota Yunani. Liganya tidak pernah bersidang. Tetangganya menolak, masing-masing merasa masih '
             'punya waktu. [Kanon — Atlas Tarvenna; Conventa sebagai kursi = Inferensi AI]', S],
            ['Piagam', 'inferensi',
             'Piagam netralnya tetap berlaku, karena mencabutnya berarti mengakui liga itu mati. Satu-satunya tanah netral di dalam '
             'Tarvenna.', S],
            _t('siapa pengelola piagam · kapan liga dirintis · skala populasi.'),
        ]),
    'ir_18': dict(
        blurb='Kota berpiagam di kepala navigasi sungai: hidup dari kertas yang dikeluarkan kekuasaan yang sudah tidak '
              'memerintahnya.',
        facts=[
            _n('Communis, dari tabularium: kantor arsip publik. Kota yang hidup dari kertas yang dikeluarkan kekuasaan yang sudah tidak '
               'memerintahnya.'),
            ['Posisi', 'inferensi',
             'Di pertemuan sungai yang mengalir ke barat menuju Mare Internum — kepala navigasi tempat muatan darat berpindah ke '
             'perahu.', S],
            ['Asal', 'inferensi',
             'Simpul air dan jalan adalah jangkar yurisdiksi Commonwealth [Kanon — Canon Index #215]. Tabularia memegang piagam municipium '
             'dari masa itu, dan piagam itu tidak pernah dicabut — tidak ada yang mencabut, karena tidak ada lagi yang mengirim surat. '
             'Ketika Vergentia berhenti patuh, kota berpiagam di dalamnya tetap memegang hak-haknya sendiri. Municipium berpiagam, bukan '
             'provinsi [Kanon — Canon Index #214, kosakata]. [Konsisten dengan Era Serpihan]', S],
            ['Pijakan Hesperia', 'inferensi',
             'Bagi Hesperia, melindungi kota berpiagam adalah kewajiban lama, bukan keputusan baru: pijakan hukum di dalam Interregna.', S],
            _t('isi piagam · siapa yang menjaga arsip · skala populasi.'),
        ]),
    'ir_19': dict(
        blurb='Kota oasis terkecil di Interregna, di simpang tiga kerajaan: merdeka lewat veto bersama tetangga-tetangganya.',
        facts=[
            _n('Communis, dari trivium: tempat tiga jalan bertemu (akar yang sama dengan Trevi).'),
            ['Cara bertahan', 'inferensi',
             'Kota oasis terkecil di Interregna, di semi-gurun tepat di titik temu Latifonda, Secura, dan Perfugia — simpul karavan jalur '
             'utara–selatan dari Tarvenna menuju plato selatan. Masing-masing dari tiga tetangga bisa merebutnya dalam sehari, dan dua yang '
             'lain tidak akan membiarkannya. Kemerdekaan lewat veto bersama — kesepakatan paling stabil di Interregna justru karena tidak '
             'ada yang pernah menyepakatinya.', S],
            ['Tekanan', 'inferensi',
             'Perfugia makin penuh pengungsi Cassivalla. Kalau satu dari tiga tetangga runtuh atau dicaplok, veto tiga arah itu berubah '
             'menjadi undangan.', S],
            _t('sumber air (mata air atau sumur) · jalur karavan persis · skala populasi.'),
        ]),
    'ir_20': dict(
        blurb='Kota oasis, korporasi para pemakai airnya: air yang dipakai manusia dan Satvan Sthiragiri, dengan hukum yang hanya '
              'mencatat yang kedua sebagai ternak.',
        facts=[
            _n('Communis, dari ager compascuus: padang gembala yang dipakai bersama.'),
            ['Cara bertahan', 'inferensi',
             'Dalam hukum Commonwealth, tanah bersama milik para penggunanya, bukan milik mahkota. Karena itu Ussana tidak memiliki '
             'Compascua: kota ini adalah korporasi para pemakai airnya. Air ini sudah dipakai bersama sejak sebelum ada mahkota — oleh '
             'manusia, dan oleh Satvan dari Sthiragiri.', S],
            ['Pemakai Satvan', 'turunan',
             'Tidak ada perjanjian yang pernah ditulis dengan Satvan, karena tidak ada institusi manusia yang pernah memperlakukan Satvan '
             'sebagai pribadi [Kanon — Races Satvan; Contradiction #52]. Hukum manusia mencatat pemakaian itu dengan satu-satunya kategori '
             'yang tersedia: hak minum ternak [Turunan — pengecualian Satvan sebagai fauna].'],
            ['Tekanan', 'inferensi',
             'Pengguna yang tidak dihitung tetap minum. Kalau Sthiragiri bergerak bersama Anabasim, kota ini yang pertama harus '
             'memutuskan apakah ternak boleh punya pendapat.', S],
            _t('aturan jadwal pakai air · komposisi korporasi pengguna · skala populasi.'),
        ]),
    # ------------------------------------------------------------------------------------------------ mikro-polity
    'ir_21': dict(
        blurb='Mikro-polity penjaga ruas non-Foedera terakhir dari jalan ziarah ke Litus Primum: bertahan karena semua pihak butuh '
              'jalan itu tetap terbuka.',
        facts=[
            _n('Communis, dari peregrinus: pelancong — dan, dalam hukum lama, orang asing tanpa kewargaan.'),
            ['Jalan ziarah', 'inferensi',
             'Litus Primum, pantai pendaratan AS 0, adalah situs ziarah identitas manusia [Turunan — Atlas Litus Primum]. Di peta, pantai '
             'itu jatuh di dalam klaim Foedera [Inferensi AI — poligon peta v1.7.0]. Peregrina memegang ruas non-Foedera terakhir dari '
             'jalan ziarahnya: penginapan, pos air, dan hak lintas.', S],
            ['Cara bertahan', 'inferensi',
             'Semua pihak butuh jalan itu tetap terbuka. Foedera butuh peziarah datang demi narasi persatuan yang ia jual; Vicinia butuh '
             'mereka sampai karena klaim Kontinuitasnya bersandar pada sumber yang sama. Merebut Peregrina berarti mengambil alih '
             'tanggung jawab atas jalan yang tidak boleh terlihat tertutup.', S],
            _t('institusi penjaga Litus Primum tetap Terbuka di entri Litus Primum — Peregrina tidak menjawabnya · skala populasi.'),
        ]),
    'ir_22': dict(
        blurb='Mikro-polity bekas kompi bayaran di sudut tenggara — satu-satunya tentara sewaan berdaulat di koridor.',
        facts=[
            _n('Communis, dari stipendium: gaji prajurit — dan upeti yang ditarik dari yang ditaklukkan.'),
            ['Asal', 'inferensi', 'Kompi bayaran yang pernah digaji dengan tanah, lalu tidak pernah pergi.', S],
            ['Celah yang ditinggalkan Omneris', 'turunan',
             'Omneris menyerap pengawalan konvoi, keamanan, dan hampir semua kerja berbayar [Kanon — Omneris, Public Agenda], tapi tidak '
             'bisa berperang di pihak siapa pun: capture politis adalah failure mode yang mereka tulis sendiri [Kanon — Omneris, Failure '
             'Mode]. Interregna tidak punya pertahanan kolektif [Kanon — Powers Interregna]. Stipendia hidup di celah antara dua fakta '
             'itu: perang untuk disewa, di mozaik yang tidak sanggup membiayai tentaranya sendiri.'],
            ['Tekanan', 'inferensi',
             'Rumornya, Stipendia terikat kontrak dengan dua sisi sekaligus. Kompi yang bisa disewa siapa saja juga bisa disewa Florian '
             'untuk menjaga tanah yang sudah ia caplok.', R],
            _t('siapa klien saat ini · ukuran kompi · asal tanah gaji · skala populasi.'),
        ]),
    'ir_23': dict(
        blurb='Gerbang permukaan Dharên dan pasar logam plato, di puncak bukit.',
        facts=[
            _n('Dharên, tāla (lantai, permukaan) + dvāra (pintu): pintu lantai. Nama tempat, bukan nama klan.'),
            ['Posisi', 'turunan',
             'Enklaf bersarang: di dalam Sandhigiri, yang sendiri di dalam Latifonda, di puncak bukit. Luas permukaannya adalah bayangan '
             'galeri di bawahnya, bukan luas kota — penanda permukaan Dharên hanya proyeksi wilayah vertikal [Turunan — preseden Zona '
             'Garbhên].'],
            ['Fungsi', 'inferensi',
             'Gerbang tempat Dharên naik dan berurusan dengan dunia atas. Basis ekonomi Dharên adalah logam — besi, tembaga, emas — dan '
             'keahlian yang disewakan ke semua pihak [Kanon — Sociocultural Klan Dharen; Races Dharên]. Di plato kering, Tāladvāra adalah '
             'pasar logam. Latifonda memungut jalan menuju ke sana tapi tidak menyentuh gerbangnya, karena setiap kerajaan menyewa '
             'keahlian yang keluar dari pintu itu [Inferensi AI]. Ia juga titik tempat Dharên Gunung atau Permukaan bersentuhan dengan '
             'garis Satvan Sandhigiri — zona kontak tempat garis Urdhai baru masih bisa lahir [Kanon — Races Urdhai; penerapan = '
             'Inferensi AI].', S],
            _t('kedalaman galeri · komposisi klan dan varian di bawahnya · skala populasi.'),
        ]),
}
