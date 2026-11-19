import './style.css';
import { Loader } from './ui/Loader';

const CLASSIC = 'https://hardik-build-log.vercel.app';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** No WebGL (or reduced motion): skip the 3D lane entirely and point to the classic site. */
function showFallback(reason: string): void {
  document.querySelector('[data-loader]')?.remove();
  const box = document.createElement('section');
  box.className = 'fallback';
  box.setAttribute('aria-labelledby', 'fallback-title');
  box.innerHTML = `
    <h2 id="fallback-title">Hardik’s Lane is a 3D drive</h2>
    <p>${reason}</p>
    <a href="${CLASSIC}">Open the classic site</a>`;
  document.querySelector('#main')!.append(box);
}

async function boot(): Promise<void> {
  if (!webglAvailable()) return showFallback('Your browser can’t run WebGL, so here’s the same work as a fast, readable page.');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return showFallback('You’ve asked for reduced motion, so here’s the same work as a calm, readable page.');
  }
  const loader = new Loader();
  try {
    // The 3D engine is its own chunk: nothing heavy loads before we know WebGL works.
    const { Experience } = await import('./Experience');
    const experience = new Experience(document.querySelector<HTMLElement>('[data-webgl]')!, loader);
    await experience.start();
    if (import.meta.hot) import.meta.hot.dispose(() => experience.dispose());
  } catch (err) {
    loader.fail('Something went wrong starting the 3D lane. Try the classic site.');
    throw err;
  }
}

void boot();
