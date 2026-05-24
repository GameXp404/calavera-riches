# 🚀 Cara Update Game Calavera Riches (Auto-Deploy)

## Setup Sudah Selesai ✅

- ✅ GitHub repo: `https://github.com/GameXp404/calavera-riches`
- ✅ Netlify site: `https://calaverariches.netlify.app`
- ✅ Auto-deploy: Tiap push ke GitHub → Netlify auto-build & deploy

---

## 📝 Update Game (3 Command)

Setelah edit file game (bug fix, polish, dll), buka **PowerShell/CMD**:

```bash
cd "D:\Users\user22\Documents\CalaveraRiches"
git add .
git commit -m "Pesan singkat tentang yang diubah"
git push
```

Selesai! Tunggu 2-3 menit → URL `calaverariches.netlify.app` udah update.

---

## 🔍 Cek Status Deploy

Buka: https://app.netlify.com/sites/calaverariches/deploys

Akan terlihat:
- 🔄 Building... (in progress)
- ✅ Published (selesai)
- ❌ Failed (ada error, klik untuk liat log)

---

## 💡 Tips Penting

### Test di Lokal Dulu Sebelum Push
```bash
npm run dev      # buka http://localhost:5520
```

Atau test build production:
```bash
npm run build
npm run preview  # buka http://localhost:4173
```

### Kalau Build Netlify Gagal:
1. Buka Netlify deploys page
2. Klik deploy yang gagal → liat log error
3. Fix error di kode lokal
4. Push lagi → auto rebuild

### Pesan Commit yang Baik:
- `"Fix bug spin button stuck"` (specific)
- `"Add new wild bonus animation"`
- `"Polish FS intro transition"`
- ❌ JANGAN: `"update"` atau `"fix"` (terlalu vague)

---

## 🆘 Troubleshooting

### Push Failed: "Permission denied"
```bash
# Re-login ke GitHub
git config credential.helper manager
git push  # akan prompt browser auth
```

### Push Failed: "Updates were rejected"
```bash
# Pull dulu kalau ada update di GitHub
git pull --rebase
git push
```

### Deploy Sukses tapi Site Tetap Lama
```bash
# Hard refresh browser
Ctrl + Shift + R  (Chrome/Edge/Firefox)
```

Atau buka di **incognito** (Ctrl+Shift+N).

---

## 📊 Workflow Summary

```
┌───────────────────────────────────────────┐
│  Edit kode di komputer (VS Code)          │
│           ↓                               │
│  Test lokal: npm run dev                  │
│           ↓                               │
│  Happy dengan hasilnya?                   │
│           ↓                               │
│  git add . && git commit -m "..."         │
│           ↓                               │
│  git push                                 │
│           ↓                               │
│  Netlify auto-detect + build (2-3 min)    │
│           ↓                               │
│  Site LIVE updated!                       │
└───────────────────────────────────────────┘
```

---

## 🎯 Important URLs

| Apa | URL |
|---|---|
| Game Live | https://calaverariches.netlify.app |
| GitHub Repo | https://github.com/GameXp404/calavera-riches |
| Netlify Dashboard | https://app.netlify.com/sites/calaverariches |
| Deploy Log | https://app.netlify.com/sites/calaverariches/deploys |

---

**Dokumen ini disimpan di:** `D:\Users\user22\Documents\CalaveraRiches\UPDATE-GUIDE.md`
