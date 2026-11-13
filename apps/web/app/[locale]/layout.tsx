import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { isLocale, t } from '@/lib/i18n';
import '../globals.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: `${t('brand', locale)} · ${t('tagline', locale)}`, description: t('intro', locale) };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const other = locale === 'en' ? 'ar' : 'en';
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body>
        {process.env.DEMO_MODE === 'true' && <div className="banner">{t('demoBanner', locale)}</div>}
        <header className="site">
          <div className="wrap">
            <a className="brand" href={`/${locale}`}>{t('brand', locale)}</a>
            <nav>
              <a href={`/${locale}#services`}>{t('services', locale)}</a>
              <a href={`/${locale}#products`}>{t('products', locale)}</a>
              <a href={`/${locale}/contact`}>{t('contact', locale)}</a>
              <a href={`/${locale}/order`}>{t('orderStatus', locale)}</a>
              <a href={`/${other}`} lang={other}>{t('otherLanguage', locale)}</a>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
