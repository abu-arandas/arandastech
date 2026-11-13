import { notFound, redirect } from 'next/navigation';
import { call } from '@/lib/platform';
import { type Locale, t } from '@/lib/i18n';

async function pay(formData: FormData): Promise<void> {
  'use server';
  const locale = String(formData.get('locale')) as Locale;
  // Stands in for the payment provider: it sends the platform a signed notice, as a real provider would.
  const result = await call('POST', '/api/demo/pay', { session: String(formData.get('session')) });
  redirect(`/${locale}/order?${result.ok ? 'paid=1' : 'error=1'}`);
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
