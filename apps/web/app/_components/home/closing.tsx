import { type Locale, t, type TextKey } from '@/lib/i18n';
import { GUIDES, say } from '@/lib/guides';
import { withDays } from '@/lib/trial';
import { ShirtButton } from '@/app/_components/motion';
import { stagger } from '@/app/_components/text';

const TRIAL_POINTS: TextKey[] = ['trialPoint1', 'trialPoint2', 'trialPoint3'];

/** The free trial for shops: the till itself, three things it does, and the way in. */
export function TrialTeaser({ locale, days }: { locale: Locale; days: number }) {
  return (
    <section className="block trial-teaser">
      <div className="trial-art" data-reveal="" data-wipe="">
        <img src="/shots/retail-till.webp" alt={t('trialShot', locale)} width={1440} height={900} loading="lazy" />
      </div>
      <div>
        <p className="eyebrow" data-reveal="">
          {t('trialEyebrow', locale)}
        </p>
        <h2 data-reveal="">{withDays(t('trialTitle', locale), days)}</h2>
        <ul className="ticks">
          {TRIAL_POINTS.map((key, i) => (
            <li key={key} data-reveal="" style={stagger(i + 1)}>
              {t(key, locale)}
            </li>
          ))}
        </ul>
        <p data-reveal="" style={stagger(4)}>
          <a className="button big" href={`/${locale}/trial`}>
            {t('trialSend', locale)}
          </a>
        </p>
      </div>
    </section>
  );
}

/** Six guides as numbered cards whose arrow steps forward under the pointer. */
export function GuideCards({ locale, count, intro }: { locale: Locale; count?: number; intro?: boolean }) {
  return (
    <div className="guide-grid">
      {GUIDES.slice(0, count).map((guide, i) => (
        <a
          className="card guide-card"
          key={guide.slug}
          href={`/${locale}/guides/${guide.slug}`}
          data-reveal=""
          style={stagger(i % 3)}
        >
          <span className="guide-no">{String(i + 1).padStart(2, '0')}</span>
          <h3>{say(guide.title, locale)}</h3>
          {intro && <p>{say(guide.description, locale)}</p>}
          <span className="arrow-link push">{t('readGuide', locale)}</span>
        </a>
      ))}
    </div>
  );
}

export function Guides({ locale }: { locale: Locale }) {
  return (
    <section className="block" id="guides">
      <div className="section-head split-head" data-reveal="">
        <div>
          <p className="eyebrow">{t('guides', locale)}</p>
          <h2>{t('guidesTitle', locale)}</h2>
        </div>
        <a className="arrow-link" href={`/${locale}/guides`}>
          {t('guidesAll', locale)}
        </a>
      </div>
      <GuideCards locale={locale} count={6} />
    </section>
  );
}

/** The last word: a denim panel with one question and one action, and a shirt button that spins under the pointer. */
export function Closing({ locale }: { locale: Locale }) {
  return (
    <section className="closing" data-reveal="">
      <span className="closing-button" aria-hidden="true">
        <ShirtButton />
      </span>
      <h2>{t('closeTitle', locale)}</h2>
      <p>{t('closeLead', locale)}</p>
      <a className="button big light" href={`/${locale}/contact`} data-magnetic="">
        {t('ctaProject', locale)}
      </a>
    </section>
  );
}
