import * as THREE from 'three';

/** Fictional neighbourhood shops (English + Marathi/Hindi). Scenery only, not real businesses. */
const SHOPS: [string, string][] = [
  ['Laxmi General Stores', 'लक्ष्मी जनरल स्टोअर्स'],
  ['Ganesh Hardware', 'गणेश हार्डवेअर'],
  ['Shree Sai Medical', 'श्री साई मेडिकल'],
  ['Mumbai Vada Pav Centre', 'मुंबई वडा पाव सेंटर'],
  ['Jai Maharashtra Tailors', 'जय महाराष्ट्र टेलर्स'],
  ['Bombay Cycle Mart', 'बॉम्बे सायकल मार्ट'],
  ['Krishna Xerox & Print', 'कृष्णा झेरॉक्स'],
  ['Irani Café & Bakery', 'इराणी कॅफे'],
  ['Patil Kirana', 'पाटील किराणा'],
  ['New Light Electricals', 'न्यू लाइट इलेक्ट्रिकल्स'],
  ['Sagar Paan House', 'सागर पान हाऊस'],
  ['Om Sai Mobile Repair', 'ओम साई मोबाईल'],
  ['Gajanan Sweets', 'गजानन स्वीट्स'],
  ['Durga Saree Centre', 'दुर्गा साडी सेंटर'],
  ['Asha Opticians', 'आशा ऑप्टिशियन्स'],
  ['Konkan Fish Mart', 'कोकण फिश मार्ट'],
  ['Royal Hair Salon', 'रॉयल हेअर सलून'],
  ['Sea View Lunch Home', 'सी व्ह्यू लंच होम'],
  ['Mahalaxmi Jewellers', 'महालक्ष्मी ज्वेलर्स'],
  ['Hanuman Tea Stall', 'हनुमान चहा'],
  ['Swami Samarth Kirana', 'स्वामी समर्थ किराणा'],
  ['Bharat Radio Service', 'भारत रेडिओ सर्व्हिस'],
  ['Siddhi Flower Shop', 'सिद्धी फुले'],
  ['Anand Book Depot', 'आनंद बुक डेपो'],
];

/** [background, text, rule] */
const SCHEMES: [string, string, string][] = [
  ['#b3261e', '#ffd54a', '#ffd54a'],
  ['#1f4e8c', '#ffffff', '#ffd54a'],
  ['#f2c230', '#9a1b14', '#9a1b14'],
  ['#1e6b3a', '#fdf6e3', '#f2c230'],
  ['#fdf6e3', '#b3261e', '#1f4e8c'],
  ['#1b1310', '#f2c230', '#f2a33a'],
  ['#e0762b', '#ffffff', '#1b1310'],
  ['#6d1a36', '#fbe8c8', '#f2c230'],
];

const COLS = 4;
const ROWS = 8;
const SW = 512;
const SH = 128;
const FONT = '"Baloo 2", "Nirmala UI", "Noto Sans Devanagari", "Kohinoor Devanagari", system-ui, sans-serif';

export class SignAtlas {
  readonly texture: THREE.CanvasTexture;
  readonly count = SHOPS.length;

  private constructor(canvas: HTMLCanvasElement) {
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  /** Waits for the self-hosted Baloo 2 (Latin + Devanagari) before drawing. */
  static async create(): Promise<SignAtlas> {
    try {
      await Promise.all([document.fonts.load(`700 40px "Baloo 2"`, 'Shop'), document.fonts.load(`700 40px "Baloo 2"`, 'दुकान')]);
    } catch {
      /* fall back to system fonts */
    }
    const canvas = document.createElement('canvas');
    canvas.width = SW * COLS;
    canvas.height = SH * ROWS;
    const g = canvas.getContext('2d')!;
    SHOPS.forEach(([en, hi], i) => {
      const x = (i % COLS) * SW;
      const y = Math.floor(i / COLS) * SH;
      const [bg, fg, rule] = SCHEMES[i % SCHEMES.length]!;
      g.fillStyle = bg;
      g.fillRect(x, y, SW, SH);
      g.strokeStyle = rule;
      g.lineWidth = 5;
      g.strokeRect(x + 7, y + 7, SW - 14, SH - 14);
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const fit = (text: string, size: number, maxW: number) => {
        let s = size;
        do g.font = `700 ${s}px ${FONT}`;
        while (g.measureText(text).width > maxW && --s > 12);
      };
      fit(en.toUpperCase(), 46, SW - 48);
      g.fillText(en.toUpperCase(), x + SW / 2, y + 44);
      fit(hi, 38, SW - 64);
      g.fillText(hi, x + SW / 2, y + 92);
    });
    return new SignAtlas(canvas);
  }

  /** UV rect [u0, v0, u1, v1] of a slot (texture flipY: canvas top = v 1). */
  uv(i: number): [number, number, number, number] {
    const k = i % this.count;
    const c = k % COLS;
    const r = Math.floor(k / COLS);
    const inset = 0.002;
    return [c / COLS + inset, 1 - (r + 1) / ROWS + inset, (c + 1) / COLS - inset, 1 - r / ROWS - inset];
  }

  dispose(): void {
    this.texture.dispose();
  }
}
