/**
 * =========================================================================
 *  minimap.js
 * =========================================================================
 *  Menampilkan minimap 2D yang menunjukan layout labirin, posisi pemain
 *  (beserta arah hadap kamera dan sorotan senter), posisi kunci, posisi
 *  pintu keluar, dan posisi musuh secara real-time.
 * =========================================================================
 */

import * as THREE from 'three';
import { CELL_SIZE } from './maze.js';

export class Minimap {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./maze.js').Maze} maze
   * @param {import('./player.js').Player} player
   * @param {import('./enemy.js').Enemy} enemy
   * @param {import('./key.js').GameKey} gameKey
   * @param {import('./door.js').Door} door
   */
  constructor(canvas, maze, player, enemy, gameKey, door) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.maze = maze;
    this.player = player;
    this.enemy = enemy;
    this.gameKey = gameKey;
    this.door = door;

    this.grid = maze.grid;
    this.rows = this.grid.length;
    this.cols = this.grid[0].length;

    // Hitung ukuran pixel per sel
    this.cellSize = this.canvas.width / this.cols;
  }

  update() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Bersihkan canvas
    ctx.clearRect(0, 0, w, h);

    // Gambar background minimap
    ctx.fillStyle = 'rgba(10, 8, 8, 0.7)';
    ctx.fillRect(0, 0, w, h);

    // Gambar dinding & jalan labirin
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] === 1) {
          // Dinding abu-abu kebiruan
          ctx.fillStyle = '#444455';
          ctx.fillRect(c * this.cellSize, r * this.cellSize, this.cellSize, this.cellSize);
          
          // Border garis kecil antar grid
          ctx.strokeStyle = '#222233';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(c * this.cellSize, r * this.cellSize, this.cellSize, this.cellSize);
        } else {
          // Jalan berwarna hitam transparan
          ctx.fillStyle = 'rgba(20, 20, 25, 0.5)';
          ctx.fillRect(c * this.cellSize, r * this.cellSize, this.cellSize, this.cellSize);
        }
      }
    }



    // Gambar pemain (Player)
    if (this.player && !this.player.isCaught) {
      const playerGridCol = this.player.camera.position.x / CELL_SIZE;
      const playerGridRow = this.player.camera.position.z / CELL_SIZE;

      const px = (playerGridCol + 0.5) * this.cellSize;
      const py = (playerGridRow + 0.5) * this.cellSize;

      // Ambil arah pandang kamera
      const dir = new THREE.Vector3();
      this.player.camera.getWorldDirection(dir);
      const angle = Math.atan2(dir.x, dir.z); // Sudut radian pada bidang X-Z

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);

      // Gambar area sorotan lampu senter
      if (this.player.flashlightOn) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, this.cellSize * 2.8, -Math.PI / 6, Math.PI / 6);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 245, 221, 0.3)';
        ctx.fill();
      }

      // Gambar anak panah pemain (warna biru muda cyan)
      ctx.beginPath();
      ctx.moveTo(0, -this.cellSize * 0.5); // Ujung depan
      ctx.lineTo(-this.cellSize * 0.35, this.cellSize * 0.45); // Sudut kiri belakang
      ctx.lineTo(0, this.cellSize * 0.2); // Cekukan tengah
      ctx.lineTo(this.cellSize * 0.35, this.cellSize * 0.45); // Sudut kanan belakang
      ctx.closePath();

      ctx.fillStyle = '#33ccff';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();
    }
  }
}
