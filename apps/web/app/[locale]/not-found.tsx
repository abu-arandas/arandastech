'use client';

import { useParams, usePathname } from 'next/navigation';
import { isLocale, type Locale, t } from '@/lib/i18n';
import { LostButton } from '@/app/_components/motion';

/** The lost button rolls in, with one of a few kind lines (picked by the address, so it holds while the page draws). */
export default function NotFound() {
  const params = useParams<{ locale?: string }>();
  const path = usePathname() ?? '';
  const locale: Locale = isLocale(String(params?.locale)) ? (params.locale as Locale) : 'en';
  const lines = [t('lost1', locale), t('lost2', locale), t('lost3', locale)];
  return (
    <section className="lost">
      <LostButton label={t('lostButton', locale)} />
      <p className="eyebrow enter">{t('pageNotFound', locale)}</p>
      <h1 className="enter" style={{ animationDelay: '120ms' }}>
        {lines[path.length % lines.length]}
      </h1>
      <p className="lead enter" style={{ animationDelay: '240ms' }}>
        {t('lostBody', locale)}
      </p>
      <div className="actions enter" style={{ animationDelay: '320ms' }}>
        <a className="button" href={`/${locale}`}>
          {t('goHome', locale)}
        </a>
        <a className="button quiet" href={`/${locale}/contact`}>
          {t('contact', locale)}
        </a>
      </div>
    </section>
  );
}
