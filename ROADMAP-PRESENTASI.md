# 🎰 CALAVERA RICHES — SLOT GAME

**Mexican Day of the Dead · 1024-Ways Tumble Slot · PixiJS + Vite**

---

## 📊 STATISTIK PROYEK

| Metrik | Value |
|---|---|
| **Total tahap** | 13 (8 SELESAI · 1 JALAN · 4 BELUM) |
| **Source code** | 6.221 baris JavaScript |
| **File asset** | 48 file (PNG + WAV + MP4) |
| **Audio** | 13 synth + 17 sample + 4 voice = **34 file** |
| **RTP** | 96,6% (kalibrasi 2 juta spin) |
| **Live** | https://calaverariche.netlify.app |
| **Tech stack** | PixiJS 7.4.2 + Vite 5 + GSAP 3.12.5 + Web Audio API |

---

# ✅ FASE SUDAH SELESAI (8 tahap)

---

## 💡 STEP 1 — Ide & Konsep Awal

**Status:** ✅ SELESAI

Memutuskan tema "Mexican Day of the Dead" (Hari Orang Mati Meksiko) dengan mekanisme 1024 cara menang. Terinspirasi Wild Bandito tapi semua asset orisinal.

**📋 BAHAN:**
- Riset slot game referensi (Wild Bandito, Sweet Bonanza, Gates of Olympus)
- Mood board: skull, marigold, mariachi, papel picado
- Spek teknis target: HP A06, iPhone, PC
- Math model: RTP 96,6%, max win 5000×

**🎯 OUTPUT:** Dokumen spek lengkap (judul, tema, mekanisme, target).

---

## ⚙️ STEP 2 — Pondasi Teknis

**Status:** ✅ SELESAI

Memasang sistem dasar + membuat "otak" game.

**📋 BAHAN:**
- **PixiJS 7.4.2** — gambar 2D WebGL
- **Vite 5** — build tool cepat
- **GSAP 3.12.5** — animasi mulus
- **Web Audio API** — suara native browser
- Math engine 1024-ways evaluator
- Headless RTP simulator (2 juta spin)

**🛠️ TECH STACK:** vanilla JS, ES modules, no framework. 10 file source code total.

**🎯 OUTPUT:** Mesin matematika kalibrasi RTP 96,6% terbukti via simulasi.

---

## 🎨 STEP 3 — Membuat Tampilan

**Status:** ✅ SELESAI

10 simbol orisinal + latar belakang + bingkai banner.

**📋 BAHAN ASET:**
- **Pollinations Flux AI** (free image generator) — prompt: "mexican sugar skull dia de los muertos digital art"
- **10 PNG simbol:**
  - Sugar Skull (mid tier)
  - Mariachi (high tier — top pay 50/25/10)
  - Gitar (high tier 40/20/8)
  - Maracas (mid tier 15/10/5)
  - Catrina (WILD substitute, no payout)
  - Coffin (SCATTER, animasi video 960×960 24fps 5 detik)
- **5 huruf:** A, K, Q, J, 10
- **Latar belakang:** cemetery night scene
- **Bingkai:** bandit portrait full frame

**🎯 OUTPUT:** 11 simbol + 1 video + 2 background. Semua orisinal anti-IP infringement.

---

## 🎵 STEP 4 — Sistem Audio Berlapis

**Status:** ✅ SELESAI

Audio dibuat 3 lapis: synth, sample, voice.

**📋 BAHAN AUDIO:**
- **13 synth procedural** (Web Audio API):
  - spinStart, reelWhoosh, reelStop
  - cascadePop, winHighlight
  - scatterLand, anticipation
  - winSmall, winBig, winEpic, winLegendary
  - coinTick, multBump
- **17 sample MP3/WAV** dari Mixkit + Freesound (CC0 lisensi gratis)
- **4 layer cascade music** berlapis per cascade iter:
  - L1: kick drum
  - L2: tamborin
  - L3: trompet brass stab
  - L4: cymbal swell + choir
- **D-minor BPM 100** dedicated free spin music
- **4 voice cheer:** voice_big_win, voice_mega_win, voice_epic_win, voice_legendary_win (4.13s)

**🎯 OUTPUT:** 34 audio file terintegrasi.

---

## ✨ STEP 5 — Sentuhan Premium AAA

**Status:** ✅ SELESAI

Detail yang bikin terasa game kelas atas (Wild Bandito setara).

**📋 BAHAN POLISH:**
- **F1 Coin shower:** 20/35/55/90 koin per tier (BIG → LEGENDARY)
- **F2 Confetti papel picado:** 30/60/100/180 lembar 6 warna
- **F3 Label entrance:** backspin -π/2 sampai -2π rotation
- **F4 Camera shake:** 4px → 20px per tier (+ tremor LEGENDARY)
- **F5 Sparkle trails** di counter (50-180ms interval)
- **Gold-Framed Symbols:** signature PG Wild Bandito. 18% chance per cell reel 2-4, max 3/spin. Gold menang → convert WILD
- **Tombol Spin:** gradien emas + shimmer band 3s loop

**🎯 OUTPUT:** Feel game premium AAA, setara PG Soft.

---

## 📱 STEP 6 — Dukungan Semua Perangkat

**Status:** ✅ SELESAI

Game auto-adapt ke device pemain.

**📋 BAHAN COMPAT:**
- **Device tier detection** otomatis: low/mid/high/pc
- **Browser support:** Chrome, Safari, Samsung Internet, MIUI Xiaomi
- **Mobile foldable** Samsung Z Fold compat
- **Stage-local coordinate scaling** (anti-crop di resolusi apapun)
- **JS-computed scale** via CSS variable `--game-scale`

**📱 PERANGKAT TARGET:**
- Samsung A06 (low tier)
- iPhone (mid tier)
- Tablet (mid tier)
- PC desktop (high tier)

**🎯 OUTPUT:** Lintas device tanpa lag, layout sempurna.

---

## 🐛 STEP 7 — Audit Bug & Perbaikan Kritis

**Status:** ✅ SELESAI

Audit menyeluruh menemukan 5 bug.

**⚠️ BUG #1 (KRITIS):**
- Cascade dibatasi 5 padahal seharusnya 50
- RTP simulator dikalibrasi untuk unlimited cascade
- Player kehilangan banyak win yang seharusnya dibayar
- **Fix:** cap 5 → 50

**Bug #2:** Auto-stop "BIG win" threshold 5× (harusnya 10×)
**Bug #3:** `resetAllData` set turbo = false (harusnya number 0)
**Bug #4:** `Game.spin()` null check missing
**Bug #5:** Riwayat stats kosong (totalSpins typo, biggestWin not tracked)

**🎯 OUTPUT:** 2 commit pushed ke GitHub:
- `2593003` — fix cascade cap (CRITICAL)
- `9f4c49f` — fix 4 minor bugs

---

## 🚀 STEP 8 — RILIS LIVE 24/7

**Status:** ✅ SELESAI

Auto-deploy lewat GitHub → Netlify.

**📋 BAHAN DEPLOY:**
- **GitHub repo:** `GameXp404/calavera-riches`
- **Netlify build config:** `vite build` → folder `dist`
- **Auto-trigger:** setiap `git push` commit baru
- **Build time:** ~1 menit
- **Domain:** calaverariche.netlify.app

**🟢 LIVE 24/7 di:**

# https://calaverariche.netlify.app

**🎯 OUTPUT:** Game bisa diakses publik tanpa instalasi, semua device, gratis selamanya.

---

# 🔄 FASE SEDANG JALAN (1 tahap)

---

## 💓 STEP 9 — Monitoring & Bug Fix Lanjutan

**Status:** 🔄 JALAN (ongoing)

Memantau pemain di production + fix bug yang muncul.

**📋 BAHAN MONITORING:**
- Cek Netlify analytics (visitor count, bounce rate)
- Cek error log Netlify functions
- Audit RTP nyata vs target 96,6% (sample 1000 spin user)
- Update dependency npm: pixi.js, gsap, vite
- Patch security advisories
- Respond user feedback (max 1-2 hari fix)

**🔄 STATUS:** Selalu ongoing selama game live.

---

# ⏳ FASE BELUM DIKERJAKAN (4 tahap roadmap)

---

## 🎛️ STEP 10 — Upgrade Kualitas Audio (Hybrid v3)

**Status:** ⏳ BELUM

User merasa audio belum cukup nge-feel "Wild Bandito".

**📋 BAHAN:**
- Cari file audio premium baru (Pond5, AudioJungle, CC0 alternatif)
- Swap 5-10 file kunci (spin_start, win_epic, scatter_land, free_spin_trigger, reel_whoosh)
- ElevenLabs voice generation upgrade (paid plan)
- A/B testing dengan player

**⏳ ESTIMASI:** 1 minggu cari + swap + test.

---

## 📤 STEP 11 — Fitur Share Sosial

**Status:** ⏳ BELUM

Pemain bisa share kemenangan ke teman → viral marketing.

**📋 BAHAN:**
- Tombol "Share Win" muncul saat MEGA/EPIC/LEGENDARY
- `Canvas.toBlob()` → generate gambar screenshot kemenangan
- Web Share API (`navigator.share`)
- Fallback: copy link / download image
- Tracking analytics: berapa share, berapa klik dari share
- Target sosial: WhatsApp, Facebook, Instagram Story, Twitter

**⏳ ESTIMASI:** 3-5 hari coding.

---

## 🏆 STEP 12 — Mode Turnamen Multiplayer

**Status:** ⏳ BELUM

Kompetisi multiplayer mingguan/bulanan untuk engagement.

**📋 BAHAN:**
- Backend mini API (Vercel functions / Supabase)
- Authentication ringan (anonymous + nickname)
- Entry fee model (kredit virtual)
- Format: spin 50× dalam 1 jam, total win terbesar menang
- Live leaderboard yang update real-time
- Bracket eliminasi mingguan
- Hadiah: kredit bonus / cosmetic badge / NFT?
- Push notification end of week

**⏳ ESTIMASI:** 2-3 minggu.

---

## 📊 STEP 13 — Statistik & Leaderboard

**Status:** ⏳ BELUM

Sistem retention untuk player long-term.

**📋 BAHAN:**
- **Profil player:** total spin, total menang, win rate
- **Win terbesar pribadi** & all-time
- **Daily / Weekly / Monthly leaderboard**
- **Achievement badges:**
  - 10 LEGENDARY wins
  - 1000 spin total
  - 100 cascade chain
  - dst...
- **Cloud save:** progress sync antar HP & PC (Firebase / Supabase)
- **Stat export:** CSV / PDF download

**⏳ ESTIMASI:** 1-2 minggu untuk full system.

---

# 🎯 RINGKASAN EKSEKUTIF

| Fase | Tahap | Status |
|---|---|---|
| Foundation | 1-4 | ✅ SELESAI |
| Polish | 5-6 | ✅ SELESAI |
| Quality | 7 | ✅ SELESAI |
| Release | 8 | ✅ SELESAI |
| Operations | 9 | 🔄 JALAN |
| Enhancement | 10-13 | ⏳ BELUM |

**🎰 Game sudah LIVE & playable** di https://calaverariche.netlify.app

**📈 Next steps:** Upgrade audio → fitur sosial → turnamen → leaderboard.

---

*Dibuat menggunakan PlanRoket Workflow Visual · Tersimpan di Library Tim*

*Last update: 2026-05-26*
