import { Reveals } from '@/app/_components/motion';
import { type Locale, isLocale, t } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { GuideCards } from '@/app/_components/home/closing';

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
      <p className="eyebrow enter">{t('guides', locale)}</p>
      <h1 className="enter">{t('guidesTitle', locale)}</h1>
      <p className="lead enter">{t('guidesIntro', locale)}</p>
      <GuideCards locale={locale} intro />
      <Reveals />
    </>
  );
}
