'use client';

import { useState } from 'react';

/**
 * A slow moving line of what we build with, between two rows of stitches. It pauses under the pointer, and the small
 * button beside it stops it for good (any loop that runs longer than five seconds has one). Under reduced motion it
 * stands still and wraps.
 */
export function Ticker({ items, label, pause, play }: { items: string[]; label: string; pause: string; play: string }) {
  const [paused, setPaused] = useState(false);
  // The list is drawn twice so the line can loop without a gap; the copy is hidden from screen readers.
  const row = (copy: boolean) => (
    <ul aria-hidden={copy || undefined}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
  return (
    <section className={`ticker bleed${paused ? ' paused' : ''}`} aria-label={label}>
      <div className="ticker-track">
        {row(false)}
        {row(true)}
      </div>
      <button
        type="button"
        className="ticker-toggle"
        aria-pressed={paused}
        aria-label={paused ? play : pause}
        title={paused ? play : pause}
        onClick={() => setPaused(!paused)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          {paused ? <path d="M5 3.5v9l7-4.5z" /> : <path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" />}
        </svg>
      </button>
    </section>
  );
}
