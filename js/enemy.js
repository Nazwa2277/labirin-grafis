import * as THREE from 'three';
import { MAZE_LAYOUT, gridToWorld, worldToGrid } from './maze.js';
import { findPathAStar, simplifyPath } from './pathfinding.js';

const DETECTION_RADIUS = 7.0;
const CATCH_RADIUS = 0.9;
const REPATH_INTERVAL = 0.6;
const PATROL_POINT_RADIUS = 0.3;

const PATROL_POINTS = [
  { col: 13, row: 13 },
  { col: 13, row: 9 },
  { col: 9, row: 9 },
  { col: 9, row: 13 },
];

export class Enemy {
  constructor(scene, spawnGridPos, baseSpeed = 2.2) {
    this.scene = scene;
    this.grid = MAZE_LAYOUT;
    this.baseSpeed = baseSpeed;
    this.speed = baseSpeed;

    this.state = 'PATROL';
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.patrolIndex = 0;
    this.hasCaughtPlayer = false;

    this._buildMesh();
    this.setGridPosition(spawnGridPos.col, spawnGridPos.row);

    this.debugPathEnabled = false;
    this._buildDebugPathLine();
  }

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

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), bodyMat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    this.group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), bodyMat);
    head.position.y = 1.65;
    head.castShadow = true;
    this.group.add(head);

    const eyeGeo = new THREE.SphereGeometry(0.05, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.1, 1.68, 0.23);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.1, 1.68, 0.23);
    this.group.add(eyeL, eyeR);

    const armGeo = new THREE.CapsuleGeometry(0.09, 0.7, 4, 6);
    const armL = new THREE.Mesh(armGeo, bodyMat);
    armL.position.set(-0.42, 0.95, 0);
    armL.rotation.z = 0.2;
    const armR = new THREE.Mesh(armGeo, bodyMat);
    armR.position.set(0.42, 0.95, 0);
    armR.rotation.z = -0.2;
    this.group.add(armL, armR);

    this.eyeGlow = new THREE.PointLight(0xff1111, 0.6, 3);
    this.eyeGlow.position.set(0, 1.68, 0.2);
    this.group.add(this.eyeGlow);

    this.scene.add(this.group);
  }

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

  setSpeed(speed) { this.speed = speed; }

  setGridPosition(col, row) {
    const { x, z } = gridToWorld(col, row);
    this.group.position.set(x, 0, z);
  }

  getGridPosition() {
    return worldToGrid(this.group.position.x, this.group.position.z);
  }

  update(delta, player) {
    if (this.hasCaughtPlayer) return;

    const myPos = this.group.position;
    const playerPos = player.camera.position;
    const distanceToPlayer = myPos.distanceTo(
      new THREE.Vector3(playerPos.x, myPos.y, playerPos.z)
    );

    if (distanceToPlayer <= DETECTION_RADIUS) {
      if (this.state !== 'CHASE') {
        this.state = 'CHASE';
        this.repathTimer = 0;
      }
    } else if (distanceToPlayer > DETECTION_RADIUS * 1.4) {
      if (this.state !== 'PATROL') {
        this.state = 'PATROL';
        this.path = [];
        this.pathIndex = 0;
      }
    }

    if (this.state === 'CHASE' && distanceToPlayer <= CATCH_RADIUS) {
      this.hasCaughtPlayer = true;
      return;
    }

    if (this.state === 'CHASE') {
      this._updateChase(delta, player);
    } else {
      this._updatePatrol(delta);
    }

    this.group.position.y = Math.sin(performance.now() * 0.006) * 0.05;
  }

  _updateChase(delta, player) {
    this.repathTimer -= delta;

    if (this.repathTimer <= 0) {
      this.repathTimer = REPATH_INTERVAL;
      const startGrid = this.getGridPosition();
      const goalGrid = player.getGridPosition();
      const rawPath = findPathAStar(this.grid, startGrid, goalGrid);
      if (rawPath && rawPath.length > 1) {
        this.path = simplifyPath(rawPath);
        this.pathIndex = 1;
        this._updateDebugLine();
      }
    }

    this._followPath(delta);
  }

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
        this.patrolIndex = (this.patrolIndex + 1) % PATROL_POINTS.length;
        return;
      }
    }

    const reachedEnd = this._followPath(delta, this.speed * 0.55);
    if (reachedEnd) {
      this.patrolIndex = (this.patrolIndex + 1) % PATROL_POINTS.length;
      this.path = [];
    }
  }

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

    const angle = Math.atan2(toTarget.x, toTarget.z);
    this.group.rotation.y = angle;

    return false;
  }

  _updateDebugLine() {
    if (!this.path || this.path.length === 0) return;
    const points = this.path.map((p) => {
      const w = gridToWorld(p.col, p.row);
      return new THREE.Vector3(w.x, 0.05, w.z);
    });
    this.debugLine.geometry.dispose();
    this.debugLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  getStatusLabel() {
    return this.state === 'CHASE' ? 'MENGEJAR!' : 'Berpatroli';
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.debugLine);
  }
}
