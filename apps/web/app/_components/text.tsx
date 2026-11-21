import type { CSSProperties, ReactNode } from 'react';

/** Good news with a tick that draws itself beside it. */
export function Done({ children }: { children: ReactNode }) {
  return (
    <div className="notice done" role="status">
      <svg className="tick" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="12.5" />
        <path d="M8.5 14.5l3.8 3.8 7.4-8" pathLength={1} />
      </svg>
      <span>{children}</span>
    </div>
  );
}

/** The position of an item in a list, for staggered entrances: `style={stagger(i)}`. */
export const stagger = (i: number, delay?: number): CSSProperties =>
  ({ '--i': i, ...(delay === undefined ? {} : { '--d': `${delay}ms` }) }) as CSSProperties;
