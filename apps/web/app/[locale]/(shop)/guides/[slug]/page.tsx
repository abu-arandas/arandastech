import { notFound } from 'next/navigation';
import { type Locale, isLocale, t } from '@/lib/i18n';
import { type Guide, type GuideTable, findGuide, linkFor, say, structuredData } from '@/lib/guides';
import { siteUrl } from '@/lib/platform';
import { jsonLd, pageMetadata } from '@/lib/seo';

type Params = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { locale, slug } = await params;
  const guide = findGuide(slug);
  if (!isLocale(locale) || !guide) return {};
  return pageMetadata(locale, `/guides/${guide.slug}`, say(guide.title, locale), say(guide.description, locale));
}

/** One search page: the question as the title, a short answer, the facts, then where to go next. */
export default async function GuidePage({ params }: Params) {
  const { locale: given, slug } = await params;
  const guide = findGuide(slug);
  if (!guide || !isLocale(given)) notFound();
  const locale: Locale = given;
  const data = structuredData(guide, locale, `${siteUrl()}/${locale}/guides/${guide.slug}`);
  return (
    <article className="guide enter">
      {data && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(data)} />}
      <p className="eyebrow">{t('guides', locale)}</p>
      <h1>{say(guide.title, locale)}</h1>
      <p className="lead">{say(guide.intro, locale)}</p>
      {guide.table && <Table table={guide.table} locale={locale} />}
      <Sections guide={guide} locale={locale} />
      <h2>{t('guideNext', locale)}</h2>
      <p className="guide-links">
        {guide.links.map((link, i) => (
          <a key={link.href} className={i === 0 ? 'button' : 'button quiet'} href={linkFor(link.href, locale)}>
            {say(link.label, locale)}
          </a>
        ))}
      </p>
    </article>
  );
}

function Sections({ guide, locale }: { guide: Guide; locale: Locale }) {
  return guide.sections.map((section) => (
    <section key={section.heading.en}>
      <h2>{say(section.heading, locale)}</h2>
      {section.body.map((p) => (
        <p key={p.en}>{say(p, locale)}</p>
      ))}
      {section.points && (
        <ul>
          {section.points.map((point) => (
            <li key={point.en}>{say(point, locale)}</li>
          ))}
        </ul>
      )}
    </section>
  ));
}

function Table({ table, locale }: { table: GuideTable; locale: Locale }) {
  return (
    <div className="table-scroll">
      <table className="compare">
        <thead>
          <tr>
            {table.head.map((cell, i) => (
              <th key={i} scope="col">
                {say(cell, locale)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row[0]!.en}>
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row">
                    {say(cell, locale)}
                  </th>
                ) : (
                  <td key={i}>{say(cell, locale)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
