import * as THREE from 'three';
import { CELL_SIZE } from './maze.js';

export class Minimap {
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
    this.cellSize = this.canvas.width / this.cols;
  }

  update() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(10, 8, 8, 0.7)';
    ctx.fillRect(0, 0, w, h);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] === 1) {
          ctx.fillStyle = '#444455';
          ctx.fillRect(c * this.cellSize, r * this.cellSize, this.cellSize, this.cellSize);
          ctx.strokeStyle = '#222233';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(c * this.cellSize, r * this.cellSize, this.cellSize, this.cellSize);
        } else {
          ctx.fillStyle = 'rgba(20, 20, 25, 0.5)';
          ctx.fillRect(c * this.cellSize, r * this.cellSize, this.cellSize, this.cellSize);
        }
      }
    }

    if (this.player && !this.player.isCaught) {
      const playerGridCol = this.player.camera.position.x / CELL_SIZE;
      const playerGridRow = this.player.camera.position.z / CELL_SIZE;

      const px = (playerGridCol + 0.5) * this.cellSize;
      const py = (playerGridRow + 0.5) * this.cellSize;

      const dir = new THREE.Vector3();
      this.player.camera.getWorldDirection(dir);
      const angle = Math.atan2(dir.x, dir.z);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);

      ctx.beginPath();
      ctx.moveTo(0, -this.cellSize * 0.5);
      ctx.lineTo(-this.cellSize * 0.35, this.cellSize * 0.45);
      ctx.lineTo(0, this.cellSize * 0.2);
      ctx.lineTo(this.cellSize * 0.35, this.cellSize * 0.45);
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
