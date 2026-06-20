/**
 * =========================================================================
 *  player.js
 * =========================================================================
 *  Mengelola:
 *   - Kamera FPS (First Person) menggunakan PointerLockControls
 *   - Input keyboard WASD + Shift (lari)
 *   - Pergerakan halus dengan akselerasi/deselerasi sederhana
 *   - Collision detection terhadap dinding labirin (lewat Maze.resolveCollision)
 *   - Senter (SpotLight) yang menempel pada kamera pemain
 * =========================================================================
 */

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { gridToWorld, worldToGrid } from './maze.js';

const WALK_SPEED = 4.0;       // satuan/detik
const RUN_SPEED = 7.0;        // satuan/detik
const PLAYER_RADIUS = 0.45;   // radius collider pemain
const PLAYER_HEIGHT = 1.7;    // tinggi mata kamera dari lantai

export class Player {
  /**
   * @param {THREE.Camera} camera
   * @param {HTMLElement} domElement
   * @param {import('./maze.js').Maze} maze
   */
  constructor(camera, domElement, maze) {
    this.camera = camera;
    this.maze = maze;
    this.domElement = domElement;

    this.controls = new PointerLockControls(camera, domElement);

    // Status pergerakan
    this.move = { forward: false, backward: false, left: false, right: false, run: false };
    this.velocity = new THREE.Vector3();

    // Posisi awal akan di-set dari main.js lewat spawnAt()
    this.camera.position.y = PLAYER_HEIGHT;

    // Status game
    this.hasKey = false;
    this.isCaught = false;

    this._setupFlashlight();
    this._setupInput();
  }

  /** Senter yang mengikuti arah pandang kamera pemain. */
  _setupFlashlight() {
    this.flashlight = new THREE.SpotLight(0xfff2cc, 8.0, 32, Math.PI / 5.5, 0.4, 1.0);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.001;

    this.flashlightTarget = new THREE.Object3D();

    this.camera.add(this.flashlight);
    this.camera.add(this.flashlight.target);
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.target.position.set(0, 0, -1);

    this.flashlightOn = true;
  }

  toggleFlashlight(forceState) {
    this.flashlightOn = forceState !== undefined ? forceState : !this.flashlightOn;
    this.flashlight.visible = this.flashlightOn;
  }

  _setupInput() {
    this._onKeyDown = (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.move.forward = true; break;
        case 'KeyS': case 'ArrowDown': this.move.backward = true; break;
        case 'KeyA': case 'ArrowLeft': this.move.left = true; break;
        case 'KeyD': case 'ArrowRight': this.move.right = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.move.run = true; break;
        case 'KeyF': this.toggleFlashlight(); break;
      }
    };
    this._onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.move.forward = false; break;
        case 'KeyS': case 'ArrowDown': this.move.backward = false; break;
        case 'KeyA': case 'ArrowLeft': this.move.left = false; break;
        case 'KeyD': case 'ArrowRight': this.move.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.move.run = false; break;
      }
    };
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  /** Menempatkan pemain pada koordinat grid (col, row) tertentu. */
  spawnAt(col, row) {
    const { x, z } = gridToWorld(col, row);
    this.camera.position.set(x, PLAYER_HEIGHT, z);
    this.velocity.set(0, 0, 0);
  }

  /** Mengembalikan posisi grid pemain saat ini (dipakai oleh A* musuh). */
  getGridPosition() {
    return worldToGrid(this.camera.position.x, this.camera.position.z);
  }

  /** Update tiap frame: hitung pergerakan + collision. */
  update(delta) {
    if (this.isCaught || !this.controls.isLocked) return;

    const speed = this.move.run ? RUN_SPEED : WALK_SPEED;

    // Deselerasi (gesekan) agar gerakan tidak terasa kaku
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;

    const direction = new THREE.Vector3();
    direction.z = Number(this.move.forward) - Number(this.move.backward);
    direction.x = Number(this.move.right) - Number(this.move.left);
    direction.normalize();

    if (this.move.forward || this.move.backward) this.velocity.z -= direction.z * speed * 10.0 * delta;
    if (this.move.left || this.move.right) this.velocity.x -= direction.x * speed * 10.0 * delta;

    // PointerLockControls menyediakan moveRight/moveForward relatif arah kamera
    this.controls.moveRight(-this.velocity.x * delta);
    this.controls.moveForward(-this.velocity.z * delta);

    // Jaga ketinggian kamera tetap konstan (tidak ada gravitasi/lompat)
    this.camera.position.y = PLAYER_HEIGHT;

    // Collision dengan dinding labirin
    this.maze.resolveCollision(this.camera.position, PLAYER_RADIUS);
  }

  /** Apakah pemain sedang aktif menekan tombol gerak (dipakai untuk audio footstep). */
  isMoving() {
    return (
      this.controls.isLocked &&
      !this.isCaught &&
      (this.move.forward || this.move.backward || this.move.left || this.move.right)
    );
  }

  /** Apakah pemain sedang dalam mode lari (Shift ditahan). */
  isRunning() {
    return this.move.run;
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
  }
}
