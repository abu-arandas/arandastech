import { type Locale, pick, t, type TextKey } from '@/lib/i18n';
import type { Pkg } from '@/lib/catalog';
import { stagger } from '@/app/_components/text';

const STEPS: [TextKey, TextKey][] = [
  ['step1Title', 'step1Body'],
  ['step2Title', 'step2Body'],
  ['step3Title', 'step3Body'],
];

/**
 * Work for agencies, on an ink band: three steps joined by a stitch that sews itself across as the band comes into
 * view, the service packages when the owner has put any on sale, and one action.
 */
export function Agencies({ packages, locale }: { packages: Pkg[]; locale: Locale }) {
  return (
    <section className="agencies bleed" id="agencies">
      <div className="wrap">
        <div className="section-head" data-reveal="">
          <p className="eyebrow">{t('agenciesEyebrow', locale)}</p>
          <h2>{t('agenciesTitle', locale)}</h2>
          <p className="lead">{t('agenciesLead', locale)}</p>
        </div>
        <ol className="steps" data-reveal="">
          {STEPS.map(([title, body], i) => (
            <li key={title} style={stagger(i + 1)}>
              <span className="step-no" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{t(title, locale)}</h3>
              <p>{t(body, locale)}</p>
            </li>
          ))}
        </ol>
        {packages.length > 0 && (
          <div className="grid packages">
            {packages.map((p, i) => (
              <section className="card" key={p.id} data-reveal="" style={stagger(i + 1)}>
                <h3>{pick(p.name, locale)}</h3>
                <p>{pick(p.outcome, locale)}</p>
                <ul>
                  {p.deliverables.map((d) => (
                    <li key={d.en}>{pick(d, locale)}</li>
                  ))}
                </ul>
                <a className="button push" href={`/${locale}/contact?package=${p.id}`}>
                  {t('askQuote', locale)}
                </a>
              </section>
            ))}
          </div>
        )}
        <p data-reveal="">
          <a className="button big light" href={`/${locale}/contact`} data-magnetic="">
            {t('agenciesCta', locale)}
          </a>
        </p>
      </div>
    </section>
  );
}
