import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { notFound } from 'next/navigation';
import { isLocale, t } from '@/lib/i18n';
import { Motion } from '@/app/_components/motion';
import { SiteFooter, SiteHeader } from '@/app/_components/site';
import { Pointer } from '@/app/_components/pointer';
import { siteUrl } from '@/lib/platform';
import '../globals.css';
import '../site.css';
import '../home.css';
import '../pages.css';

/** Rubik, the house font for Arabic and English (SIL Open Font License 1.1), served from this site. */
const rubik = localFont({ src: '../fonts/Rubik.ttf', variable: '--font-rubik', weight: '300 900', display: 'swap' });

/**
 * Runs before the first paint: marks the page as one whose reveals the script will play, unless the visitor asked for
 * reduced motion. Without it (no JavaScript) everything simply shows.
 */
const MOTION = `if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('js-motion')`;

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    metadataBase: new URL(siteUrl()),
    title: `${t('brand', locale)} · ${t('tagline', locale)}`,
    description: t('intro', locale),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} className={rubik.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION }} />
      </head>
      <body>
        {process.env.DEMO_MODE === 'true' && <div className="banner">{t('demoBanner', locale)}</div>}
        <SiteHeader locale={locale} />
        <main className="wrap">{children}</main>
        <SiteFooter locale={locale} />
        <Motion home={`/${locale}`} secret={t('secret', locale)} />
        <Pointer />
      </body>
    </html>
  );
}
