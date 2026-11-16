'use client';

import { useEffect, useRef, useState } from 'react';
import { type Celebration, celebrate } from '@/lib/confetti';

/**
 * Plays the page's scroll reveals (every [data-reveal] rises in once, as it comes into view) and keeps the logo's
 * secret: on the home page, press the logo five times in a row for a shower of shirt buttons and a thank-you line.
 */
export function Motion({ home, secret }: { home: string; secret: string }) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    let observer: IntersectionObserver | undefined;
    if (root.classList.contains('js-motion') && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add('in');
            observer?.unobserve(entry.target);
          }
        },
        { rootMargin: '0px 0px -6% 0px' },
      );
      for (const item of items) observer.observe(item);
    } else for (const item of items) item.classList.add('in');
    root.classList.add('motion-ready');

    const brand = document.querySelector<HTMLAnchorElement>('header.site a.brand');
    let taps = 0;
    let last = 0;
    let hide: number | undefined;
    const onClick = (event: MouseEvent): void => {
      // Away from home the logo simply goes home; at home it counts.
      if (window.location.pathname !== home) return;
      event.preventDefault();
      window.scrollTo(0, 0);
      const now = performance.now();
      taps = now - last < 1500 ? taps + 1 : 1;
      last = now;
      brand?.classList.remove('shake');
      void brand?.offsetWidth;
      brand?.classList.add('shake');
      if (taps < 5) return;
      taps = 0;
      celebrate('buttons');
      setToast(secret);
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setToast(null), 3200);
    };
    brand?.addEventListener('click', onClick);
    return () => {
      observer?.disconnect();
      brand?.removeEventListener('click', onClick);
      window.clearTimeout(hide);
    };
  }, [home, secret]);

  return toast ? (
    <div className="toast" role="status">
      {toast}
    </div>
  ) : null;
}

/**
 * Celebrates good news once: an order paid or a message sent. [once] names the moment, so coming back to the same
 * page (or reloading it) does not throw the confetti again.
 */
export function Celebrate({ kind, once }: { kind: Celebration; once?: string }) {
  useEffect(() => {
    const key = once ? `zirr-celebrated:${once}` : null;
    try {
      if (key && sessionStorage.getItem(key)) return;
    } catch {
      // Private windows may refuse storage; celebrating twice is fine.
    }
    // The moment is marked as celebrated only when the confetti is actually thrown, so leaving the page within the
    // first quarter second does not use it up.
    const timer = window.setTimeout(() => {
      try {
        if (key) sessionStorage.setItem(key, '1');
      } catch {
        // As above.
      }
      celebrate(kind);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [kind, once]);
  return null;
}

/** The lost shirt button of the not-found page: it rolls in, and hops when clicked. */
export function LostButton({ label }: { label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const hop = (): void => {
    const button = ref.current;
    if (!button) return;
    button.classList.remove('hop');
    void button.offsetWidth;
    button.classList.add('hop');
  };
  return (
    <button ref={ref} type="button" className="lost-button" aria-label={label} title={label} onClick={hop}>
      <ShirtButton />
    </button>
  );
}

/** A shirt button in the brand's colours, the thread crossing its four holes. */
export function ShirtButton() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="var(--brand)" />
      <circle cx="20" cy="20" r="15" fill="none" stroke="var(--bg)" strokeOpacity=".3" strokeWidth="1.2" />
      <g fill="var(--bg)">
        <circle cx="15.2" cy="15.2" r="2.6" />
        <circle cx="24.8" cy="15.2" r="2.6" />
        <circle cx="15.2" cy="24.8" r="2.6" />
        <circle cx="24.8" cy="24.8" r="2.6" />
      </g>
      <g stroke="var(--thread)" strokeWidth="2.2" strokeLinecap="round">
        <line x1="15.2" y1="15.2" x2="24.8" y2="24.8" />
        <line x1="24.8" y1="15.2" x2="15.2" y2="24.8" />
      </g>
    </svg>
  );
}
