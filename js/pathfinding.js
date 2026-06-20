/**
 * =========================================================================
 *  pathfinding.js
 * =========================================================================
 *  Implementasi algoritma A* (A-Star Pathfinding) untuk mencari jalur
 *  terpendek dari posisi monster menuju posisi pemain di dalam grid labirin.
 *
 *  ---------------------------------------------------------------------
 *  KONSEP DASAR A*
 *  ---------------------------------------------------------------------
 *  A* adalah algoritma pencarian jalur (pathfinding) yang menggabungkan:
 *    1. Dijkstra's Algorithm  -> menjamin jalur terpendek yang AKURAT
 *    2. Greedy Best-First     -> menjamin pencarian yang CEPAT
 *
 *  A* bekerja dengan cara mengevaluasi setiap node (petak grid) menggunakan
 *  rumus biaya berikut:
 *
 *        f(n) = g(n) + h(n)
 *
 *  Keterangan:
 *    - g(n) : biaya nyata (cost) dari node AWAL menuju node n
 *              (semakin jauh node n dari start, semakin besar g(n))
 *    - h(n) : heuristic, yaitu PERKIRAAN biaya dari node n menuju node TUJUAN
 *              (di sini kita pakai Manhattan Distance karena grid 4-arah)
 *    - f(n) : total perkiraan biaya jika melewati node n
 *
 *  Algoritma akan selalu memilih node dengan nilai f(n) PALING KECIL untuk
 *  dieksplorasi berikutnya. Dengan begitu, A* "mengarahkan" pencarian ke
 *  arah tujuan (efisien) tetapi tetap memperhitungkan jalur yang sudah
 *  ditempuh (akurat), sehingga hasil akhirnya adalah jalur TERPENDEK.
 *
 *  ---------------------------------------------------------------------
 *  STRUKTUR DATA YANG DIGUNAKAN
 *  ---------------------------------------------------------------------
 *  - openSet   : kumpulan node yang AKAN dievaluasi (kandidat jalur)
 *  - closedSet : kumpulan node yang SUDAH selesai dievaluasi
 *  - cameFrom  : peta (Map) untuk menyimpan "node sebelumnya", dipakai untuk
 *                merekonstruksi jalur akhir setelah tujuan ditemukan
 *  - gScore    : Map biaya g(n) termurah yang diketahui untuk tiap node
 *  - fScore    : Map biaya f(n) = g(n) + h(n) untuk tiap node
 * =========================================================================
 */

/**
 * Merepresentasikan satu titik koordinat grid (kolom, baris).
 */
class Node {
  constructor(col, row) {
    this.col = col;
    this.row = row;
  }
  /** Key unik untuk dipakai sebagai identitas di dalam Map/Set */
  key() {
    return `${this.col},${this.row}`;
  }
}

/**
 * Heuristic function: Manhattan Distance.
 * Dipilih karena monster hanya bisa bergerak 4 arah (atas/bawah/kiri/kanan)
 * sesuai struktur grid labirin (tidak diagonal).
 *
 * h(n) = |x1 - x2| + |y1 - y2|
 */
function heuristic(a, b) {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

/**
 * Mengambil daftar tetangga (neighbor) yang valid dan tidak berupa dinding
 * dari sebuah node pada grid labirin.
 *
 * @param {Node} node - node saat ini
 * @param {number[][]} grid - grid labirin, 1 = dinding, 0 = jalan
 * @returns {Node[]} daftar node tetangga yang bisa dilalui
 */
function getWalkableNeighbors(node, grid) {
  const rows = grid.length;
  const cols = grid[0].length;

  // 4 arah gerak: atas, bawah, kiri, kanan (tidak diagonal)
  const directions = [
    { dc: 0, dr: -1 }, // atas
    { dc: 0, dr: 1 },  // bawah
    { dc: -1, dr: 0 }, // kiri
    { dc: 1, dr: 0 },  // kanan
  ];

  const neighbors = [];

  for (const dir of directions) {
    const newCol = node.col + dir.dc;
    const newRow = node.row + dir.dr;

    // Pastikan masih di dalam batas grid
    if (newCol < 0 || newCol >= cols || newRow < 0 || newRow >= rows) continue;

    // Pastikan bukan dinding (0 = jalan yang bisa dilalui)
    if (grid[newRow][newCol] === 1) continue;

    neighbors.push(new Node(newCol, newRow));
  }

  return neighbors;
}

/**
 * Merekonstruksi jalur akhir dengan menelusuri balik peta cameFrom,
 * mulai dari node tujuan hingga kembali ke node awal.
 *
 * @param {Map} cameFrom - peta "node ini datang dari node mana"
 * @param {Node} current - node tujuan (goal)
 * @returns {Node[]} array node dari START -> GOAL (urutan sudah dibalik)
 */
function reconstructPath(cameFrom, current) {
  const path = [current];
  let currentKey = current.key();

  while (cameFrom.has(currentKey)) {
    current = cameFrom.get(currentKey);
    currentKey = current.key();
    path.unshift(current); // tambahkan di depan array
  }

  return path;
}

/**
 * =========================================================================
 *  FUNGSI UTAMA: findPathAStar
 * =========================================================================
 *  Mencari jalur terpendek dari titik start ke titik goal di dalam grid
 *  labirin menggunakan algoritma A*.
 *
 * @param {number[][]} grid - grid 2D labirin (1 = dinding, 0 = jalan)
 * @param {{col:number, row:number}} start - posisi grid awal (monster)
 * @param {{col:number, row:number}} goal - posisi grid tujuan (pemain)
 * @returns {Array<{col:number, row:number}>|null} array koordinat jalur,
 *          atau null jika tidak ditemukan jalur sama sekali
 * =========================================================================
 */
export function findPathAStar(grid, start, goal) {
  const startNode = new Node(start.col, start.row);
  const goalNode = new Node(goal.col, goal.row);

  // Jika titik tujuan adalah dinding, tidak ada jalur yang mungkin
  if (grid[goalNode.row]?.[goalNode.col] === 1) return null;

  // openSet: node-node kandidat yang masih perlu dievaluasi
  // Kita gunakan array biasa + pencarian linear f(n) minimum (cukup untuk
  // ukuran labirin UAS yang relatif kecil, ~20x20 grid)
  const openSet = [startNode];
  const openSetKeys = new Set([startNode.key()]);

  // closedSet: node yang sudah final dievaluasi, tidak perlu dicek lagi
  const closedSet = new Set();

  // cameFrom: untuk merekonstruksi jalur setelah goal ditemukan
  const cameFrom = new Map();

  // gScore: biaya nyata termurah dari start ke node tersebut
  const gScore = new Map();
  gScore.set(startNode.key(), 0);

  // fScore: estimasi total biaya (g + h) dari node tersebut
  const fScore = new Map();
  fScore.set(startNode.key(), heuristic(startNode, goalNode));

  // Batas iterasi pengaman, mencegah infinite loop pada grid yang aneh
  const MAX_ITERATIONS = 2000;
  let iterations = 0;

  while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;

    // -----------------------------------------------------------
    // LANGKAH 1: Pilih node di openSet dengan f(n) PALING KECIL
    // -----------------------------------------------------------
    let currentIndex = 0;
    let lowestF = fScore.get(openSet[0].key()) ?? Infinity;

    for (let i = 1; i < openSet.length; i++) {
      const f = fScore.get(openSet[i].key()) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        currentIndex = i;
      }
    }

    const current = openSet[currentIndex];
    const currentKey = current.key();

    // -----------------------------------------------------------
    // LANGKAH 2: Jika node saat ini adalah tujuan -> jalur ditemukan!
    // -----------------------------------------------------------
    if (current.col === goalNode.col && current.row === goalNode.row) {
      return reconstructPath(cameFrom, current).map((n) => ({
        col: n.col,
        row: n.row,
      }));
    }

    // Pindahkan current dari openSet ke closedSet
    openSet.splice(currentIndex, 1);
    openSetKeys.delete(currentKey);
    closedSet.add(currentKey);

    // -----------------------------------------------------------
    // LANGKAH 3: Evaluasi semua tetangga dari node saat ini
    // -----------------------------------------------------------
    const neighbors = getWalkableNeighbors(current, grid);

    for (const neighbor of neighbors) {
      const neighborKey = neighbor.key();

      // Lewati neighbor yang sudah final dievaluasi
      if (closedSet.has(neighborKey)) continue;

      // Biaya berpindah satu petak grid = 1
      const tentativeGScore = (gScore.get(currentKey) ?? Infinity) + 1;

      // Jika neighbor belum pernah dikunjungi, tambahkan ke openSet
      if (!openSetKeys.has(neighborKey)) {
        openSet.push(neighbor);
        openSetKeys.add(neighborKey);
      } else if (tentativeGScore >= (gScore.get(neighborKey) ?? Infinity)) {
        // Jalur yang sudah ada lebih baik atau sama, lewati neighbor ini
        continue;
      }

      // Jalur menuju neighbor ini adalah yang TERBAIK sejauh ini.
      // Simpan / perbarui catatan jalur dan skornya.
      cameFrom.set(neighborKey, current);
      gScore.set(neighborKey, tentativeGScore);
      fScore.set(neighborKey, tentativeGScore + heuristic(neighbor, goalNode));
    }
  }

  // openSet habis tanpa menemukan goal -> tidak ada jalur yang mungkin
  return null;
}

/**
 * Fungsi utilitas tambahan: menyederhanakan jalur hasil A* dengan hanya
 * mengambil titik-titik "belokan" (waypoint), supaya monster tidak perlu
 * berhenti di setiap petak grid saat bergerak halus (smooth movement).
 *
 * @param {Array<{col:number, row:number}>} path
 * @returns {Array<{col:number, row:number}>}
 */
export function simplifyPath(path) {
  if (!path || path.length <= 2) return path;

  const simplified = [path[0]];

  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];

    const dir1 = { dc: curr.col - prev.col, dr: curr.row - prev.row };
    const dir2 = { dc: next.col - curr.col, dr: next.row - curr.row };

    // Hanya simpan titik jika arah gerak berubah (belokan)
    if (dir1.dc !== dir2.dc || dir1.dr !== dir2.dr) {
      simplified.push(curr);
    }
  }

  simplified.push(path[path.length - 1]);
  return simplified;
}
