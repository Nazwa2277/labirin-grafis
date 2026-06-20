/**
 * =========================================================================
 *  enemy.js
 * =========================================================================
 *  Monster penjaga labirin. Memiliki dua mode perilaku (state machine):
 *
 *   1. PATROL  -> bergerak mondar-mandir mengikuti titik-titik patroli
 *                 yang sudah ditentukan, selama pemain belum terdeteksi.
 *
 *   2. CHASE   -> begitu pemain masuk ke dalam DETECTION_RADIUS, monster
 *                 akan menggunakan algoritma A* (lihat pathfinding.js)
 *                 untuk menghitung jalur terpendek menuju posisi pemain,
 *                 lalu bergerak mengikuti jalur tersebut. Jalur dihitung
 *                 ulang (re-path) secara berkala agar tetap akurat saat
 *                 pemain berpindah posisi.
 *
 *  Monster akan "menangkap" pemain jika jaraknya kurang dari CATCH_RADIUS.
 * =========================================================================
 */

import * as THREE from 'three';
import { MAZE_LAYOUT, gridToWorld, worldToGrid } from './maze.js';
import { findPathAStar, simplifyPath } from './pathfinding.js';

const DETECTION_RADIUS = 7.0;   // satuan dunia — radius deteksi pemain
const CATCH_RADIUS = 0.9;       // satuan dunia — jarak untuk "menangkap" pemain
const REPATH_INTERVAL = 0.6;    // detik — seberapa sering A* dihitung ulang
const PATROL_POINT_RADIUS = 0.3; // toleransi sampai di titik tujuan

// Titik-titik patroli (grid). Monster akan berjalan mengelilingi titik ini
// secara berurutan selama belum mendeteksi pemain.
const PATROL_POINTS = [
  { col: 13, row: 13 },
  { col: 13, row: 9 },
  { col: 9, row: 9 },
  { col: 9, row: 13 },
];

export class Enemy {
  /**
   * @param {THREE.Scene} scene
   * @param {{col:number,row:number}} spawnGridPos
   * @param {number} baseSpeed - kecepatan dasar (satuan/detik), diatur dari GUI
   */
  constructor(scene, spawnGridPos, baseSpeed = 2.2) {
    this.scene = scene;
    this.grid = MAZE_LAYOUT;
    this.baseSpeed = baseSpeed;
    this.speed = baseSpeed;

    this.state = 'PATROL'; // 'PATROL' | 'CHASE'
    this.path = [];          // array {col, row} hasil A*
    this.pathIndex = 0;
    this.repathTimer = 0;

    this.patrolIndex = 0;

    this.hasCaughtPlayer = false;

    this._buildMesh();
    this.setGridPosition(spawnGridPos.col, spawnGridPos.row);

    // Debug path visual (opsional, bisa di-toggle dari GUI)
    this.debugPathEnabled = false;
    this._buildDebugPathLine();
  }

  /** Membangun mesh visual monster: bentuk humanoid sederhana low-poly
   *  agar tetap performant namun terlihat menyeramkan dengan lighting. */
  _buildMesh() {
    this.group = new THREE.Group();
    this.group.name = 'Enemy';

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a0505,
      roughness: 0.85,
      metalness: 0.1,
      emissive: 0x330000,
      emissiveIntensity: 0.15,
    });

    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 2.0,
    });

    // Torso
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), bodyMat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    this.group.add(torso);

    // Kepala
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), bodyMat);
    head.position.y = 1.65;
    head.castShadow = true;
    this.group.add(head);

    // Mata (glow merah, menyeramkan dalam gelap)
    const eyeGeo = new THREE.SphereGeometry(0.05, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.1, 1.68, 0.23);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.1, 1.68, 0.23);
    this.group.add(eyeL, eyeR);

    // Lengan
    const armGeo = new THREE.CapsuleGeometry(0.09, 0.7, 4, 6);
    const armL = new THREE.Mesh(armGeo, bodyMat);
    armL.position.set(-0.42, 0.95, 0);
    armL.rotation.z = 0.2;
    const armR = new THREE.Mesh(armGeo, bodyMat);
    armR.position.set(0.42, 0.95, 0);
    armR.rotation.z = -0.2;
    this.group.add(armL, armR);

    // Lampu kecil di mata agar terlihat menyala dalam fog/gelap
    this.eyeGlow = new THREE.PointLight(0xff1111, 0.6, 3);
    this.eyeGlow.position.set(0, 1.68, 0.2);
    this.group.add(this.eyeGlow);

    this.scene.add(this.group);
  }

  /** Garis debug untuk memvisualisasikan jalur A* yang sedang diikuti. */
  _buildDebugPathLine() {
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const geometry = new THREE.BufferGeometry();
    this.debugLine = new THREE.Line(geometry, material);
    this.debugLine.visible = false;
    this.scene.add(this.debugLine);
  }

  setDebugPathVisible(visible) {
    this.debugPathEnabled = visible;
    this.debugLine.visible = visible;
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  setGridPosition(col, row) {
    const { x, z } = gridToWorld(col, row);
    this.group.position.set(x, 0, z);
  }

  getGridPosition() {
    return worldToGrid(this.group.position.x, this.group.position.z);
  }

  /**
   * =====================================================================
   *  UPDATE UTAMA — dipanggil setiap frame dari main.js
   * =====================================================================
   * @param {number} delta - waktu sejak frame sebelumnya (detik)
   * @param {Player} player - instance pemain, untuk mengetahui posisinya
   */
  update(delta, player) {
    if (this.hasCaughtPlayer) return;

    const myPos = this.group.position;
    const playerPos = player.camera.position;
    const distanceToPlayer = myPos.distanceTo(
      new THREE.Vector3(playerPos.x, myPos.y, playerPos.z)
    );

    // -------------------------------------------------------------
    // STATE TRANSITION: PATROL <-> CHASE berdasarkan jarak deteksi
    // -------------------------------------------------------------
    if (distanceToPlayer <= DETECTION_RADIUS) {
      if (this.state !== 'CHASE') {
        this.state = 'CHASE';
        this.repathTimer = 0; // paksa hitung path A* segera
      }
    } else if (distanceToPlayer > DETECTION_RADIUS * 1.4) {
      // Beri sedikit hysteresis (radius keluar lebih besar dari radius
      // masuk) agar monster tidak "flip-flop" state di tepi radius.
      if (this.state !== 'PATROL') {
        this.state = 'PATROL';
        this.path = [];
        this.pathIndex = 0;
      }
    }

    // Cek apakah pemain tertangkap
    if (this.state === 'CHASE' && distanceToPlayer <= CATCH_RADIUS) {
      this.hasCaughtPlayer = true;
      return;
    }

    if (this.state === 'CHASE') {
      this._updateChase(delta, player);
    } else {
      this._updatePatrol(delta);
    }

    // Animasi sederhana: monster sedikit "mengambang" naik-turun agar
    // terasa hidup
    this.group.position.y = Math.sin(performance.now() * 0.006) * 0.05;
  }

  /**
   * Mode CHASE: menghitung ulang jalur A* secara berkala menuju posisi
   * pemain saat ini, lalu bergerak mengikuti titik-titik jalur tersebut.
   */
  _updateChase(delta, player) {
    this.repathTimer -= delta;

    if (this.repathTimer <= 0) {
      this.repathTimer = REPATH_INTERVAL;

      const startGrid = this.getGridPosition();
      const goalGrid = player.getGridPosition();

      // ---------------------------------------------------------
      // PEMANGGILAN ALGORITMA A* — lihat pathfinding.js
      // ---------------------------------------------------------
      const rawPath = findPathAStar(this.grid, startGrid, goalGrid);

      if (rawPath && rawPath.length > 1) {
        this.path = simplifyPath(rawPath);
        this.pathIndex = 1; // index 0 adalah posisi start itu sendiri
        this._updateDebugLine();
      }
    }

    this._followPath(delta);
  }

  /** Mode PATROL: bergerak menuju titik patroli berikutnya secara berurutan,
   *  juga memakai A* agar monster tetap menghindari dinding dengan benar. */
  _updatePatrol(delta) {
    if (this.path.length === 0) {
      const startGrid = this.getGridPosition();
      const targetGrid = PATROL_POINTS[this.patrolIndex];

      const rawPath = findPathAStar(this.grid, startGrid, targetGrid);
      if (rawPath && rawPath.length > 1) {
        this.path = simplifyPath(rawPath);
        this.pathIndex = 1;
        this._updateDebugLine();
      } else {
        // Tidak ada jalur (seharusnya jarang terjadi), lanjut ke titik berikutnya
        this.patrolIndex = (this.patrolIndex + 1) % PATROL_POINTS.length;
        return;
      }
    }

    const reachedEnd = this._followPath(delta, this.speed * 0.55); // patrol lebih pelan

    if (reachedEnd) {
      this.patrolIndex = (this.patrolIndex + 1) % PATROL_POINTS.length;
      this.path = [];
    }
  }

  /**
   * Menggerakkan monster mengikuti this.path (hasil A*) selangkah demi
   * selangkah menuju setiap waypoint, dengan interpolasi posisi halus.
   *
   * @returns {boolean} true jika sudah sampai di titik akhir jalur
   */
  _followPath(delta, overrideSpeed) {
    if (this.path.length === 0 || this.pathIndex >= this.path.length) return true;

    const speed = overrideSpeed ?? this.speed;
    const targetGridPoint = this.path[this.pathIndex];
    const targetWorld = gridToWorld(targetGridPoint.col, targetGridPoint.row);
    const targetVec = new THREE.Vector3(targetWorld.x, this.group.position.y, targetWorld.z);

    const toTarget = new THREE.Vector3().subVectors(targetVec, this.group.position);
    const distance = toTarget.length();

    if (distance < PATROL_POINT_RADIUS) {
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) return true;
      return false;
    }

    toTarget.normalize();
    this.group.position.x += toTarget.x * speed * delta;
    this.group.position.z += toTarget.z * speed * delta;

    // Hadapkan monster ke arah gerak
    const angle = Math.atan2(toTarget.x, toTarget.z);
    this.group.rotation.y = angle;

    return false;
  }

  /** Memperbarui garis hijau debug agar sesuai jalur A* terbaru. */
  _updateDebugLine() {
    if (!this.path || this.path.length === 0) return;
    const points = this.path.map((p) => {
      const w = gridToWorld(p.col, p.row);
      return new THREE.Vector3(w.x, 0.05, w.z);
    });
    this.debugLine.geometry.dispose();
    this.debugLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  /** Status untuk ditampilkan di HUD. */
  getStatusLabel() {
    return this.state === 'CHASE' ? 'MENGEJAR!' : 'Berpatroli';
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.debugLine);
  }
}
