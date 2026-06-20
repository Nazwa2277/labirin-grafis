/**
 * =========================================================================
 *  maze.js
 * =========================================================================
 *  Bertanggung jawab untuk:
 *   1. Menyimpan layout labirin dalam bentuk grid 2D (array of array)
 *   2. Membangun geometri 3D (dinding, lantai, langit-langit) dari grid
 *   3. Menyediakan fungsi bantu konversi koordinat grid <-> dunia (world)
 *   4. Menyediakan fungsi collision check sederhana (cell kosong / dinding)
 *
 *  Format grid:
 *    1 = dinding (wall)
 *    0 = jalan (lorong yang bisa dilalui)
 * =========================================================================
 */

import * as THREE from 'three';

// -------------------------------------------------------------------------
// LAYOUT LABIRIN (grid 2D)
// Ukuran: 15 kolom x 15 baris. Bisa diganti dengan layout lain selama
// border terluar tetap berupa dinding (1) agar pemain tidak keluar peta.
// -------------------------------------------------------------------------
export const MAZE_LAYOUT = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1],
  [1,0,1,0,0,0,1,0,0,0,0,0,1,0,1],
  [1,0,1,1,1,1,1,0,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,1],
  [1,1,1,1,1,0,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,1,1,0,1,1,1,0,1,0,1],
  [1,0,1,0,0,0,1,0,0,0,1,0,1,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,0,1,1,1],
  [1,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
  [1,1,1,0,1,1,1,0,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

// Ukuran satu petak grid dalam satuan dunia Three.js
export const CELL_SIZE = 4;
export const WALL_HEIGHT = 3.5;

// Titik spawn pemain (grid col, row) — harus berupa sel jalan (0)
export const PLAYER_SPAWN = { col: 1, row: 1 };

// Titik spawn monster (grid col, row) — harus berupa sel jalan (0)
export const ENEMY_SPAWN = { col: 13, row: 13 };

// Posisi kunci (grid col, row)
export const KEY_POSITION = { col: 13, row: 1 };

// Posisi pintu keluar (grid col, row) — diletakkan menempel border
export const DOOR_POSITION = { col: 7, row: 13 };

/**
 * Konversi koordinat grid (col, row) menjadi posisi dunia (world X, Z).
 * Titik (0,0) grid akan dipetakan ke pojok labirin, sehingga seluruh
 * labirin berada pada koordinat dunia positif.
 */
export function gridToWorld(col, row) {
  return {
    x: col * CELL_SIZE,
    z: row * CELL_SIZE,
  };
}

/**
 * Konversi posisi dunia (world X, Z) kembali menjadi koordinat grid
 * terdekat (col, row). Dipakai oleh sistem A* untuk mengetahui posisi
 * grid pemain & monster saat ini.
 */
export function worldToGrid(x, z) {
  return {
    col: Math.round(x / CELL_SIZE),
    row: Math.round(z / CELL_SIZE),
  };
}

/**
 * Mengecek apakah sebuah sel grid adalah jalan (bisa dilalui).
 */
export function isWalkable(col, row, grid = MAZE_LAYOUT) {
  if (row < 0 || row >= grid.length) return false;
  if (col < 0 || col >= grid[0].length) return false;
  return grid[row][col] === 0;
}

/**
 * Class Maze: membangun representasi 3D labirin (THREE.Group) lengkap
 * dengan texture lantai, dinding, dan langit-langit.
 */
export class Maze {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.LoadingManager} loadingManager
   */
  constructor(scene, loadingManager) {
    this.scene = scene;
    this.grid = MAZE_LAYOUT;
    this.group = new THREE.Group();
    this.group.name = 'MazeGroup';

    this.wallColliders = []; // Box3 untuk collision detection pemain

    this._buildMaterials(loadingManager);
    this._buildFloor();
    this._buildCeiling();
    this._buildWalls();

    this.scene.add(this.group);
  }

  /** Membangun material dengan texture prosedural (canvas) agar proyek
   *  tetap bisa berjalan tanpa file gambar eksternal, namun tetap
   *  mendukung penggantian dengan file texture asli di folder /textures. */
  _buildMaterials(loadingManager) {
    const textureLoader = new THREE.TextureLoader(loadingManager);

    // Dinding
    this.wallMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.95,
      metalness: 0.05,
      color: 0xffffff,
    });
    this._loadTextureWithFallback(
      textureLoader,
      'textures/wall.jpg',
      () => this._generateProceduralTexture('#3a3a3a', '#1f1f1f', 'brick'),
      this.wallMaterial,
      1, 1
    );

    // Lantai
    this.floorMaterial = new THREE.MeshStandardMaterial({
      roughness: 1.0,
      metalness: 0.0,
      color: 0xffffff,
    });
    this._loadTextureWithFallback(
      textureLoader,
      'textures/floor.jpg',
      () => this._generateProceduralTexture('#2b2520', '#181410', 'tile'),
      this.floorMaterial,
      this.grid[0].length, this.grid.length
    );

    // Langit-langit
    this.ceilingMaterial = new THREE.MeshStandardMaterial({
      roughness: 1.0,
      metalness: 0.0,
      color: 0xffffff,
    });
    this._loadTextureWithFallback(
      textureLoader,
      'textures/ceiling.jpg',
      () => this._generateProceduralTexture('#14141a', '#08080c', 'tile'),
      this.ceilingMaterial,
      this.grid[0].length, this.grid.length
    );
  }

  /** Coba load texture file dengan beberapa opsi ekstensi (.jpg, .webp, .png); gunakan fallback prosedural bila tidak ada. */
  _loadTextureWithFallback(loader, basePath, fallbackFn, material, repeatX = 1, repeatY = 1) {
    const fallbackTexture = fallbackFn();
    fallbackTexture.wrapS = fallbackTexture.wrapT = THREE.RepeatWrapping;
    fallbackTexture.repeat.set(repeatX, repeatY);

    // Pasang fallback dulu agar tidak kosong saat loading berjalan
    material.map = fallbackTexture;
    material.needsUpdate = true;

    // Persiapkan list ekstensi yang dicoba jika extension bawaan gagal
    const dotIndex = basePath.lastIndexOf('.');
    const pathWithoutExt = basePath.substring(0, dotIndex);
    const originalExt = basePath.substring(dotIndex);

    const exts = [originalExt];
    if (originalExt !== '.webp') exts.push('.webp');
    if (originalExt !== '.jpg') exts.push('.jpg');
    if (originalExt !== '.png') exts.push('.png');

    const uniqueExts = [...new Set(exts)];
    let attemptIndex = 0;

    const tryLoad = () => {
      if (attemptIndex >= uniqueExts.length) {
        console.warn(`[Maze] Semua ekstensi untuk tekstur "${pathWithoutExt}" gagal dimuat. Memakai prosedural fallback.`);
        return;
      }

      const currentPath = pathWithoutExt + uniqueExts[attemptIndex];
      loader.load(
        currentPath,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(repeatX, repeatY);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;

          // Hapus fallback texture untuk free memory
          if (material.map && material.map.dispose) {
            material.map.dispose();
          }

          material.map = texture;
          material.needsUpdate = true;
          console.log(`[Maze] Tekstur berhasil dimuat: ${currentPath}`);
        },
        undefined,
        () => {
          attemptIndex++;
          tryLoad(); // Coba ekstensi berikutnya
        }
      );
    };

    tryLoad();
  }

  /** Membuat texture prosedural sederhana via canvas 2D, sebagai fallback
   *  agar proyek tetap menampilkan visual menarik tanpa file eksternal. */
  _generateProceduralTexture(colorA, colorB, pattern) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = colorA;
    ctx.fillRect(0, 0, size, size);

    if (pattern === 'brick') {
      ctx.strokeStyle = colorB;
      ctx.lineWidth = 3;
      const rows = 8;
      const brickH = size / rows;
      for (let r = 0; r < rows; r++) {
        const y = r * brickH;
        const offset = r % 2 === 0 ? 0 : brickH * 1.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
        for (let x = -brickH * 2 + offset; x < size; x += brickH * 3) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + brickH);
          ctx.stroke();
        }
      }
      // noise bercak gelap untuk kesan kotor / horror
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
      }
    } else if (pattern === 'tile') {
      ctx.strokeStyle = colorB;
      ctx.lineWidth = 2;
      const grid = 4;
      const cell = size / grid;
      for (let i = 0; i <= grid; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cell);
        ctx.lineTo(size, i * cell);
        ctx.stroke();
      }
      for (let i = 0; i < 600; i++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /** Membangun lantai sebagai satu plane besar menutupi seluruh grid. */
  _buildFloor() {
    const width = this.grid[0].length * CELL_SIZE;
    const depth = this.grid.length * CELL_SIZE;

    const geometry = new THREE.PlaneGeometry(width, depth);
    const floor = new THREE.Mesh(geometry, this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(width / 2 - CELL_SIZE / 2, 0, depth / 2 - CELL_SIZE / 2);
    floor.receiveShadow = true;
    floor.name = 'Floor';
    this.group.add(floor);
  }

  /** Membangun langit-langit (ceiling) agar ruangan tertutup & atmosfer
   *  horror lebih terasa (tidak melihat langit kosong). */
  _buildCeiling() {
    const width = this.grid[0].length * CELL_SIZE;
    const depth = this.grid.length * CELL_SIZE;

    const geometry = new THREE.PlaneGeometry(width, depth);
    const ceiling = new THREE.Mesh(geometry, this.ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(width / 2 - CELL_SIZE / 2, WALL_HEIGHT, depth / 2 - CELL_SIZE / 2);
    ceiling.name = 'Ceiling';
    this.group.add(ceiling);
  }

  /** Membangun dinding berdasarkan grid: setiap sel bernilai 1 akan
   *  menjadi satu box dinding setinggi WALL_HEIGHT. */
  _buildWalls() {
    const wallGeometry = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);

    for (let row = 0; row < this.grid.length; row++) {
      for (let col = 0; col < this.grid[row].length; col++) {
        if (this.grid[row][col] !== 1) continue;

        const { x, z } = gridToWorld(col, row);
        const wall = new THREE.Mesh(wallGeometry, this.wallMaterial);
        wall.position.set(x, WALL_HEIGHT / 2, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.name = `Wall_${col}_${row}`;
        this.group.add(wall);

        // Simpan bounding box untuk collision detection pemain (AABB)
        const box = new THREE.Box3().setFromObject(wall);
        this.wallColliders.push(box);
      }
    }
  }

  /**
   * Mengecek tabrakan lingkaran pemain (posisi + radius) terhadap semua
   * dinding labirin menggunakan pendekatan AABB vs circle sederhana.
   * Mengembalikan vektor koreksi posisi jika terjadi penetrasi.
   *
   * @param {THREE.Vector3} position - posisi yang ingin dicek (akan diubah)
   * @param {number} radius - radius collider pemain
   */
  resolveCollision(position, radius = 0.4) {
    for (const box of this.wallColliders) {
      // Cari titik terdekat pada box terhadap posisi pemain
      const closestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
      const closestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);

      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const overlap = radius - dist;
        // Dorong posisi pemain keluar dari dinding sepanjang vektor normal
        position.x += (dx / dist) * overlap;
        position.z += (dz / dist) * overlap;
      }
    }
    return position;
  }
}
