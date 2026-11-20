import { type Locale, isLocale, t } from '@/lib/i18n';
import { GUIDES, say } from '@/lib/guides';
import { pageMetadata } from '@/lib/seo';
import { stagger } from '@/app/_components/text';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, '/guides', t('guidesTitle', locale), t('guidesIntro', locale));
}

/** Every search page, as a list of cards. */
export default async function Guides({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  return (
    <>
      <h1 className="enter">{t('guidesTitle', locale)}</h1>
      <p className="lead enter">{t('guidesIntro', locale)}</p>
      <div className="grid">
        {GUIDES.map((guide, i) => (
          <a
            className="card guide-card"
            key={guide.slug}
            href={`/${locale}/guides/${guide.slug}`}
            data-reveal=""
            style={stagger(i)}
          >
            <h3>{say(guide.title, locale)}</h3>
            <p>{say(guide.description, locale)}</p>
          </a>
        ))}
      </div>
    </>
  );
}
