# Playback Bay

Console audio pribadi untuk menyiapkan file audio (mis. sebelum diunggah manual ke Roblox atau platform lain):
speed, pitch, EQ 5-band + preset, trim, normalize volume, preview, dan export ke WAV/MP3.

Semua pemrosesan audio terjadi **di browser pengguna** (Web Audio API) — server hanya menyajikan file statis, tidak ada audio yang dikirim ke server.

## Menjalankan secara lokal

Butuh Node.js versi 18 ke atas.

```bash
npm install
npm start
```

Lalu buka `http://localhost:3000` di browser.

## Struktur proyek

```
playback-bay/
├── server.js          # Express static file server
├── package.json
└── public/
    ├── index.html
    ├── styles.css
    └── app.js         # semua logika DSP & UI
```

## Deploy ke Railway

1. Push folder ini ke repository GitHub.
2. Di Railway, klik **New Project → Deploy from GitHub repo**, pilih repo ini.
3. Railway otomatis mendeteksi `package.json` dan menjalankan `npm install && npm start`.
4. Railway akan memberi domain publik (`*.up.railway.app`) — tidak perlu konfigurasi tambahan karena server membaca `process.env.PORT` secara otomatis.

Alternatif: pakai Railway CLI:
```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

## Deploy ke platform lain

- **Render**: New Web Service → connect repo → Build Command `npm install`, Start Command `npm start`.
- **Fly.io** / **Heroku**: kompatibel langsung karena hanya bergantung pada `process.env.PORT`.
- **Hosting statis biasa** (Netlify/Vercel/GitHub Pages): karena semua logika ada di sisi klien, kamu bisa cukup meng-upload isi folder `public/` sebagai situs statis tanpa perlu `server.js` sama sekali — tidak ada backend yang benar-benar dibutuhkan.

## Catatan

- Riwayat konversi disimpan di `localStorage` browser masing-masing pengguna (tidak dibagikan antar perangkat, tidak dikirim ke server).
- Export MP3 memakai library `lamejs` yang dimuat dari CDN (cdnjs.cloudflare.com/lamejs). Jika koneksi ke CDN tersebut gagal, tombol download WAV tetap berfungsi.
- Pitch shift memakai algoritma overlap-add (OLA) buatan sendiri — cukup untuk pemakaian kasual, tapi kualitasnya di bawah software DAW profesional untuk pergeseran pitch yang ekstrem.
- Tidak ada fitur upload otomatis ke Roblox — itu butuh Roblox Open Cloud API key milikmu sendiri. Kalau suatu saat kamu mau menambahkannya, beri tahu saja.
