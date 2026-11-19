import * as THREE from 'three';
import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/Physics';
import { palette } from './palette';

/**
 * TEMPORARY (milestones 1–2): palette-coloured shapes to judge lighting and to
 * bump into while tuning the rickshaw. A crate pyramid, a drum, a ball, cones
 * and one fixed "building". Replaced by the real street in milestone 3.
 */
export class CalibrationProps {
  readonly group = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly bodies: RAPIER.RigidBody[] = [];

  constructor(
    scene: THREE.Scene,
    private readonly physics: Physics,
  ) {
    const R = physics.R;
    const mat = (color: number) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, flatShading: true });
      this.materials.push(m);
      return m;
    };
    const add = (
      geo: THREE.BufferGeometry,
      material: THREE.Material,
      collider: RAPIER.ColliderDesc,
      x: number,
      y: number,
      z: number,
      dynamic = true,
      ry = 0,
    ) => {
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      const desc = (dynamic ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.fixed())
        .setTranslation(x, y, z)
        .setRotation({ x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) });
      const body = physics.world.createRigidBody(desc);
      physics.world.createCollider(collider.setFriction(0.7).setRestitution(0.2), body);
      physics.link(body, mesh);
      this.bodies.push(body);
    };

    // Crate pyramid in the rickshaw's path (≈6 kg each, so they scatter but don't feel weightless).
    const crate = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    this.geometries.push(crate);
    const crateMat = mat(palette.marigold);
    const rows = [3, 2, 1];
    rows.forEach((n, row) => {
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.64;
        add(crate, crateMat, R.ColliderDesc.cuboid(0.3, 0.3, 0.3).setDensity(28), x, 0.3 + row * 0.61, -14);
      }
    });

    const drum = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 7);
    const ball = new THREE.IcosahedronGeometry(0.6, 0);
    const cone = new THREE.ConeGeometry(0.28, 0.8, 6);
    const block = new THREE.BoxGeometry(4, 3.2, 3);
    this.geometries.push(drum, ball, cone, block);
    add(drum, mat(palette.terracotta), R.ColliderDesc.cylinder(0.55, 0.45).setDensity(40), -3, 0.55, -6);
    add(ball, mat(palette.sea), R.ColliderDesc.ball(0.58).setDensity(8), 3, 0.6, -8);
    const coneMat = mat(palette.cream);
    for (let i = 0; i < 5; i++) {
      add(cone, coneMat, R.ColliderDesc.cone(0.4, 0.28).setDensity(30), 2.5, 0.4, -20 - i * 3.5);
    }
    add(block, mat(palette.cream), R.ColliderDesc.cuboid(2, 1.6, 1.5), -9, 1.6, -10, false, 0.1);

    scene.add(this.group);
  }

  dispose(): void {
    this.group.children.forEach((c) => this.physics.unlink(c));
    this.bodies.forEach((b) => this.physics.world.removeRigidBody(b));
    this.group.removeFromParent();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
