import { redirect } from 'next/navigation';
import { call } from '@/lib/platform';
import { isLocale, type Locale, t } from '@/lib/i18n';

async function send(formData: FormData): Promise<void> {
  'use server';
  // Only a known locale goes into the redirect, so a changed form field cannot send the visitor to another site.
  const raw = String(formData.get('locale'));
  const locale: Locale = isLocale(raw) ? raw : 'en';
  const text = (name: string): string => String(formData.get(name) ?? '').trim();
  const result = await call('POST', '/api/public/leads', {
    name: text('name'), email: text('email'), phone: text('phone') || undefined, message: text('message'),
    packageId: text('package') || undefined, locale, website: text('website'),
  });
  redirect(`/${locale}/contact?${result.ok ? 'sent=1' : `error=${encodeURIComponent(result.error ?? '')}`}`);
}

export default async function Contact({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = (await params).locale as Locale;
  const query = await searchParams;
  if (query.sent) return <p className="notice" role="status">{t('leadThanks', locale)}</p>;
  return (
    <>
      <h1>{t('contact', locale)}</h1>
      {query.error && <p className="error" role="alert">{query.error}</p>}
      <form action={send}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="package" value={query.package ?? ''} />
        {/* People never see this field. Only a script fills it in. */}
        <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <label>{t('name', locale)}<input name="name" required maxLength={120} /></label>
        <label>{t('email', locale)}<input name="email" type="email" required maxLength={200} dir="ltr" /></label>
        <label>{t('phone', locale)}<input name="phone" maxLength={40} dir="ltr" /></label>
        <label>{t('message', locale)}<textarea name="message" required rows={6} maxLength={5000} /></label>
        <button type="submit">{t('send', locale)}</button>
      </form>
    </>
  );
}
