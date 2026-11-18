import { type Locale, t } from '@/lib/i18n';
import { type LegalPage, legalText } from '@/lib/legal';

/** A privacy or terms page: a title, the date it last changed, then its sections. */
export function Legal({ page, locale }: { page: LegalPage; locale: Locale }) {
  return (
    <article className="legal enter">
      <h1>{legalText(page.title, locale)}</h1>
      <p className="muted">
        {t('lastUpdated', locale)} <time dateTime={page.updated}>{page.updated}</time>
      </p>
      {page.sections.map((section) => (
        <section key={section.title.en}>
          <h2>{legalText(section.title, locale)}</h2>
          {section.body.map((p) => (
            <p key={p.en}>{legalText(p, locale)}</p>
          ))}
        </section>
      ))}
      <p>
        <a href={`/${locale}/contact`}>{t('contact', locale)}</a>
      </p>
    </article>
  );
}
