import * as THREE from 'three';

export interface Footprint {
  x: number;
  z: number;
  w: number;
  d: number;
  yaw: number;
}

/**
 * Baked-looking ambient occlusion without SSAO: a soft dark skirt on the ground
 * around every building and stall base (one instanced, transparent quad each).
 * Grounds the low-poly blocks and costs a single draw call.
 */
export class ContactShadows {
  readonly mesh: THREE.InstancedMesh;
  private readonly texture: THREE.CanvasTexture;

  constructor(scene: THREE.Scene, footprints: Footprint[], spread = 0.4, opacity = 0.42) {
    const s = 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d')!;
    // Soft rounded-rectangle falloff: dark core fading out over the outer band.
    g.filter = 'blur(14px)';
    g.fillStyle = '#000';
    g.fillRect(26, 26, s - 52, s - 52);
    this.texture = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x241411,
      alphaMap: this.texture,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, footprints.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    // The texture's dark core spans the middle 60%: scale so the core matches the footprint.
    footprints.forEach((f, i) => {
      m.compose(new THREE.Vector3(f.x, 0.03, f.z), q.setFromAxisAngle(up, f.yaw), new THREE.Vector3((f.w + spread) / 0.6, 1, (f.d + spread) / 0.6));
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.renderOrder = 1;
    this.mesh.computeBoundingSphere();
    scene.add(this.mesh);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}
