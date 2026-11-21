import * as THREE from 'three';
import { PROFILE, WINS } from '../content/profile';
import { palette } from '../world/palette';
import { Kit, type StallModel } from './StallModels';

const PAINT_FONT = '"Baloo 2", "Nirmala UI", system-ui, sans-serif';
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = '"Instrument Sans", system-ui, sans-serif';

/** Sign-painter lettering: each glyph slightly off-true, with a hard drop shadow. */
function paintText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  shadow: string,
  rnd: () => number,
  maxW = Infinity,
): number {
  let s = size;
  g.font = `700 ${s}px ${PAINT_FONT}`;
  while (g.measureText(text).width > maxW && s > 12) g.font = `700 ${--s}px ${PAINT_FONT}`;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  let cx = x;
  for (const ch of text) {
    const w = g.measureText(ch).width;
    const r = (rnd() - 0.5) * 0.035;
    const dy = (rnd() - 0.5) * s * 0.03;
    g.save();
    g.translate(cx + w / 2, y + dy);
    g.rotate(r);
    g.fillStyle = shadow;
    g.fillText(ch, -w / 2 + s * 0.045, s * 0.05);
    g.fillStyle = color;
    g.fillText(ch, -w / 2, 0);
    g.restore();
    cx += w + s * 0.01;
  }
  return cx - x;
}

/** Streaky brushed background, like a hand-painted hoarding. */
function brushed(g: CanvasRenderingContext2D, w: number, h: number, base: string, streak: string, rnd: () => number): void {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.07;
  g.fillStyle = streak;
  for (let i = 0; i < 160; i++) {
    const y = rnd() * h;
    g.fillRect(rnd() * w * 0.2 - 40, y, w * (0.5 + rnd() * 0.7), 2 + rnd() * 9);
  }
  g.globalAlpha = 1;
}

// ── About: hand-painted hoarding ────────────────────────────────────────

export function billboard(): StallModel {
  const k = new Kit(77);
  const { g } = k;
  const steel = 0x3b3633;
  const W = 8.4;
  const H = 3.6;
  const y0 = 2.9;
  // Legs, braces, catwalk with railing, lamp arms. The legs stop under the board (never
  // across the lettering, from either face) and a stiff box frame carries the board.
  for (const x of [-2.9, 2.9]) {
    g.box(x, y0 / 2, -0.35, 0.22, y0, 0.22, steel);
    g.rod({ x, y: 0.2, z: -1.4 }, { x, y: y0 + 0.2, z: -0.4 }, 0.06, steel);
    g.box(x, 0.12, -0.6, 0.6, 0.24, 1.8, 0x6e6a64); // footing
  }
  g.rod({ x: -2.9, y: 0.8, z: -0.35 }, { x: 2.9, y: y0 - 0.2, z: -0.35 }, 0.05, steel);
  g.rod({ x: 2.9, y: 0.8, z: -0.35 }, { x: -2.9, y: y0 - 0.2, z: -0.35 }, 0.05, steel);
  g.box(0, y0 - 0.12, 0.2, W + 0.4, 0.08, 0.8, steel); // catwalk
  // low railing: its top sits below the painted border, so it never crosses the text
  for (let x = -W / 2; x <= W / 2 + 0.01; x += 0.7) g.box(x, y0 - 0.12 + 0.2, 0.58, 0.04, 0.4, 0.04, steel);
  g.box(0, y0 + 0.28, 0.58, W + 0.4, 0.04, 0.04, steel);
  g.box(0, y0 - 0.02, -0.35, W - 1.2, 0.2, 0.24, steel); // header beam the board stands on
  g.box(0, y0 + H / 2, -0.12, W + 0.3, H + 0.3, 0.18, 0x6b1a14); // board back + frame
  const lamps: THREE.Mesh[] = [];
  const lampGeo = k.track(new THREE.BoxGeometry(0.4, 0.08, 0.22));
  const lampMat = k.track(new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: palette.lampGlow, emissiveIntensity: 1.4 }));
  for (const x of [-2.8, 0, 2.8]) {
    g.rod({ x, y: y0 + H + 0.1, z: -0.1 }, { x, y: y0 + H + 0.5, z: 0.9 }, 0.035, steel);
    g.box(x, y0 + H + 0.5, 1.0, 0.5, 0.16, 0.3, steel);
    const l = new THREE.Mesh(lampGeo, lampMat);
    l.position.set(x, y0 + H + 0.41, 1.0);
    k.root.add(l);
    lamps.push(l);
  }

  // The painted face: drawn once, then again when the portrait image arrives.
  const px = 300;
  let portrait: HTMLImageElement | null = null;
  const draw = (c: CanvasRenderingContext2D, w: number, h: number) => {
    const r = (() => {
      let s = 7;
      return () => ((s = (s * 16807) % 2147483647) / 2147483647);
    })();
    brushed(c, w, h, '#f3e3c0', '#b8864a', r);
    // red border + thin gold line
    c.strokeStyle = '#9a1b14';
    c.lineWidth = h * 0.05;
    c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, w - c.lineWidth, h - c.lineWidth);
    c.strokeStyle = '#d9a23a';
    c.lineWidth = 5;
    c.strokeRect(h * 0.065, h * 0.065, w - h * 0.13, h - h * 0.13);
    // portrait frame
    const fx = h * 0.13;
    const fy = h * 0.13;
    const fw = h * 0.6;
    const fh = h * 0.74;
    c.fillStyle = '#3a2416';
    c.fillRect(fx - 14, fy - 14, fw + 28, fh + 28);
    if (portrait) {
      const ir = portrait.width / portrait.height;
      const fr = fw / fh;
      const sw = ir > fr ? portrait.height * fr : portrait.width;
      const sh = ir > fr ? portrait.height : portrait.width / fr;
      c.drawImage(portrait, (portrait.width - sw) / 2, (portrait.height - sh) / 2, sw, sh, fx, fy, fw, fh);
    } else {
      c.fillStyle = '#e8d6b4';
      c.fillRect(fx, fy, fw, fh);
    }
    // lettering
    const tx = fx + fw + h * 0.12;
    const maxW = w - tx - h * 0.12;
    paintText(c, PROFILE.name.toUpperCase(), tx, h * 0.36, h * 0.2, '#9a1b14', '#3a1410', r, maxW);
    paintText(c, PROFILE.headline, tx + 4, h * 0.56, h * 0.12, '#1f4e8c', '#13294a', r, maxW);
    c.strokeStyle = '#1b1310';
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(tx + 4, h * 0.63);
    for (let x = 0; x <= maxW * 0.9; x += 30) c.lineTo(tx + 4 + x, h * 0.63 + (r() - 0.5) * 4);
    c.stroke();
    c.fillStyle = '#2a2523';
    c.font = `600 ${h * 0.068}px ${SANS}`;
    c.textBaseline = 'alphabetic';
    c.fillText(`${PROFILE.school.replace(' School of Engineering', '')} · Computer Engineering · Mumbai`, tx + 4, h * 0.735, maxW);
    c.fillStyle = '#9a1b14';
    c.font = `600 ${h * 0.056}px ${SANS}`;
    c.fillText(PROFILE.availability, tx + 4, h * 0.83, maxW);
  };
  const face = k.board(W, H, draw, { px, emissive: 0.22 });
  face.mesh.position.set(0, y0 + H / 2, 0.0);
  // Double-faced, like most Mumbai hoardings: the same painting on the back.
  const back = face.mesh.clone();
  back.position.z = -0.24;
  back.rotation.y = Math.PI;
  k.root.add(back);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    portrait = img;
    const cv = face.texture.image as HTMLCanvasElement;
    draw(cv.getContext('2d')!, cv.width, cv.height);
    face.texture.needsUpdate = true;
  };
  img.src = '/me/portrait.webp';
  k.updates.push((t) => (lampMat.emissiveIntensity = 1.2 + Math.sin(t * 0.7) * 0.08));
  k.colliders.push({ x: -2.9, z: -0.5, hx: 0.35, hy: 1.5, hz: 1.0 }, { x: 2.9, z: -0.5, hx: 0.35, hy: 1.5, hz: 1.0 });
  void lamps;
  return k.finish(y0 + H + 0.4);
}

// ── Contact: red pillar post box with a postcard drop ───────────────────

export function postBox(): StallModel {
  const k = new Kit(88);
  const { g } = k;
  const red = 0xc0261c;
  const dark = 0x2a2523;
  g.box(0, 0.08, 0, 1.2, 0.16, 1.2, 0x9c9285); // stone base
  g.cylinder(0, 0.27, 0, 0.44, 0.46, 0.22, 16, dark);
  g.cylinder(0, 0.95, 0, 0.4, 0.4, 1.18, 18, red);
  g.cylinder(0, 1.57, 0, 0.44, 0.44, 0.08, 18, dark); // band
  g.cylinder(0, 1.68, 0, 0.32, 0.44, 0.14, 18, red); // dome, in steps
  g.cylinder(0, 1.8, 0, 0.16, 0.32, 0.1, 18, red);
  g.cylinder(0, 1.88, 0, 0.06, 0.12, 0.08, 10, dark);
  // slit with a hood, door outline
  g.box(0, 1.36, 0.38, 0.42, 0.05, 0.08, dark);
  g.box(0, 1.41, 0.4, 0.5, 0.04, 0.12, red, { rx: 0.4 });
  g.box(0, 0.66, 0.4, 0.46, 0.5, 0.02, 0xa61f17); // door
  const plate = k.board(0.5, 0.3, (c, w, h) => {
    c.fillStyle = '#f6ead7';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#9a1b14';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${h * 0.4}px ${PAINT_FONT}`;
    c.fillText('POST', w / 2, h * 0.34);
    c.font = `700 ${h * 0.36}px ${PAINT_FONT}`;
    c.fillText('डाक', w / 2, h * 0.75);
  });
  plate.mesh.position.set(0, 1.13, 0.41);
  // the hinged flap behind the slit
  const flap = new THREE.Mesh(k.track(new THREE.BoxGeometry(0.4, 0.06, 0.02)), k.track(new THREE.MeshStandardMaterial({ color: dark })));
  flap.position.set(0, 1.36, 0.42);
  k.root.add(flap);
  // Postcard: cream card with a little stamp, animated along an arc into the slot
  const card = new THREE.Group();
  const cardFace = new THREE.Mesh(k.track(new THREE.BoxGeometry(0.5, 0.014, 0.33)), k.track(new THREE.MeshStandardMaterial({ color: 0xf6ead7, roughness: 0.8 })));
  const stamp = new THREE.Mesh(k.track(new THREE.BoxGeometry(0.06, 0.014, 0.07)), k.track(new THREE.MeshStandardMaterial({ color: 0xc0261c })));
  stamp.position.set(0.18, 0.002, -0.09);
  card.add(cardFace, stamp);
  card.visible = false;
  cardFace.castShadow = true;
  k.root.add(card);
  const box = k.root;
  let t = -1;
  const from = new THREE.Vector3();
  const to = new THREE.Vector3(0, 1.36, 0.35);
  const p = new THREE.Vector3();
  const model = k.finish(2.4);
  model.onEnter = (world) => {
    from.copy(world).setY(world.y + 1.4);
    box.worldToLocal(from);
    t = 0;
    card.visible = true;
  };
  const baseUpdate = model.update;
  model.update = (elapsed, dt) => {
    baseUpdate(elapsed, dt);
    if (t < 0) return;
    t += dt;
    const u = Math.min(t / 0.9, 1);
    const e = u * u * (3 - 2 * u);
    // quadratic arc: up and over, then into the slot
    const mid = from.clone().lerp(to, 0.5).setY(Math.max(from.y, to.y) + 1.1);
    p.copy(from).multiplyScalar((1 - e) * (1 - e)).addScaledVector(mid, 2 * e * (1 - e)).addScaledVector(to, e * e);
    card.position.copy(p);
    card.rotation.set(Math.PI / 2 - e * (Math.PI / 2 - 0.0) + Math.sin(u * Math.PI) * 0.4, (1 - e) * 2.4, 0);
    if (u >= 1) {
      // slide in, flap swings, box gives a tiny thunk
      const s = Math.min((t - 0.9) / 0.35, 1);
      card.position.z = to.z - s * 0.3;
      card.scale.setScalar(1 - s * 0.6);
      flap.rotation.x = Math.sin(s * Math.PI) * 0.9;
      box.scale.y = 1 - Math.sin(s * Math.PI) * 0.025;
      if (s >= 1) {
        card.visible = false;
        card.scale.setScalar(1);
        box.scale.y = 1;
        flap.rotation.x = 0;
        t = -1;
      }
    }
  };
  model.colliders.push({ x: 0, z: 0, hx: 0.45, hy: 0.95, hz: 0.45 });
  return model;
}

// ── Wins wall: painted wall with framed newspaper clippings ─────────────

function clipping(c: CanvasRenderingContext2D, w: number, h: number, win: (typeof WINS)[number], seed: number): void {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  c.fillStyle = '#efe6d2';
  c.fillRect(0, 0, w, h);
  // paper grain
  c.globalAlpha = 0.06;
  for (let i = 0; i < 900; i++) {
    c.fillStyle = r() > 0.5 ? '#6b5a3c' : '#ffffff';
    c.fillRect(r() * w, r() * h, 2, 2);
  }
  c.globalAlpha = 1;
  const pad = w * 0.07;
  c.fillStyle = '#1b1310';
  c.textBaseline = 'alphabetic';
  // masthead
  c.textAlign = 'center';
  c.font = `400 ${h * 0.085}px ${SERIF}`;
  c.fillText('The Build Log', w / 2, pad + h * 0.06);
  c.fillRect(pad, pad + h * 0.085, w - pad * 2, 2);
  c.font = `600 ${h * 0.034}px ${SANS}`;
  c.fillText(`${win.year.toUpperCase()}  ·  ${win.event.toUpperCase()}`, w / 2, pad + h * 0.13);
  c.fillRect(pad, pad + h * 0.145, w - pad * 2, 1);
  // headline (wrapped)
  c.textAlign = 'left';
  const wrap = (text: string, font: string, lh: number, y0: number, maxLines: number) => {
    c.font = font;
    const words = text.split(' ');
    let line = '';
    let y = y0;
    let n = 0;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (c.measureText(test).width > w - pad * 2 && line) {
        c.fillText(line, pad, y);
        line = word;
        y += lh;
        if (++n >= maxLines - 1) break;
      } else line = test;
    }
    c.fillText(line, pad, y);
    return y;
  };
  const hy = wrap(win.headline, `400 ${h * 0.115}px ${SERIF}`, h * 0.11, pad + h * 0.27, 3);
  const by = wrap(win.fact, `400 ${h * 0.045}px ${SANS}`, h * 0.06, hy + h * 0.09, 4);
  // the rest of the column: grey "text" bars, like a real clipping
  c.fillStyle = 'rgba(27,19,16,0.16)';
  for (let y = by + h * 0.06; y < h - pad; y += h * 0.035) {
    c.fillRect(pad, y, (w - pad * 2) * (0.6 + r() * 0.4), h * 0.012);
  }
}

export function winsWall(): StallModel {
  const k = new Kit(99);
  const { g, rng } = k;
  const wallW = 13;
  const wallH = 3.4;
  const paint = 0x3f6f8a;
  g.box(0, wallH / 2, -0.8, wallW, wallH, 0.36, paint);
  g.box(0, wallH + 0.06, -0.8, wallW + 0.2, 0.12, 0.5, 0xd9cfbf); // coping
  g.box(0, 0.2, -0.6, wallW, 0.4, 0.06, 0x2f5568); // dado
  for (let i = 0; i < 9; i++) {
    // plaster patches: the wall has been painted over a few times
    g.box(rng.range(-wallW / 2 + 0.6, wallW / 2 - 0.6), rng.range(0.5, wallH - 0.4), -0.615, rng.range(0.3, 1.0), rng.range(0.2, 0.6), 0.01, rng.chance(0.5) ? 0x4b7d97 : 0x37637c);
  }
  // Painted header lettering
  const head = k.board(4.2, 0.55, (c, w, h) => {
    c.clearRect(0, 0, w, h); // transparent: the lettering sits straight on the wall paint
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const used = paintText(c, 'WINS', 10, h * 0.8, h * 0.8, '#f2c230', '#1d3a4a', r);
    c.fillStyle = '#f6ead7';
    c.font = `600 ${h * 0.3}px ${SANS}`;
    c.fillText('Hackathons & datathons', 34 + used, h * 0.72);
  });
  head.mesh.position.set(-wallW / 2 + 2.6, wallH - 0.38, -0.615);
  (head.mesh.material as THREE.MeshStandardMaterial).transparent = true;
  (head.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.05;
  // Frames with clippings, each slightly off-square, garlanded with marigolds
  const n = WINS.length;
  const gap = wallW / n;
  const ico = new THREE.IcosahedronGeometry(1, 0);
  WINS.forEach((win, i) => {
    const x = -wallW / 2 + gap * (i + 0.5);
    const tilt = (rng.next() - 0.5) * 0.05;
    const fw = 2.0;
    const fh = 1.5;
    const y = 1.55;
    g.box(x, y, -0.58, fw + 0.16, fh + 0.16, 0.06, 0x3a2416, { rz: tilt });
    const clip = k.board(fw - 0.06, fh - 0.06, (c, w, h) => clipping(c, w, h, win, 11 + i * 7), { px: 360, emissive: 0.18 });
    clip.mesh.position.set(x, y, -0.545);
    clip.mesh.rotation.z = tilt;
    // marigold garland sagging across the top of the frame
    for (let j = 0; j <= 14; j++) {
      const u = j / 14;
      const gx = x - fw / 2 - 0.05 + u * (fw + 0.1);
      const gy = y + fh / 2 + 0.12 - Math.sin(u * Math.PI) * 0.22;
      g.shape(ico, j % 3 === 0 ? 0xf6c23a : palette.marigold, gx, gy, -0.5, 0.075, 0.075, 0.075, { ry: j });
    }
    g.shape(ico, palette.marigold, x - fw / 2 - 0.05, y + fh / 2 - 0.15, -0.5, 0.07, 0.25, 0.07);
    g.shape(ico, palette.marigold, x + fw / 2 + 0.05, y + fh / 2 - 0.15, -0.5, 0.07, 0.25, 0.07);
  });
  ico.dispose();
  // bench + a lamp to read by
  g.box(3.5, 0.45, 0.6, 2.4, 0.08, 0.5, palette.cartWood);
  for (const x of [2.5, 4.5]) g.box(x, 0.22, 0.6, 0.08, 0.44, 0.4, palette.cartWood);
  k.colliders.push({ x: 0, z: -0.8, hx: wallW / 2, hy: wallH / 2, hz: 0.2 }, { x: 3.5, z: 0.6, hx: 1.2, hy: 0.3, hz: 0.3 });
  return k.finish(wallH + 1.2);
}
