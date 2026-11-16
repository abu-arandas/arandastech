import type { CSSProperties, ReactNode } from 'react';

/** A page title whose words rise one after another as the page opens. Screen readers read it as one heading. */
export function Rise({ text }: { text: string }) {
  const words = text.split(/\s+/);
  return (
    <h1 className="rise">
      {words.map((word, i) => (
        <span key={i}>
          <span className="w" style={{ '--i': i } as CSSProperties}>
            {word}
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </h1>
  );
}

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
