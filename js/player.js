import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { gridToWorld, worldToGrid } from './maze.js';

const WALK_SPEED = 4.0;
const RUN_SPEED = 7.0;
const PLAYER_RADIUS = 0.45;
const PLAYER_HEIGHT = 1.7;

export class Player {
  constructor(camera, domElement, maze) {
    this.camera = camera;
    this.maze = maze;
    this.domElement = domElement;

    this.controls = new PointerLockControls(camera, domElement);

    this.move = { forward: false, backward: false, left: false, right: false, run: false };
    this.velocity = new THREE.Vector3();

    this.camera.position.y = PLAYER_HEIGHT;

    this.hasKey = false;
    this.isCaught = false;

    this._setupInput();
  }

  _setupInput() {
    this._onKeyDown = (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.move.forward = true; break;
        case 'KeyS': case 'ArrowDown': this.move.backward = true; break;
        case 'KeyA': case 'ArrowLeft': this.move.left = true; break;
        case 'KeyD': case 'ArrowRight': this.move.right = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.move.run = true; break;
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

  spawnAt(col, row) {
    const { x, z } = gridToWorld(col, row);
    this.camera.position.set(x, PLAYER_HEIGHT, z);
    this.velocity.set(0, 0, 0);
  }

  getGridPosition() {
    return worldToGrid(this.camera.position.x, this.camera.position.z);
  }

  update(delta) {
    if (this.isCaught || !this.controls.isLocked) return;

    const speed = this.move.run ? RUN_SPEED : WALK_SPEED;

    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;

    const direction = new THREE.Vector3();
    direction.z = Number(this.move.forward) - Number(this.move.backward);
    direction.x = Number(this.move.right) - Number(this.move.left);
    direction.normalize();

    if (this.move.forward || this.move.backward) this.velocity.z -= direction.z * speed * 10.0 * delta;
    if (this.move.left || this.move.right) this.velocity.x -= direction.x * speed * 10.0 * delta;

    this.controls.moveRight(-this.velocity.x * delta);
    this.controls.moveForward(-this.velocity.z * delta);

    this.camera.position.y = PLAYER_HEIGHT;

    this.maze.resolveCollision(this.camera.position, PLAYER_RADIUS);
  }

  isMoving() {
    return (
      this.controls.isLocked &&
      !this.isCaught &&
      (this.move.forward || this.move.backward || this.move.left || this.move.right)
    );
  }

  isRunning() {
    return this.move.run;
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
  }
}
