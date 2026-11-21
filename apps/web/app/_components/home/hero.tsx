import type { CSSProperties } from 'react';
import { type Locale, t } from '@/lib/i18n';
import { heroShots } from '@/lib/showcase';
import { ShirtButton } from '@/app/_components/motion';
import { stagger } from '@/app/_components/text';

/** A figure under the title, such as "2 products ready to ship". */
export interface Fact {
  value: string;
  label: string;
}

/** The title, word by word, with the stitch sewn under the one word heroMark names. */
function Title({ locale }: { locale: Locale }) {
  const mark = t('heroMark', locale);
  const words = t('heroTitle', locale).split(/\s+/);
  return (
    <h1 className="rise hero-title">
      {words.map((word, i) => (
        <span key={i}>
          <span className={`w${word.startsWith(mark) ? ' sewn' : ''}`} style={{ '--i': i } as CSSProperties}>
            {word}
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </h1>
  );
}

/** The first screen: what Zirr makes and for whom, two actions, three true figures, and the product on two screens. */
export function Hero({ locale, facts }: { locale: Locale; facts: Fact[] }) {
  const shots = heroShots(locale);
  return (
    <section className="hero bleed">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <p className="pill enter">
            <span className="dot" aria-hidden="true" />
            {t('homeEyebrow', locale)}
          </p>
          <Title locale={locale} />
          <p className="lead enter" style={stagger(0, 420)}>
            {t('intro', locale)}
          </p>
          <div className="actions enter" style={stagger(0, 560)}>
            <a className="button big" href={`/${locale}/contact`} data-magnetic="">
              {t('ctaProject', locale)}
            </a>
            <a className="button big quiet" href={`/${locale}#products`}>
              {t('ctaProducts', locale)}
            </a>
          </div>
          <dl className="facts enter" style={stagger(0, 700)}>
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="hero-art" role="img" aria-label={t('heroShot', locale)}>
          <div className="browser" data-tilt="">
            <div className="browser-bar" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <img src={shots.shot} alt="" width={1440} height={900} fetchPriority="high" />
          </div>
          <div className="phone">
            <img src={shots.phone} alt="" width={390} height={844} />
          </div>
          <span className="sticker" aria-hidden="true">
            <ShirtButton />
          </span>
        </div>
      </div>
    </section>
  );
}
