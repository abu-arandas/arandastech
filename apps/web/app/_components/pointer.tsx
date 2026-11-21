'use client';

import { useEffect } from 'react';

const TILT = 6; // degrees at most
const PULL = 0.22; // how far a magnetic button follows the pointer
const MAX_PULL = 8; // pixels at most

/**
 * Pointer fun for desktops only (a fine pointer, and motion allowed): pictures marked [data-tilt] lean toward the
 * pointer while it is over their frame, and buttons marked [data-magnetic] lean a few pixels after it. Phones, tablets
 * and reduced motion get neither; everything works the same without them.
 */
export function Pointer() {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || calm) return;
    const undo: (() => void)[] = [];
    const on = (el: Element, type: string, fn: (e: PointerEvent) => void): void => {
      el.addEventListener(type, fn as EventListener);
      undo.push(() => el.removeEventListener(type, fn as EventListener));
    };

    for (const picture of document.querySelectorAll<HTMLElement>('[data-tilt]')) {
      const frame = picture.parentElement ?? picture;
      on(frame, 'pointermove', (e) => {
        const box = frame.getBoundingClientRect();
        const x = (e.clientX - box.left) / box.width - 0.5;
        const y = (e.clientY - box.top) / box.height - 0.5;
        picture.style.setProperty('--ry', `${(x * TILT * 2).toFixed(2)}deg`);
        picture.style.setProperty('--rx', `${(-y * TILT * 2).toFixed(2)}deg`);
      });
      on(frame, 'pointerleave', () => {
        picture.style.removeProperty('--rx');
        picture.style.removeProperty('--ry');
      });
    }

    for (const button of document.querySelectorAll<HTMLElement>('[data-magnetic]')) {
      const clamp = (v: number): number => Math.max(-MAX_PULL, Math.min(MAX_PULL, v * PULL));
      on(button, 'pointermove', (e) => {
        const box = button.getBoundingClientRect();
        button.style.setProperty('--mx', `${clamp(e.clientX - box.left - box.width / 2).toFixed(1)}px`);
        button.style.setProperty('--my', `${clamp(e.clientY - box.top - box.height / 2).toFixed(1)}px`);
      });
      on(button, 'pointerleave', () => {
        button.style.removeProperty('--mx');
        button.style.removeProperty('--my');
      });
    }
    return () => undo.forEach((fn) => fn());
  }, []);
  return null;
}
