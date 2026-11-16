/**
 * Confetti in the house colours, drawn on a canvas laid over the page for about two seconds, with no library.
 * - burst: a handful thrown up from a point (a button), for a message sent;
 * - rain: a shower from the top of the screen, for an order paid;
 * - buttons: a shower of little shirt buttons, the logo's secret.
 * Nothing happens with reduced motion on. Runs in the browser only.
 */
export type Celebration = 'burst' | 'rain' | 'buttons';

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  size: number;
  colour: string;
  shape: 'strip' | 'dot' | 'button';
}

const DURATION = 2200;
const GRAVITY = 0.32;

export function celebrate(kind: Celebration = 'burst', from?: { x: number; y: number }): void {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const style = getComputedStyle(document.documentElement);
  const colour = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
  const palette = [
    colour('--thread', '#ee7b30'),
    colour('--brand', '#2b4c8c'),
    colour('--ink', '#18202e'),
    colour('--thread', '#ee7b30'),
  ];
  const holes = colour('--bg', '#f7f5f0');

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '30',
  });
  document.body.append(canvas);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.remove();
  ctx.scale(ratio, ratio);

  const random = (min: number, max: number): number => min + Math.random() * (max - min);
  const count = kind === 'burst' ? 46 : width < 600 ? 60 : 110;
  const origin = from ?? { x: width / 2, y: height / 2 };
  const pieces: Piece[] = Array.from({ length: count }, (_, i) => {
    const shape: Piece['shape'] =
      kind === 'buttons' ? (i % 3 === 0 ? 'strip' : 'button') : i % 4 === 0 ? 'dot' : 'strip';
    const base = {
      spin: random(-0.25, 0.25),
      angle: random(0, Math.PI * 2),
      colour: palette[i % palette.length] ?? '#ee7b30',
      shape,
    };
    if (kind === 'burst') {
      const direction = random(-Math.PI * 0.85, -Math.PI * 0.15);
      const speed = random(6, 13);
      return {
        ...base,
        x: origin.x,
        y: origin.y,
        vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed,
        size: random(6, 10),
      };
    }
    return {
      ...base,
      x: random(0, width),
      y: random(-height * 0.6, -20),
      vx: random(-1.5, 1.5),
      vy: random(2, 5),
      size: shape === 'button' ? random(12, 18) : random(6, 11),
    };
  });

  const start = performance.now();
  const frame = (now: number): void => {
    const elapsed = now - start;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = elapsed > DURATION - 500 ? Math.max(0, (DURATION - elapsed) / 500) : 1;
    for (const p of pieces) {
      p.vy += GRAVITY * (kind === 'burst' ? 1 : 0.35);
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.colour;
      if (p.shape === 'strip') ctx.fillRect(-p.size / 2, -p.size / 5, p.size, p.size / 2.5);
      else if (p.shape === 'dot') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // A shirt button: a disc with four holes.
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = holes;
        const d = p.size / 6.5;
        const at: Array<[number, number]> = [
          [-d, -d],
          [d, -d],
          [-d, d],
          [d, d],
        ];
        for (const [hx, hy] of at) {
          ctx.beginPath();
          ctx.arc(hx, hy, p.size / 11, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    if (elapsed < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
