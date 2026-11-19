import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { call } from '@/lib/platform';
import { isLocale, type Locale, t } from '@/lib/i18n';
import { Done } from '@/app/_components/text';

/**
 * The unsubscribe link in every sales email. Opening it changes nothing, because mail scanners open links by
 * themselves; the button does it, and so does the mail app's own unsubscribe button (List-Unsubscribe).
 */

export const metadata: Metadata = { robots: { index: false, follow: false } };

async function stop(formData: FormData): Promise<void> {
  'use server';
  const raw = String(formData.get('locale'));
  const locale: Locale = isLocale(raw) ? raw : 'en';
  const token = String(formData.get('token')).replace(/[^\w-]/g, '');
  const result = await call<{ done: boolean }>('POST', `/api/public/unsubscribe/${token}`);
  redirect(`/${locale}/u/${token}?${result.ok && result.data.done ? 'done=1' : 'unknown=1'}`);
}

export default async function Unsubscribe({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale: raw, token } = await params;
  const locale = raw as Locale;
  const query = await searchParams;
  if (query.done) {
    const status = await call<{ stopped: boolean }>('GET', `/api/public/unsubscribe/${encodeURIComponent(token)}`);
    if (status.ok && status.data.stopped) return <Done>{t('unsubscribed', locale)}</Done>;
  }
  return (
    <>
      <h1 className="enter">{t('unsubscribeTitle', locale)}</h1>
      {query.unknown && (
        <p className="error" role="alert">
          {t('unsubscribeUnknown', locale)}
        </p>
      )}
      <form action={stop} className="enter">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="token" value={token} />
        <button className="button" type="submit">
          {t('unsubscribeButton', locale)}
        </button>
      </form>
    </>
  );
}
