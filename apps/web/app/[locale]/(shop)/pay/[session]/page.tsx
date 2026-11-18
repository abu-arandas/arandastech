import { notFound, redirect } from 'next/navigation';
import { call } from '@/lib/platform';
import { isLocale, type Locale, t } from '@/lib/i18n';

interface PayAnswer {
  provider: 'paytabs' | 'test' | 'none';
  order_number: string;
  paid: boolean;
  url?: string;
}

// Only PayTabs' own pages may receive the buyer, so a changed answer can never send them to another site.
const PAYTABS = /^https:\/\/secure(-[a-z]+)?\.paytabs\.(com|sa)\//;

const localeOf = (formData: FormData): Locale => {
  const raw = String(formData.get('locale'));
  return isLocale(raw) ? raw : 'en';
};

async function payByCard(formData: FormData): Promise<void> {
  'use server';
  const locale = localeOf(formData);
  const result = await call<PayAnswer>('POST', '/api/public/pay', { session: String(formData.get('session')), locale });
  if (result.ok && result.data.url && PAYTABS.test(result.data.url)) redirect(result.data.url);
  redirect(`/${locale}/order?error=1`);
}

async function payTest(formData: FormData): Promise<void> {
  'use server';
  const locale = localeOf(formData);
  // Stands in for the payment provider: it sends the platform a signed notice, as a real provider would.
  const result = await call<{ order_number: string }>('POST', '/api/demo/pay', {
    session: String(formData.get('session')),
  });
  // The buyer leaves with the order number already filled in, so they can look the order up straight away.
  redirect(
    `/${locale}/order?${result.ok ? `paid=1&number=${encodeURIComponent(result.data.order_number)}` : 'error=1'}`,
  );
}

export default async function Pay({ params }: { params: Promise<{ locale: string; session: string }> }) {
  const { locale: raw, session } = await params;
  const locale = raw as Locale;
  // Asking without paying tells the page which way this checkout is paid. The card page itself is made on the press.
  const peek = await call<{ provider: string }>('GET', `/api/public/payments`);
  const provider = peek.ok ? peek.data.provider : 'none';
  if (provider === 'none') notFound();
  const live = provider === 'paytabs';
  return (
    <>
      <h1 className="enter">{t(live ? 'cardPayment' : 'testPayment', locale)}</h1>
      <p className="notice enter" style={{ animationDelay: '80ms' }}>
        {t(live ? 'cardPaymentNote' : 'testPaymentNote', locale)}
      </p>
      <form action={live ? payByCard : payTest} className="enter" style={{ animationDelay: '160ms' }}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="session" value={session} />
        <button type="submit">{t(live ? 'goToPayment' : 'payNow', locale)}</button>
      </form>
    </>
  );
}
