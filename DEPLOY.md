# 🚀 Calavera Riches — Panduan Deploy ke Hosting Gratis

Setelah `npm run build`, folder `dist/` berisi semua file yang siap di-host.
Bisa di-upload ke berbagai hosting GRATIS. Pilih salah satu di bawah.

---

## ⭐ Opsi A: Vercel (Recommended — Termudah)

### Persiapan (sekali aja):
1. Buka https://vercel.com → Sign up (pakai GitHub gratis)
2. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

### Deploy:
```bash
# Di root folder Calavera Riches:
npm run build
vercel --prod
```

Ikuti prompt:
- "Set up and deploy?" → Yes
- "Which scope?" → personal
- "Link to existing project?" → No (first time)
- "Project name?" → calavera-riches (or any name)
- "Which directory has code?" → `./` (default)
- "Override settings?" → No

**Hasil:** URL publik seperti `https://calavera-riches.vercel.app`

### Update di masa depan:
```bash
npm run build
vercel --prod
```

**Biaya:** Gratis selamanya untuk traffic kecil-medium.

---

## ⭐ Opsi B: Netlify (Drag & Drop — Gak perlu CLI)

1. `npm run build` di terminal
2. Buka https://app.netlify.com/drop
3. Drag folder `dist/` ke browser
4. Tunggu upload (< 1 menit)
5. Dapat URL publik instant: `https://random-name-12345.netlify.app`

**Update di masa depan:** Drag `dist/` lagi ke URL deploy yang sama.

**Biaya:** Gratis.

---

## ⭐ Opsi C: GitHub Pages (Permanen + Bisa Custom Domain)

1. Push code ke GitHub repo
2. Buat file `.github/workflows/deploy.yml`:
   ```yaml
   name: Deploy to Pages
   on:
     push:
       branches: [main]
   permissions:
     contents: read
     pages: write
     id-token: write
   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20 }
         - run: npm ci
         - run: npm run build
         - uses: actions/upload-pages-artifact@v3
           with: { path: dist }
     deploy:
       needs: build
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - uses: actions/deploy-pages@v4
           id: deployment
   ```
3. Di GitHub repo: Settings → Pages → Source: "GitHub Actions"
4. Push lagi → auto-deploy ke `username.github.io/calavera-riches`

**Biaya:** Gratis.

---

## ⭐ Opsi D: Cloudflare Pages (Cepat + CDN Global)

1. Push code ke GitHub
2. Buka https://pages.cloudflare.com
3. Connect to GitHub → pilih repo
4. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Save & Deploy

**Hasil:** `https://calavera-riches.pages.dev` + Cloudflare CDN global

**Biaya:** Gratis (500 deploys/bulan, unlimited bandwidth).

---

## 🎯 Rekomendasi Saya

**Untuk pertama kali:** Pakai **Netlify Drag & Drop** (Opsi B) — paling gampang, 1 menit selesai, gak perlu install apapun.

**Untuk jangka panjang:** Pakai **Vercel** atau **Cloudflare Pages** dengan GitHub auto-deploy.

---

## 🧪 Test Sebelum Deploy

### Local preview (verify build sebelum upload):
```bash
npm run build
npm run preview
```
Buka URL yang muncul (biasanya `http://localhost:4173`).

### Cek PWA di browser:
1. Buka game di Chrome/Edge
2. F12 → tab "Application"
3. Cek "Manifest" → harus tampil semua icons & metadata
4. Cek "Service Workers" → harus terdaftar
5. Cek "Lighthouse" → run PWA audit (target score >90)

---

## 📱 Install ke HP (Setelah Deploy)

### Android (Chrome):
1. Buka URL deploy di Chrome HP
2. Menu (3 dots) → "Add to Home screen" atau "Install App"
3. Konfirmasi → icon Calavera muncul di home screen
4. Tap icon → buka game fullscreen native-feel

### iPhone (Safari):
1. Buka URL deploy di Safari
2. Tap tombol Share (kotak panah ke atas)
3. Scroll → "Add to Home Screen"
4. Edit nama (default "Calavera") → Add
5. Icon muncul di home screen

### Desktop (Chrome/Edge):
1. Buka URL di Chrome/Edge
2. Address bar → icon install (kanan)
3. Atau menu → "Install Calavera Riches..."
4. App buka di window terpisah seperti native app

---

## ⚙️ Vite Config Tambahan (Opsional)

Kalau mau atur output yang lebih spesifik, edit `vite.config.js`:

```javascript
export default {
  base: '/',  // ubah ke '/calavera-riches/' kalau hosting di subpath (GitHub Pages)
  build: {
    target: 'es2018',
    minify: 'esbuild',
    sourcemap: false,  // matikan untuk production agar lebih kecil
  },
};
```

---

## 🐛 Troubleshooting

### "Service Worker tidak terdaftar"
- Pastikan deploy via HTTPS (semua opsi di atas otomatis HTTPS)
- Hard refresh: Ctrl+Shift+R / Cmd+Shift+R

### "Install button tidak muncul"
- Browser support: Chrome/Edge/Samsung Browser yes; Safari/Firefox iOS no
- Site harus HTTPS
- SW harus terdaftar
- Manifest harus valid

### "Offline mode tidak jalan"
- Cek Application → Service Workers → status "activated and running"
- Cek Cache Storage — harus ada entries untuk static assets

### "Build error: out of memory"
```bash
node --max-old-space-size=4096 ./node_modules/vite/bin/vite.js build
```

---

## 📊 Performance Tips

1. **Compress images further:** Jalankan tinypng.com pada PNG di public/assets/img/
2. **Convert WAV → OGG/MP3:** Audio bisa 90% lebih kecil
3. **Lazy-load assets:** Splash sudah preload (cek main.js preloadAssets)
4. **Enable HTTP/2:** Semua hosting modern sudah default

---

## 🎰 Sharing Game

Setelah deploy berhasil, share URL ke siapa saja:
- WhatsApp: kirim link → preview otomatis nampilin gambar + judul (dari Open Graph tags)
- Twitter/X: link preview nampilin Calavera Riches card
- Direct: kasih URL, mereka bisa main langsung tanpa download

**Selamat — game kamu sudah live di internet!** 🎉🎰
