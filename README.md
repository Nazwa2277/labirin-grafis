# 🏚️ Maze Escape 3D — Horror with A* Pathfinding

Proyek UAS Grafis Komputer menggunakan **Three.js** murni (Vanilla JS ES6 Modules, tanpa framework). Pemain terjebak dalam labirin 3D bertema horror, harus menemukan kunci dan kabur lewat pintu keluar sebelum waktu habis — sambil dikejar monster yang menggunakan **algoritma A\* (A-Star Pathfinding)**.

---

## 📁 Struktur Folder

```
MazeEscape3D/
├── index.html              # Entry point, semua UI screen (start/HUD/pause/victory/gameover)
├── css/
│   └── style.css           # Styling tema horror (font Creepster, vignette, dsb)
├── js/
│   ├── main.js              # Orkestrator utama: scene, lighting, game loop, state machine
│   ├── player.js             # Kontrol FPS (PointerLockControls), gerak, collision, senter
│   ├── maze.js                # Grid labirin, generator geometri 3D, texture, collision wall
│   ├── key.js                  # Objek kunci 3D (animasi mengambang + rotasi)
│   ├── door.js                  # Pintu keluar (status terkunci/terbuka)
│   ├── enemy.js                  # AI monster — state machine PATROL/CHASE + pemanggilan A*
│   ├── pathfinding.js             # ALGORITMA A* (inti tugas), dikomentari detail
│   ├── particles.js                # Sistem partikel (efek kunci, menang, game over)
│   └── gui.js                       # Panel kontrol lil-gui
├── textures/                # Taruh wall.jpg, floor.jpg, door.jpg di sini (opsional)
└── assets/                  # Aset tambahan opsional (audio, dsb)
```

---

## ▶️ Cara Menjalankan Proyek

Karena proyek ini memakai **ES6 Modules** (`import`/`export`), file `index.html` **tidak bisa** dibuka langsung lewat `file://` di browser (akan diblokir CORS). Gunakan local server:

### Opsi 1 — VS Code Live Server
1. Buka folder `MazeEscape3D` di VS Code.
2. Install ekstensi **Live Server**.
3. Klik kanan `index.html` → **Open with Live Server**.

### Opsi 2 — Python (sudah terinstall di kebanyakan komputer)
```bash
cd MazeEscape3D
python3 -m http.server 8000
```
Lalu buka `http://localhost:8000` di browser.

### Opsi 3 — Node.js
```bash
npx serve MazeEscape3D
```

> **Catatan:** Three.js dan lil-gui dimuat lewat **CDN (unpkg.com)** menggunakan `<script type="importmap">` di `index.html`, jadi **butuh koneksi internet** saat dijalankan. Tidak perlu `npm install`.

### Kontrol Permainan
| Tombol | Aksi |
|---|---|
| `W A S D` / Arrow Keys | Bergerak |
| Mouse | Melihat sekitar (kamera FPS) |
| `Shift` | Berlari |
| `F` | Nyalakan/matikan senter |
| `ESC` | Pause |
| Klik kiri (di Start Screen) | Mengunci pointer & mulai main |

---

## 🧠 Penjelasan Algoritma A* (Inti Tugas)

File: **`js/pathfinding.js`**

A* adalah algoritma pencarian jalur terpendek yang menggabungkan kecepatan *Greedy Best-First Search* dengan akurasi *Dijkstra's Algorithm*. Rumus utamanya:

```
f(n) = g(n) + h(n)
```

| Simbol | Arti |
|---|---|
| `g(n)` | Biaya nyata dari titik **awal** menuju node `n` (jumlah langkah yang sudah ditempuh) |
| `h(n)` | **Heuristic** — perkiraan biaya dari node `n` menuju **tujuan**. Proyek ini memakai **Manhattan Distance** (`\|dx\| + \|dy\|`) karena monster hanya bergerak 4 arah (grid, tanpa diagonal) |
| `f(n)` | Total estimasi biaya melalui node `n`. A* selalu memilih node dengan `f(n)` **terkecil** untuk dieksplorasi berikutnya |

### Alur Algoritma (ringkas)
1. Masukkan node awal ke **openSet** (kandidat yang akan dievaluasi).
2. Selama openSet tidak kosong:
   - Ambil node dengan `f(n)` terkecil → jadikan `current`.
   - Jika `current` adalah node tujuan → **jalur ditemukan**, rekonstruksi lewat peta `cameFrom`.
   - Pindahkan `current` ke **closedSet** (sudah selesai dievaluasi).
   - Untuk setiap tetangga (atas/bawah/kiri/kanan) yang **bukan dinding**:
     - Hitung `tentativeG = g(current) + 1`.
     - Jika jalur ini lebih baik dari yang tercatat sebelumnya, **update** `cameFrom`, `gScore`, `fScore` untuk tetangga tersebut.
3. Jika openSet habis tanpa mencapai tujuan → tidak ada jalur (`return null`).

### Bagaimana Monster Memakainya
File **`js/enemy.js`** memanggil `findPathAStar(grid, startGrid, goalGrid)` setiap **0.6 detik** (konstanta `REPATH_INTERVAL`) selama dalam state `CHASE`, sehingga jalur selalu diperbarui mengikuti posisi pemain terbaru. Hasil jalur (`array of {col,row}`) lalu disederhanakan dengan `simplifyPath()` (hanya menyimpan titik belokan) agar pergerakan monster halus, tidak patah-patah di setiap petak grid.

**Visualisasi debug**: aktifkan toggle *"Debug A* Path"* di GUI untuk melihat garis hijau jalur yang sedang diikuti monster secara real-time — berguna untuk demo presentasi.

---

## 📜 Penjelasan Fungsi Setiap File

| File | Fungsi |
|---|---|
| `main.js` | Inisialisasi Three.js (scene/camera/renderer), lighting, fog, game loop (`requestAnimationFrame`), state machine (`START → PLAYING → PAUSED/VICTORY/GAMEOVER`), serta menghubungkan semua modul lain. |
| `player.js` | Membungkus `PointerLockControls` Three.js untuk kamera FPS, menangani input WASD, kecepatan jalan/lari, dan memanggil `maze.resolveCollision()` agar pemain tak menembus dinding. Juga mengelola `SpotLight` senter. |
| `maze.js` | Menyimpan layout grid 2D labirin, mengonversi grid↔world, membangun mesh dinding/lantai/langit-langit beserta texture (file asli atau prosedural fallback), dan AABB collision resolver. |
| `key.js` | Objek kunci 3D dengan animasi rotasi + mengambang, serta deteksi pickup oleh pemain. |
| `door.js` | Objek pintu keluar dengan dua status visual (merah=terkunci, hijau=terbuka) dan deteksi kemenangan. |
| `enemy.js` | AI monster: *state machine* `PATROL`↔`CHASE`, memanggil A* untuk path ke pemain, deteksi tangkapan (`CATCH_RADIUS`), serta visual garis debug jalur. |
| `pathfinding.js` | Implementasi murni algoritma **A\*** + heuristic Manhattan Distance + penyederhanaan jalur. |
| `particles.js` | Sistem partikel `THREE.Points` untuk efek ambil kunci (emas), menang (putih/emas), dan game over (merah). |
| `gui.js` | Panel `lil-gui` berisi semua kontrol yang diminta rubrik (volume, kesulitan, timer, fog, senter, kecepatan musuh, reset). |

---

## ✅ Pemetaan ke Fitur yang Diminta (Checklist Rubrik UAS)

### Gameplay
- [x] **Player Movement** — WASD + mouse look (`player.js`, `PointerLockControls`)
- [x] **Collision Detection** — AABB vs circle pada dinding (`maze.js → resolveCollision`)
- [x] **Maze dari grid 2D** — `MAZE_LAYOUT` 15×15 di `maze.js`, dinding dibangun otomatis dari array
- [x] **Key System** — `key.js`, pickup radius + event mengaktifkan pintu
- [x] **Exit Door** — `door.js`, status visual terkunci/terbuka
- [x] **Timer** — countdown di `main.js`, bisa diatur lewat GUI

### Pathfinding (Wajib)
- [x] File khusus `pathfinding.js` berisi algoritma **A\*** dengan komentar lengkap
- [x] Monster berpatroli (`PATROL_POINTS`)
- [x] Deteksi pemain dalam radius (`DETECTION_RADIUS`)
- [x] A* mencari jalur terpendek menuju pemain
- [x] Re-path berkala (`REPATH_INTERVAL`)
- [x] Mengejar hingga menangkap (`CATCH_RADIUS`)
- [x] Visualisasi jalur untuk debugging (garis hijau, toggle di GUI)

### Grafis
- [x] Objek 3D: labirin, monster (humanoid low-poly), kunci, pintu
- [x] Texture Mapping: dinding & lantai (file asli atau prosedural fallback otomatis)
- [x] Lighting: `AmbientLight` + `DirectionalLight` (cahaya bulan) + `SpotLight` (senter pemain)
- [x] Fog: `THREE.FogExp2` untuk efek kabut horror
- [x] Particle System: 3 efek (ambil kunci, menang, game over) di `particles.js`

### GUI (lil-gui)
- [x] Volume, Tingkat Kesulitan, Timer, Fog ON/OFF, Senter ON/OFF, Enemy Speed, Reset Game

### UI Game
- [x] Start Screen, HUD (timer/status kunci/status monster), Pause Menu, Victory Screen, Game Over Screen — semua ada di `index.html` + di-toggle lewat `main.js`

---

## 🖼️ Sumber Texture Gratis (Opsional)

Game **sudah berjalan tanpa file texture** (otomatis pakai texture prosedural canvas). Untuk hasil lebih realistis, unduh texture gratis dari situs berikut lalu simpan sebagai `wall.jpg`, `floor.jpg`, `door.jpg` di folder `textures/`:

- **Poly Haven** — https://polyhaven.com/textures (CC0, kualitas tinggi, kategori "Concrete", "Wood", "Brick")
- **ambientCG** — https://ambientcg.com (CC0, banyak pilihan dinding batu/beton horror)
- **3dtextures.me** — https://3dtextures.me (gratis untuk proyek non-komersial/edukasi)
- **Texture Haven** (kini bagian dari Poly Haven) — kategori dinding retak, lantai beton kotor cocok untuk tema horror

Rekomendasi pencarian: `"dark concrete wall"`, `"old wood door"`, `"dirty tile floor"`.

---

## 🛠️ Teknologi yang Digunakan

- **Three.js r160** (via CDN `unpkg.com`, ES6 Module)
- **PointerLockControls** (`three/addons/controls/`)
- **lil-gui** (via CDN)
- Vanilla JavaScript ES6 Modules — *tidak ada framework/bundler*
- HTML5 + CSS3

---

## 💡 Tips Presentasi

1. Buka **Debug A\* Path** di GUI sebelum memancing monster mendekat, agar dosen bisa melihat garis hijau jalur A* secara real-time.
2. Jelaskan transisi state `PATROL → CHASE` di `enemy.js` sebagai bukti bahwa A* dipanggil **secara dinamis**, bukan hanya sekali di awal.
3. Tunjukkan `pathfinding.js` sambil menjelaskan rumus `f(n) = g(n) + h(n)` langsung dari komentar kode.
4. Gunakan GUI untuk mengubah **Enemy Speed** dan **Tingkat Kesulitan** secara live sebagai bukti interaktivitas.
