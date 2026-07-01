import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { gridToWorld, worldToGrid } from './maze.js';

const WALK_SPEED = 4.0;
const RUN_SPEED = 7.0;
const PLAYER_RADIUS = 0.45;
const PLAYER_HEIGHT = 1.7;

const IS_MOBILE = window.matchMedia('(pointer: coarse)').matches;

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
    this.door = null;

    this._mobileActive = false;

    this._setupInput();
    if (IS_MOBILE) this._setupMobileControls();
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

  _setupMobileControls() {
    const joystickZone = document.getElementById('joystick-zone');
    const thumb = document.getElementById('joystick-thumb');
    const lookZone = document.getElementById('look-zone');
    const btnSprint = document.getElementById('btn-sprint');

    if (!joystickZone || !thumb || !lookZone) return;

    const RADIUS = 44;
    let joyId = null;
    let joyOrigin = { x: 0, y: 0 };

    const updateJoy = (cx, cy) => {
      const rect = joystickZone.getBoundingClientRect();
      const ox = rect.left + rect.width / 2;
      const oy = rect.top + rect.height / 2;
      let dx = cx - ox;
      let dy = cy - oy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > RADIUS) { dx = dx / dist * RADIUS; dy = dy / dist * RADIUS; }

      thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

      const nx = dx / RADIUS;
      const ny = dy / RADIUS;
      const deadzone = 0.18;

      this.move.forward  = ny < -deadzone;
      this.move.backward = ny >  deadzone;
      this.move.left     = nx < -deadzone;
      this.move.right    = nx >  deadzone;
    };

    const resetJoy = () => {
      thumb.style.transform = 'translate(-50%, -50%)';
      this.move.forward = this.move.backward = this.move.left = this.move.right = false;
      joyId = null;
    };

    joystickZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (joyId !== null) return;
      const t = e.changedTouches[0];
      joyId = t.identifier;
      updateJoy(t.clientX, t.clientY);
    }, { passive: false });

    joystickZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) updateJoy(t.clientX, t.clientY);
      }
    }, { passive: false });

    joystickZone.addEventListener('touchend', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) resetJoy();
      }
    }, { passive: false });

    joystickZone.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      resetJoy();
    }, { passive: false });

    let lookId = null;
    let lastLook = { x: 0, y: 0 };
    const LOOK_SENSITIVITY = 0.003;

    lookZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (lookId !== null) return;
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lastLook = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    lookZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        const dx = t.clientX - lastLook.x;
        const dy = t.clientY - lastLook.y;
        lastLook = { x: t.clientX, y: t.clientY };

        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y -= dx * LOOK_SENSITIVITY * 2.5;
        this.camera.rotation.x -= dy * LOOK_SENSITIVITY * 2.5;
        this.camera.rotation.x = Math.max(
          -Math.PI / 2.2,
          Math.min(Math.PI / 2.2, this.camera.rotation.x)
        );
      }
    }, { passive: false });

    lookZone.addEventListener('touchend', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === lookId) lookId = null;
      }
    }, { passive: false });

    lookZone.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      lookId = null;
    }, { passive: false });

    if (btnSprint) {
      btnSprint.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.move.run = true;
      }, { passive: false });
      btnSprint.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.move.run = false;
      }, { passive: false });
      btnSprint.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        this.move.run = false;
      }, { passive: false });
    }

    this._mobileActive = true;
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
    if (this.isCaught) return;

    const isLocked = this.controls.isLocked || this._mobileActive;
    if (!isLocked) return;

    const speed = this.move.run ? RUN_SPEED : WALK_SPEED;

    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;

    const direction = new THREE.Vector3();
    direction.z = Number(this.move.forward) - Number(this.move.backward);
    direction.x = Number(this.move.right) - Number(this.move.left);
    direction.normalize();

    if (this.move.forward || this.move.backward) this.velocity.z -= direction.z * speed * 10.0 * delta;
    if (this.move.left || this.move.right) this.velocity.x -= direction.x * speed * 10.0 * delta;

    if (this._mobileActive) {
      const forward = new THREE.Vector3();
      const right = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      this.camera.position.addScaledVector(right, -this.velocity.x * delta);
      this.camera.position.addScaledVector(forward, -this.velocity.z * delta);
    } else {
      this.controls.moveRight(-this.velocity.x * delta);
      this.controls.moveForward(-this.velocity.z * delta);
    }

    this.camera.position.y = PLAYER_HEIGHT;

    const doorCollider = this.door ? this.door.getCollider() : null;
    const extra = doorCollider ? [doorCollider] : [];
    this.maze.resolveCollision(this.camera.position, PLAYER_RADIUS, extra);
  }

  isMoving() {
    const active = this.controls.isLocked || this._mobileActive;
    return (
      active &&
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
