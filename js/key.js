/**
 * =========================================================================
 *  key.js
 * =========================================================================
 *  Objek kunci yang harus ditemukan pemain di dalam labirin. Kunci
 *  ditampilkan sebagai mesh 3D berputar dengan efek mengambang (floating)
 *  dan glow emissive agar mudah terlihat dalam kegelapan/fog.
 * =========================================================================
 */

import * as THREE from 'three';
import { gridToWorld } from './maze.js';

export class GameKey {
  /**
   * @param {THREE.Scene} scene
   * @param {{col:number, row:number}} gridPosition
   */
  constructor(scene, gridPosition) {
    this.scene = scene;
    this.collected = false;

    const { x, z } = gridToWorld(gridPosition.col, gridPosition.row);
    this.basePosition = new THREE.Vector3(x, 1.1, z);

    this._buildMesh();
  }

  _buildMesh() {
    this.group = new THREE.Group();
    this.group.name = 'KeyPickup';
    this.group.position.copy(this.basePosition);

    const goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      emissive: 0xd4af37,
      emissiveIntensity: 0.5,
      metalness: 0.85,
      roughness: 0.25,
    });

    // Bentuk kunci sederhana: cincin (torus) + batang + gigi kunci
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 12, 24), goldMaterial);
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.45, 10), goldMaterial);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.3;
    this.group.add(shaft);

    const tooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), goldMaterial);
    tooth1.position.set(0.06, 0, 0.5);
    this.group.add(tooth1);

    const tooth2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.05), goldMaterial);
    tooth2.position.set(0.05, 0, 0.4);
    this.group.add(tooth2);

    // Cahaya kecil agar kunci "bersinar" dalam gelap, jadi penanda visual jelas
    this.glowLight = new THREE.PointLight(0xffd700, 1.1, 4);
    this.glowLight.position.set(0, 0, 0);
    this.group.add(this.glowLight);

    this.scene.add(this.group);
  }

  /** Animasi berputar + mengambang naik-turun, dipanggil setiap frame. */
  update(elapsedTime) {
    if (this.collected) return;
    this.group.rotation.y = elapsedTime * 1.5;
    this.group.position.y = this.basePosition.y + Math.sin(elapsedTime * 2.0) * 0.12;
  }

  /** Mengecek apakah pemain cukup dekat untuk mengambil kunci. */
  checkPickup(playerPosition, pickupRadius = 1.0) {
    if (this.collected) return false;
    const dist = this.group.position.distanceTo(
      new THREE.Vector3(playerPosition.x, this.group.position.y, playerPosition.z)
    );
    if (dist <= pickupRadius) {
      this.collect();
      return true;
    }
    return false;
  }

  collect() {
    this.collected = true;
    this.scene.remove(this.group);
  }
}
