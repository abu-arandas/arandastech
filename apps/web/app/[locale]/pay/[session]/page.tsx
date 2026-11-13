import { notFound, redirect } from 'next/navigation';
import { call } from '@/lib/platform';
import { isLocale, type Locale, t } from '@/lib/i18n';

async function pay(formData: FormData): Promise<void> {
  'use server';
  // Only a known locale goes into the redirect, so a changed form field cannot send the visitor to another site.
  const raw = String(formData.get('locale'));
  const locale: Locale = isLocale(raw) ? raw : 'en';
  // Stands in for the payment provider: it sends the platform a signed notice, as a real provider would.
  const result = await call<{ order_number: string }>('POST', '/api/demo/pay', { session: String(formData.get('session')) });
  // The buyer leaves with the order number already filled in, so they can look the order up straight away.
  redirect(`/${locale}/order?${result.ok ? `paid=1&number=${encodeURIComponent(result.data.order_number)}` : 'error=1'}`);
}

export default async function Pay({ params }: { params: Promise<{ locale: string; session: string }> }) {
  const { locale: raw, session } = await params;
  const locale = raw as Locale;
  if (process.env.DEMO_MODE !== 'true') notFound();
  return (
    <>
      <h1>{t('testPayment', locale)}</h1>
      <p className="notice">{t('testPaymentNote', locale)}</p>
      <form action={pay}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="session" value={session} />
        <button type="submit">{t('payNow', locale)}</button>
      </form>
    </>
  );
}
