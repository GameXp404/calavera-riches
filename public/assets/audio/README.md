# Calavera Riches — Sample Audio (Hybrid Sound System)

Game ini memakai **hybrid audio**: sample MP3/OGG/WAV jika file tersedia,
fallback ke procedural Web Audio synthesis kalau file tidak ada.

Drop file dengan **nama persis di bawah** ke folder ini untuk auto-replace synth.

## Daftar File yang Dicari Game

| File name              | Event                       | Durasi rekom. | Karakter suara                                                 |
|------------------------|-----------------------------|---------------|----------------------------------------------------------------|
| `spin_start.mp3`       | Tombol SPIN ditekan         | 0.5–0.8 s     | Brass blast + maraca shake, "ka-CHANG" launch                  |
| `reel_stop.mp3`        | Tiap reel berhenti          | 0.2–0.3 s     | Click + bass thud impact (pitch akan auto-detune per reel)     |
| `scatter_land.mp3`     | Symbol SCATTER mendarat     | 1.0–1.5 s     | Bell DONG dalam + shimmer trail, ada reverb hall otomatis      |
| `win_small.mp3`        | Kemenangan kecil (NORMAL)   | 0.5–0.8 s     | Triangle arpeggio cepat, ceria                                 |
| `win_big.mp3`          | BIG/MEGA WIN                | 2.0–3.0 s     | Brass swell + choir + cymbal crash                             |
| `win_epic.mp3`         | EPIC WIN                    | 3.0–4.0 s     | Orkestra layered + sub-bass impact                             |
| `win_legendary.mp3`    | LEGENDARY WIN               | 4.0–6.0 s     | Full mariachi orchestra + crowd cheer + bell                   |
| `free_spin_trigger.mp3`| 3+ scatter masuk            | 2.0–3.0 s     | Mariachi fanfare ascending + cymbal                            |
| `cascade_pop.mp3`      | Tiap symbol pecah cascade   | 0.1–0.2 s     | Glass break / pop kecil (pitch naik tiap iterasi cascade)      |
| `anticipation.mp3`     | Anticipation moment         | 1.5–2.0 s     | Heartbeat drumroll + rising sub-bass                           |
| `coin_tick.mp3`        | Coin counter tick           | 0.05–0.1 s    | Pitched coin "ting" pendek (pitch auto-naik dengan jumlah)     |
| `button_click.mp3`     | Tombol UI ditekan           | 0.05–0.1 s    | Click tactile pendek                                           |
| `voice_big_win.wav`    | Voice "BIG WIN"             | 0.8–1.5 s     | Announcer male voice "Big Win!" (deep dramatic)                |
| `voice_mega_win.wav`   | Voice "MEGA WIN"            | 0.8–1.5 s     | Announcer male voice "Mega Win!"                               |
| `voice_epic_win.wav`   | Voice "EPIC WIN"            | 0.8–1.5 s     | Announcer male voice "Epic Win!"                               |
| `voice_legendary_win.wav` | Voice "LEGENDARY WIN"    | 1.0–2.0 s     | Announcer male voice "Legendary Win!" (slower, deeper)         |

## Sumber Download Legal (CC0 / Royalty-Free)

### freesound.org (CC0 — bebas pakai, attribution opsional)
- **Mariachi / Trumpet**: cari "mariachi fanfare", "mexican trumpet", "mariachi brass"
- **Bell DONG**: cari "tibetan bowl", "church bell", "metal bell" — pilih CC0
- **Maraca / Shaker**: cari "maraca shake", "cabasa", "afuche"
- **Coin tick**: cari "coin drop", "coin ting", "tiny coin"
- **Drumroll heartbeat**: cari "heart beat", "drum roll low", "kick drum sub"
- **Glass break / pop**: cari "glass shatter short", "crystal break"

### Pixabay Music (royalty-free Mexican folk)
- https://pixabay.com/sound-effects/search/mariachi/
- https://pixabay.com/music/search/mexican/

### Mixkit (free SFX, no signup)
- https://mixkit.co/free-sound-effects/win/
- https://mixkit.co/free-sound-effects/coin/
- https://mixkit.co/free-sound-effects/casino/

### ElevenLabs (untuk vokal custom — generate "¡Olé!", "¡Viva!")
- https://elevenlabs.io/ (free tier, 10k char/bulan)

## Cara Pakai

1. Download/buat file dengan **nama persis** di tabel
2. Letakkan di folder ini (`public/assets/audio/`)
3. Reload game — sample auto-detect dan replace synth
4. File yang tidak ada → tetap pakai synth fallback (tidak crash)

## Format Disarankan

- **Codec**: MP3 128–192 kbps (universal) atau OGG Vorbis (lebih ringan)
- **Sample rate**: 44.1 kHz / 48 kHz
- **Mono untuk SFX** (lebih kecil & langsung dimix di Web Audio)
- **Stereo untuk music/big win** (pakai full panorama)
- **Trim silence** di awal/akhir agar timing presisi

## Tips Mixing

- Volume per file sudah di-balance dengan `vol` di `sampleManifest` (src/audio.js).
  Kalau salah satu file terlalu keras/pelan, edit `vol` di manifest, jangan ubah file.
- Game menambahkan **convolution reverb** otomatis ke scatter/big/epic/legendary
  wins via parameter `reverb`. File sample bisa **dry** (tanpa reverb bawaan).
- `cascade_pop.mp3` & `reel_stop.mp3` akan di-**pitch-shift** otomatis (cascade
  iter / reel index). Rekam di pitch netral, biarkan engine yang variasikan.
