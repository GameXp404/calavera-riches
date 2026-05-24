---
marp: true
theme: default
paginate: true
size: 16:9
header: 'Cara Membuat Game Calavera Riches'
footer: '© 2026 · Presentasi untuk Audience Awam'
---

<!-- SLIDE 1 — COVER -->

# CALAVERA RICHES

## Cara Membuat Game Slot Modern dari Nol

**Tema:** Day of the Dead (Hari Orang Mati Meksiko)
**Mekanik:** 1024 Cara Menang
**Dibuat dalam:** 4 Hari

---

<!-- SLIDE 2 — APA ITU CALAVERA RICHES? -->

# Kita Mau Bicarakan Apa?

Game slot online tema **Hari Orang Mati Meksiko**, lengkap dengan:

- 5 reel × 4 baris simbol
- 1.024 jalur kemenangan
- Bonus putaran gratis dengan multiplier sampai ×50
- Berjalan di **browser** — tanpa install aplikasi

> **Yang akan dijelaskan hari ini:**
> Bagaimana game ini dibangun dari nol — dari ide sampai bisa dimainkan.

---

<!-- SLIDE 3 — KENAPA TEMA INI? -->

# Kenapa Tema Day of the Dead?

**Strategi pemilihan tema:**

- Pasar global menarik (Meksiko, Amerika Latin, kolektor budaya)
- Visual ikonik: tengkorak gula warna-warni, marigold, mariachi
- Referensi: **Wild Bandito** by PG Soft (game populer dunia)
- Target: bikin versi web yang **100% match** mekanik aslinya

**Analogi:** *Seperti chef baru yang belajar dari resep restoran terkenal, lalu bikin versi sendiri dengan twist.*

---

<!-- SLIDE 4 — ALAT YANG DIPAKAI -->

# Cuma Butuh 5 Alat (Semua GRATIS)

| Alat | Fungsi (bahasa awam) |
|---|---|
| **Vite** | "Pintu masuk" yang nyalain game di browser |
| **PixiJS** | Mesin gambar 2D (kayak Photoshop otomatis) |
| **GSAP** | Tukang animasi gerakan halus |
| **Pollinations AI** | Robot pelukis untuk gambar simbol |
| **ElevenLabs** | Robot pengisi suara untuk "BIG WIN!" |

> **Pesan kunci:** Tanpa modal besar, tanpa tim 50 orang.
> Cukup 5 alat web modern yang semuanya open-source.

---

<!-- SLIDE 5 — TIMELINE 4 HARI -->

# Dibangun dalam 4 Hari Saja

```
Hari 1 (19 Mei) → Bikin OTAK MATEMATIKA game
Hari 2 (20 Mei) → Bikin SIMBOL VISUAL (13 gambar AI)
Hari 3 (21 Mei) → Bikin BACKGROUND & label kemenangan
Hari 4 (22 Mei) → CODE GAMEPLAY + AUDIO + TESTING
```

**Total hasil akhir:**
- 9.431 baris kode
- 19 gambar (~36 MB)
- 19 efek suara
- 2.000.000 simulasi testing

---

<!-- SLIDE 6 — STEP 1: MATEMATIKA DULU -->

# Step 1: Bikin Otak Matematika (Hari 1)

**Fakta mengejutkan:** Game slot itu **80% matematika, 20% tampilan**

Yang dibuat PERTAMA bukan gambar, tapi rumus:

- Berapa hadiah per simbol? (paytable)
- Seberapa sering wild & scatter muncul? (probability)
- Target RTP berapa? → **96,5%** (Return to Player)

**Analogi:** *Chef nentuin resep dulu — berapa gram garam, berapa menit goreng — sebelum mulai masak.*

> **Hanya 105 baris kode** untuk fondasi matematika seluruh game.

---

<!-- SLIDE 7 — STEP 2: GAMBAR PAKAI AI -->

# Step 2: Bikin 19 Gambar Pakai AI (Hari 2-3)

**Dulu:** ilustrator profesional bayar jutaan per gambar
**Sekarang:** ketik kalimat → AI yang lukis dalam 5 menit

**Contoh prompt yang dipakai:**
> *"Day of the dead sugar skull, vibrant marigold, premium slot symbol, 4K"*

**Hasil:**
- 13 simbol dalam 1 jam 14 menit (rata-rata 5,7 menit/gambar)
- 4 label kemenangan (BIG/MEGA/EPIC/LEGENDARY)
- 1 background utama + 1 logo

> AI Pollinations Flux = **gratis** & tanpa watermark.

---

<!-- SLIDE 8 — STEP 3: NULIS KODE GAMEPLAY -->

# Step 3: Code Gameplay (Hari 4) — INTI

Pecah jadi 4 sistem yang saling terhubung:

**1. Reel berputar** — 5 kolom muter dengan animasi bouncing stop
**2. Hitung menang** — cek 1.024 jalur tiap putaran
**3. Fitur bonus** — Free Spin (3 scatter = 12 putaran gratis)
**4. Perayaan menang** — 5 level: Normal → Big → Mega → Epic → **LEGENDARY**

> **Total 5.296 baris kode** ditulis dalam ~1,5 jam pakai bantuan AI assistant.

---

<!-- SLIDE 9 — STEP 4: SUARA HYBRID -->

# Step 4: Sistem Audio Cerdas

**19 efek suara** termasuk voice "Big Win!", suara reel muter, koin jatuh.

**Sistem HYBRID:**
- ✅ Kalau file MP3 ada → pakai itu
- ✅ Kalau file MP3 hilang → sintesis otomatis pakai Web Audio

**Voice announcer:** dibuat pakai **ElevenLabs AI** (free tier 10.000 karakter/bulan)

**Analogi:** *Seperti restoran yang punya backup generator listrik — kalau audio file mati, mesin synthesizer ambil alih. Game nggak crash.*

---

<!-- SLIDE 10 — STEP 5: UI & TAMPILAN -->

# Step 5: Bikin Tampilan Premium

**CSS = 3.513 baris (37% dari total kode)**

6 layar berbeda yang harus dibuat:
- Login screen (dengan marigold petals jatuh)
- Menu utama (dengan papel picado swaying)
- Splash loading
- Game canvas utama
- Admin panel (untuk testing)
- Modal info, paytable, jackpot

> **Pesan kunci:** Game premium bukan cuma gameplay bagus.
> UI/UX yang halus sama pentingnya.

---

<!-- SLIDE 11 — STEP 6: TESTING 2 JUTA KALI -->

# Step 6: Crash-Test 2 Juta Putaran

Bikin **simulator** yang main game otomatis tanpa UI.

**Tujuan:** pastikan RTP sesuai target 96,5%

**Hasil tuning:**

```
Coba divisor 560 → RTP 98,15%  (terlalu boros)
Coba divisor 562 → RTP 96,28%  ✅ TARGET
Coba divisor 565 → RTP 94,84%  (terlalu pelit)
```

**Analogi:** *Seperti pabrik mobil yang crash-test 2 juta kali sebelum dijual.*

> Tanpa testing matematika, game slot bisa bangkrutin kasino atau curangin pemain.

---

<!-- SLIDE 12 — HASIL AKHIR -->

# Hasil Akhir dalam Angka

| Metrik | Angka |
|---|---|
| ⏱️ Waktu development | **4 hari** |
| 📝 Total kode | **9.431 baris** |
| 🎨 Aset gambar | **19 file** |
| 🔊 Aset audio | **19 file** |
| 🎯 RTP final | **96,28%** (validated) |
| 💰 Max win observed | **1.368× taruhan** |
| 🎁 Jackpot rate | 1 dari ~613 putaran |
| 🎪 Free Spin rate | 1 dari ~608 putaran |

---

<!-- SLIDE 13 — 3 PELAJARAN UTAMA -->

# 3 Pelajaran Penting

**1. Mulai dari LOGIKA, bukan tampilan**
Math dulu → baru visual. Game slot adalah rumus matematika berpakaian gambar.

**2. AI mendemokratisasi development**
1 orang sekarang bisa kerjain pekerjaan tim 5–10 orang berkat AI tools.

**3. Testing wajib, bukan opsional**
Apalagi untuk game yang melibatkan uang & probability.

---

<!-- SLIDE 14 — PENUTUP -->

# Terima Kasih

**Calavera Riches**
*Día de los Muertos — 1024 Ways Slot*

Dibuat dengan tools gratis · Versi 1.0.0 · Build 22 Mei 2026

---

## Ada pertanyaan?

Bagian mana yang mau di-zoom in lebih detail?
- Matematika 1024 ways?
- Cara AI generate gambar?
- Sistem audio hybrid?
- Atau live demo gameplay?
