import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import { GeoBuilder } from './geo/GeoBuilder';
import { Rng } from './geo/rng';
import { seaX } from './layout';
import { palette } from './palette';

/**
 * The Arabian Sea at golden hour: a faceted low-poly swell (flat-shaded in the
 * shader), a warm sun glitter that sparkles across the facets, foam at the wall,
 * plus the sea wall, the Marine Drive parapet and a line of tetrapods.
 */
export class Sea {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene, physics: Physics, sunDirection: THREE.Vector3) {
    // ── Water ──
    const geo = new THREE.PlaneGeometry(320, 420, 120, 150);
    geo.rotateX(-Math.PI / 2);
    geo.translate(-130, 0, 0);
    this.material = new THREE.ShaderMaterial({
      fog: true,
      // merge() clones values, so the shared sun vector is attached afterwards.
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: { value: 0 },
        uSunDir: { value: sunDirection },
        uDeep: { value: new THREE.Color(palette.seaDeep) },
        uShallow: { value: new THREE.Color(palette.seaShallow) },
        uSky: { value: new THREE.Color(palette.skyHorizon) },
        uSun: { value: new THREE.Color(palette.sun) },
      },
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        uniform float uTime;
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          float t = uTime;
          // Swell: a few crossing sines, damped right at the wall.
          float shore = w.x - (-48.0 + 0.0024 * w.z * w.z);
          float amp = 0.22 * smoothstep(-1.0, -8.0, shore);
          w.y += amp * (sin(w.x * 0.21 + t * 1.1) * 0.6 + sin(w.z * 0.17 - t * 0.8 + w.x * 0.07) * 0.5 + sin((w.x + w.z) * 0.43 + t * 1.7) * 0.25);
          vWorld = w.xyz;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform vec3 uSunDir, uDeep, uShallow, uSky, uSun;
        varying vec3 vWorld;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          // Flat facets: the low-poly look and the reason the glitter "flickers".
          vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
          if (n.y < 0.0) n = -n;
          vec3 V = normalize(cameraPosition - vWorld);
          float shore = vWorld.x - (-48.0 + 0.0024 * vWorld.z * vWorld.z);
          vec3 col = mix(uShallow, uDeep, smoothstep(-2.0, -40.0, shore));
          float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
          col = mix(col, uSky, fres * 0.55);
          vec3 L = normalize(uSunDir);
          vec3 R = reflect(-V, n);
          float spec = pow(max(dot(R, L), 0.0), 40.0);
          // Sun-coloured warm light on the facets facing the sun.
          col += uSun * max(dot(n, L), 0.0) * 0.12;
          // Glitter: random cells blink on, biased toward the sun's side.
          vec2 cell = floor(vWorld.xz * 1.6);
          float blink = hash(cell + floor(uTime * 3.0 + hash(cell) * 7.0));
          float sunSide = 0.35 + 0.65 * max(dot(normalize(vec3(L.x, 0.0, L.z)), normalize(vec3(-V.x, 0.0, -V.z))), 0.0);
          float glitter = smoothstep(0.965, 1.0, blink) * sunSide * smoothstep(-3.0, -10.0, shore);
          col += uSun * (spec * 1.4 + glitter * 1.1);
          // Foam where the swell slaps the wall.
          float foam = smoothstep(-2.6, -0.4, shore + sin(vWorld.z * 0.9 + uTime * 2.0) * 0.5);
          col = mix(col, vec3(0.95, 0.9, 0.82), foam * 0.75);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const water = new THREE.Mesh(geo, this.material);
    water.position.y = -1.25;
    this.group.add(water);
    this.disposables.push(geo, this.material);

    // ── Sea wall face + parapet (Marine Drive's long seat) ──
    const g = new GeoBuilder();
    const wall = new THREE.Color(palette.seaWall);
    const parapet = new THREE.Color(palette.parapet);
    const R = physics.R;
    for (let z = -110; z < 110; z += 2) {
      const x0 = seaX(z);
      const x1 = seaX(z + 2);
      g.frame();
      g.quad([{ x: x0, y: 0.14, z }, { x: x1, y: 0.14, z: z + 2 }, { x: x1, y: -2.6, z: z + 2 }, { x: x0, y: -2.6, z }], wall, { x: -1, y: 0, z: 0 });
      // parapet block: 0.45 thick, 0.6 tall, along the wall
      const cx = (x0 + x1) / 2 + 0.22;
      const yaw = Math.atan2(x1 - x0, 2);
      g.frame(cx, 0, z + 1, yaw).box(0, 0.44, 0, 0.45, 0.6, 2.02, parapet, { skip: 0 });
      // slightly darker cap
      g.box(0, 0.76, 0, 0.5, 0.06, 2.02, palette.parapetCap);
      physics.world.createCollider(
        R.ColliderDesc.cuboid(0.3, 1.6, 1.05)
          .setTranslation(cx, 1.6, z + 1)
          .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
      );
    }
    const wallGeo = g.build();
    const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.receiveShadow = true;
    this.group.add(wallMesh);
    this.disposables.push(wallGeo, wallMat);

    // ── Tetrapods: four stubby legs from a centre, piled in the surf ──
    const tg = new GeoBuilder();
    const legs: [number, number][] = [
      [0, 0],
      [1.91, 0],
      [1.91, (2 * Math.PI) / 3],
      [1.91, (4 * Math.PI) / 3],
    ];
    const tc = new THREE.Color(palette.tetrapod);
    for (const [tilt, spin] of legs) {
      tg.frame(0, 0, 0, spin);
      // leg from the hub outward: centre half a leg-length along its axis
      tg.cylinder(0, 0.55 * Math.cos(tilt), 0.55 * Math.sin(tilt), 0.16, 0.34, 1.1, 5, tc, { rx: tilt, cap: true });
    }
    const tetraGeo = tg.build();
    tetraGeo.translate(0, 0.25, 0);
    const tetraMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const rng = new Rng(77);
    const count = 140;
    const tetra = new THREE.InstancedMesh(tetraGeo, tetraMat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const z = -100 + (i / count) * 200 + rng.range(-0.6, 0.6);
      const out = rng.range(0.6, 3.6);
      p.set(seaX(z) - out, -1.55 + rng.range(-0.2, 0.25) + (out < 1.6 ? 0.25 : 0), z);
      q.setFromEuler(e.set(rng.range(-0.6, 0.6), rng.range(0, Math.PI * 2), rng.range(-0.6, 0.6)));
      const k = rng.range(0.8, 1.15);
      m.compose(p, q, s.set(k, k, k));
      tetra.setMatrixAt(i, m);
    }
    tetra.castShadow = false;
    tetra.receiveShadow = true;
    this.group.add(tetra);
    this.disposables.push(tetraGeo, tetraMat);

    scene.add(this.group);
  }

  update(elapsed: number): void {
    this.material.uniforms.uTime!.value = elapsed;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
  }
}
