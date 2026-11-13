import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { notFound } from 'next/navigation';
import { isLocale, t } from '@/lib/i18n';
import '../globals.css';

/** Rubik, the house font for Arabic and English (SIL Open Font License 1.1), served from this site. */
const rubik = localFont({ src: '../fonts/Rubik.ttf', variable: '--font-rubik', weight: '300 900', display: 'swap' });

/** The Zirr mark: a shirt button whose four holes are app tiles, with the top-right hole lit in thread orange. */
function Mark() {
  return (
    <svg viewBox="0 0 120 120" width="30" height="30" aria-hidden="true">
      <circle className="mark-disc" cx="60" cy="60" r="52" />
      <circle className="mark-ring" cx="60" cy="60" r="43" />
      <rect className="mark-hole" x="38" y="38" width="19" height="19" rx="6" />
      <rect className="mark-lit" x="63" y="38" width="19" height="19" rx="6" />
      <rect className="mark-hole" x="38" y="63" width="19" height="19" rx="6" />
      <rect className="mark-hole" x="63" y="63" width="19" height="19" rx="6" />
    </svg>
  );
}

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
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} className={rubik.variable}>
      <body>
        {process.env.DEMO_MODE === 'true' && <div className="banner">{t('demoBanner', locale)}</div>}
        <header className="site">
          <div className="wrap">
            <a className="brand" href={`/${locale}`}>
              <Mark />
              {t('wordmark', locale)}
            </a>
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
