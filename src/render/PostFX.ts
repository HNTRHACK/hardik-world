import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Mood } from '../world/Mood';
import { globals } from '../world/geo/patches';

/*
 * One cheap post stack:
 *   scene → HDR target (MSAA when the quality level allows)
 *   bloom: threshold prefilter at half resolution, 4 downsamples, tent upsample
 *   composite (one full-screen pass): height fog from depth, bloom, split-tone
 *   grading, saturation / contrast, AgX or ACES tone mapping, vignette, grain.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** 13-tap "dual" downsample (Jimenez 2014): smooth, cheap, flicker-resistant. */
const DOWN = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 uTexel;
  varying vec2 vUv;
  vec3 down13(vec2 uv) {
    vec2 t = uTexel;
    vec3 a = texture2D(tInput, uv + t * vec2(-2.0, -2.0)).rgb;
    vec3 b = texture2D(tInput, uv + t * vec2( 0.0, -2.0)).rgb;
    vec3 c = texture2D(tInput, uv + t * vec2( 2.0, -2.0)).rgb;
    vec3 d = texture2D(tInput, uv + t * vec2(-2.0,  0.0)).rgb;
    vec3 e = texture2D(tInput, uv).rgb;
    vec3 f = texture2D(tInput, uv + t * vec2( 2.0,  0.0)).rgb;
    vec3 g = texture2D(tInput, uv + t * vec2(-2.0,  2.0)).rgb;
    vec3 h = texture2D(tInput, uv + t * vec2( 0.0,  2.0)).rgb;
    vec3 i = texture2D(tInput, uv + t * vec2( 2.0,  2.0)).rgb;
    vec3 j = texture2D(tInput, uv + t * vec2(-1.0, -1.0)).rgb;
    vec3 k = texture2D(tInput, uv + t * vec2( 1.0, -1.0)).rgb;
    vec3 l = texture2D(tInput, uv + t * vec2(-1.0,  1.0)).rgb;
    vec3 m = texture2D(tInput, uv + t * vec2( 1.0,  1.0)).rgb;
    return e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }`;

export class PostFX {
  /** Everything here is live-tweakable under #debug. */
  readonly params = {
    enabled: true,
    bloom: true,
    bloomStrength: 0.6,
    threshold: 1.0,
    knee: 0.5,
    vignette: 0.32,
    grain: 0.022,
    saturation: 1.1,
    contrast: 1.1,
    heightFog: 0.32,
    fogHeight: 3.5,
    fogDensity: 0.009,
    toneMapping: 'ACES' as 'AgX' | 'ACES',
  };
  /**
   * Golden-hour vs dusk grade. Golden hour stays crisp (almost no haze, more
   * punch); the haze only thickens as the light goes. Re-applied on mood change.
   */
  readonly look = {
    heightFog: [0.05, 0.3],
    saturation: [1.24, 1.1],
    contrast: [1.22, 1.12],
  } as const;
  private readonly scene: THREE.WebGLRenderTarget;
  private readonly mips: THREE.WebGLRenderTarget[] = [];
  private readonly quad: THREE.Mesh;
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly prefilter: THREE.ShaderMaterial;
  private readonly down: THREE.ShaderMaterial;
  private readonly up: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly size = new THREE.Vector2();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    debug: Debug,
    samples = 4,
  ) {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false } as const;
    this.scene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.scene.depthTexture = new THREE.DepthTexture(1, 1);
    for (let i = 0; i < 5; i++) this.mips.push(new THREE.WebGLRenderTarget(1, 1, opts));
    this.mips.forEach((m) => (m.texture.minFilter = m.texture.magFilter = THREE.LinearFilter));

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geo);
    this.quad.frustumCulled = false;

    const base = { vertexShader: VERT, depthTest: false, depthWrite: false, toneMapped: false };
    this.prefilter = new THREE.ShaderMaterial({
      ...base,
      uniforms: { tInput: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 }, uKnee: { value: 0.5 } },
      fragmentShader: /* glsl */ `${DOWN}
        uniform float uThreshold, uKnee;
        void main() {
          vec3 c = min(down13(vUv), vec3(24.0)); // tame fireflies
          float br = max(c.r, max(c.g, c.b));
          float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
          soft = soft * soft / (4.0 * uKnee + 1e-4);
          gl_FragColor = vec4(c * max(soft, br - uThreshold) / max(br, 1e-4), 1.0);
        }`,
    });
    this.down = new THREE.ShaderMaterial({
      ...base,
      uniforms: { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } },
      fragmentShader: `${DOWN}\nvoid main() { gl_FragColor = vec4(down13(vUv), 1.0); }`,
    });
    this.up = new THREE.ShaderMaterial({
      ...base,
      blending: THREE.AdditiveBlending,
      uniforms: { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } },
      fragmentShader: /* glsl */ `
        uniform sampler2D tInput;
        uniform vec2 uTexel;
        varying vec2 vUv;
        void main() {
          vec2 t = uTexel;
          vec3 s = texture2D(tInput, vUv).rgb * 4.0;
          s += (texture2D(tInput, vUv + vec2(-t.x, 0.0)).rgb + texture2D(tInput, vUv + vec2(t.x, 0.0)).rgb + texture2D(tInput, vUv + vec2(0.0, -t.y)).rgb + texture2D(tInput, vUv + vec2(0.0, t.y)).rgb) * 2.0;
          s += texture2D(tInput, vUv - t).rgb + texture2D(tInput, vUv + t).rgb + texture2D(tInput, vUv + vec2(-t.x, t.y)).rgb + texture2D(tInput, vUv + vec2(t.x, -t.y)).rgb;
          gl_FragColor = vec4(s / 16.0, 1.0);
        }`,
    });
    this.composite = new THREE.ShaderMaterial({
      vertexShader: VERT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.scene.texture },
        tDepth: { value: this.scene.depthTexture },
        tBloom: { value: this.mips[0]!.texture },
        uBloom: { value: 0 },
        uVignette: { value: 0 },
        uGrain: { value: 0 },
        uTime: globals.uTime,
        uSaturation: { value: 1 },
        uContrast: { value: 1 },
        uHeightFog: { value: 0 },
        uFogHeight: { value: 5 },
        uFogDensity: { value: 0.01 },
        uFogColor: { value: new THREE.Color() },
        uShadowTint: { value: new THREE.Color(0.93, 0.96, 1.05) },
        uHighlightTint: { value: new THREE.Color(1.05, 1.0, 0.93) },
        uProjInv: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
      },
      fragmentShader: /* glsl */ `
        #include <common>
        uniform sampler2D tScene, tDepth, tBloom;
        uniform float uBloom, uVignette, uGrain, uTime, uSaturation, uContrast, uHeightFog, uFogHeight, uFogDensity;
        uniform vec3 uFogColor, uShadowTint, uHighlightTint, uCamPos;
        uniform mat4 uProjInv, uCamWorld;
        varying vec2 vUv;
        // sin-free hash (Hoskins): the classic fract(sin()) one loses precision at
        // screen-sized coordinates and turns grain into a regular dot pattern.
        float hash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        void main() {
          vec3 col = texture2D(tScene, vUv).rgb;
          // Height fog: thick haze that hugs the ground and thins with height.
          float d = texture2D(tDepth, vUv).x;
          if (d < 1.0) {
            vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
            vec3 wp = (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;
            float dist = length(wp - uCamPos);
            float f = (1.0 - exp(-dist * uFogDensity)) * exp(-max(wp.y, 0.0) / uFogHeight) * uHeightFog;
            col = mix(col, uFogColor, clamp(f, 0.0, 0.85));
          }
          col += texture2D(tBloom, vUv).rgb * uBloom;
          // Grade (linear): cool shadows, warm highlights, then saturation and contrast around mid grey.
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col *= mix(uShadowTint, uHighlightTint, smoothstep(0.02, 0.6, l));
          l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = max(mix(vec3(l), col, uSaturation), 0.0);
          col = pow(col / 0.18, vec3(uContrast)) * 0.18;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          // Display-space finish: vignette and fine animated grain (also kills banding).
          vec2 q = vUv - 0.5;
          gl_FragColor.rgb *= 1.0 - uVignette * smoothstep(0.08, 0.62, dot(q, q) * 1.6);
          gl_FragColor.rgb += (hash(gl_FragCoord.xy + vec2(fract(uTime * 7.31), fract(uTime * 3.17)) * 517.0) - 0.5) * uGrain;
        }`,
    });
    this.addDebug(debug);
  }

  bindMood(mood: Mood): void {
    const p = this.params;
    const l = this.look;
    mood.on((t) => {
      p.heightFog = THREE.MathUtils.lerp(l.heightFog[0], l.heightFog[1], t);
      p.saturation = THREE.MathUtils.lerp(l.saturation[0], l.saturation[1], t);
      p.contrast = THREE.MathUtils.lerp(l.contrast[0], l.contrast[1], t);
    });
  }

  /** The HDR scene target (compile shaders against it so the first frame doesn't recompile). */
  get target(): THREE.WebGLRenderTarget {
    return this.scene;
  }

  get enabled(): boolean {
    return this.params.enabled;
  }

  setSamples(n: number): void {
    if (this.scene.samples === n) return;
    this.scene.samples = n;
    this.scene.dispose(); // re-created at the new sample count on next use
  }

  setSize(width: number, height: number): void {
    this.size.set(width, height);
    this.scene.setSize(width, height);
    let w = Math.max(1, Math.round(width / 2));
    let h = Math.max(1, Math.round(height / 2));
    for (const m of this.mips) {
      m.setSize(w, h);
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
    }
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, clear = true): void {
    this.quad.material = mat;
    const r = this.renderer;
    r.setRenderTarget(target);
    const auto = r.autoClear;
    r.autoClear = clear;
    r.render(this.quad, this.cam);
    r.autoClear = auto;
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const r = this.renderer;
    const p = this.params;
    r.getDrawingBufferSize(this.size);
    if (this.scene.width !== this.size.x || this.scene.height !== this.size.y) this.setSize(this.size.x, this.size.y);

    r.setRenderTarget(this.scene);
    r.render(scene, camera);

    if (p.bloom) {
      const m0 = this.mips[0]!;
      this.prefilter.uniforms.tInput!.value = this.scene.texture;
      (this.prefilter.uniforms.uTexel!.value as THREE.Vector2).set(1 / this.scene.width, 1 / this.scene.height);
      this.prefilter.uniforms.uThreshold!.value = p.threshold;
      this.prefilter.uniforms.uKnee!.value = p.knee;
      this.pass(this.prefilter, m0);
      for (let i = 1; i < this.mips.length; i++) {
        const src = this.mips[i - 1]!;
        this.down.uniforms.tInput!.value = src.texture;
        (this.down.uniforms.uTexel!.value as THREE.Vector2).set(1 / src.width, 1 / src.height);
        this.pass(this.down, this.mips[i]!);
      }
      for (let i = this.mips.length - 1; i > 0; i--) {
        const src = this.mips[i]!;
        this.up.uniforms.tInput!.value = src.texture;
        (this.up.uniforms.uTexel!.value as THREE.Vector2).set(1 / src.width, 1 / src.height);
        this.pass(this.up, this.mips[i - 1]!, false);
      }
    }

    const u = this.composite.uniforms;
    u.uBloom!.value = p.bloom ? p.bloomStrength : 0;
    u.uVignette!.value = p.vignette;
    u.uGrain!.value = p.grain;
    u.uSaturation!.value = p.saturation;
    u.uContrast!.value = p.contrast;
    u.uHeightFog!.value = p.heightFog;
    u.uFogHeight!.value = p.fogHeight;
    u.uFogDensity!.value = p.fogDensity;
    if (scene.fog) (u.uFogColor!.value as THREE.Color).copy((scene.fog as THREE.Fog).color);
    (u.uProjInv!.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (u.uCamWorld!.value as THREE.Matrix4).copy(camera.matrixWorld);
    (u.uCamPos!.value as THREE.Vector3).copy(camera.position);
    this.pass(this.composite, null);
  }

  private addDebug(debug: Debug): void {
    const f = debug.folder('Post-processing');
    if (!f) return;
    const p = this.params;
    f.add(p, 'enabled').name('post-processing');
    f.add(p, 'toneMapping', ['AgX', 'ACES'])
      .name('tone mapping')
      .onChange((v: string) => {
        this.renderer.toneMapping = v === 'AgX' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
        this.composite.needsUpdate = true;
      });
    f.add(this.renderer, 'toneMappingExposure', 0.3, 2.5, 0.01).name('exposure');
    f.add(p, 'bloom');
    f.add(p, 'bloomStrength', 0, 2, 0.01).name('bloom strength');
    f.add(p, 'threshold', 0, 4, 0.01).name('bloom threshold');
    f.add(p, 'vignette', 0, 1, 0.01);
    f.add(p, 'grain', 0, 0.15, 0.001);
    f.add(p, 'saturation', 0, 2, 0.01);
    f.add(p, 'contrast', 0.5, 1.6, 0.01);
    f.add(p, 'heightFog', 0, 1.5, 0.01).name('height fog');
    f.add(p, 'fogHeight', 0.5, 20, 0.1).name('fog height');
    f.add(p, 'fogDensity', 0, 0.05, 0.001).name('fog density');
    f.addColor(this.composite.uniforms.uShadowTint!, 'value').name('shadow tint');
    f.addColor(this.composite.uniforms.uHighlightTint!, 'value').name('highlight tint');
  }

  dispose(): void {
    this.scene.dispose();
    this.scene.depthTexture?.dispose();
    this.mips.forEach((m) => m.dispose());
    this.quad.geometry.dispose();
    [this.prefilter, this.down, this.up, this.composite].forEach((m) => m.dispose());
  }
}
