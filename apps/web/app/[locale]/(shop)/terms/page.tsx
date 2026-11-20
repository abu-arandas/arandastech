import { isLocale, type Locale } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { TERMS, legalText } from '@/lib/legal';
import { Legal } from '@/app/_components/legal';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, '/terms', legalText(TERMS.title, locale), legalText(TERMS.sections[0]!.body[0]!, locale));
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <Legal page={TERMS} locale={(await params).locale as Locale} />;
}
