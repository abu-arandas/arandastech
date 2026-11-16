'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { isLocale, type Locale, t } from '@/lib/i18n';
import { ShirtButton } from '@/app/_components/motion';

/** While a page loads: the Zirr button presses itself in, and the line under it changes now and then. */
export default function Loading() {
  const params = useParams<{ locale?: string }>();
  const locale: Locale = isLocale(String(params?.locale)) ? (params.locale as Locale) : 'en';
  const lines = [t('loading1', locale), t('loading2', locale), t('loading3', locale)];
  const [line, setLine] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setLine((n) => n + 1), 2200);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="loading" role="status" aria-label={t('loading', locale)}>
      <ShirtButton />
      <p aria-hidden="true">{lines[line % lines.length]}</p>
    </div>
  );
}
