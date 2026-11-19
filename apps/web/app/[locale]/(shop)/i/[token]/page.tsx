import type { Metadata } from 'next';
import { call } from '@/lib/platform';
import { type Locale, money, t } from '@/lib/i18n';

/** An invoice the client opens from our email, by its secret link: what is owed and how to pay it. */

interface Invoice {
  number: string;
  title: string;
  buyer: string;
  items: Array<{ description: string; amount_minor: number }>;
  total_minor: number;
  currency: string;
  due_on: string;
  status: 'sent' | 'paid' | 'void';
  how_to_pay: string;
}

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function InvoicePage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale: raw, token } = await params;
  const locale = raw as Locale;
  const found = await call<Invoice>('GET', `/api/public/invoices/${encodeURIComponent(token)}`);
  if (!found.ok)
    return (
      <p className="error" role="alert">
        {t('linkNotFound', locale)}
      </p>
    );
  const i = found.data;
  return (
    <>
      <p className="eyebrow enter">
        {t('invoice', locale)} <span dir="ltr">{i.number}</span>
      </p>
      <h1 className="enter">{i.title}</h1>
      <dl className="enter" style={{ animationDelay: '60ms' }}>
        <dt>{t('billedTo', locale)}</dt>
        <dd>{i.buyer}</dd>
        {i.items.map((item, index) => (
          <InvoiceLine key={index} label={item.description} value={money(item.amount_minor, i.currency)} />
        ))}
        <dt>{t('total', locale)}</dt>
        <dd>{money(i.total_minor, i.currency)}</dd>
        <dt>{t('dueOn', locale)}</dt>
        <dd dir="ltr">{i.due_on}</dd>
      </dl>
      {i.status === 'paid' && <p className="notice">{t('invoicePaid', locale)}</p>}
      {i.status === 'void' && <p className="notice">{t('invoiceVoid', locale)}</p>}
      {i.status === 'sent' && (
        <section className="notice enter" style={{ whiteSpace: 'pre-line', animationDelay: '100ms' }}>
          <strong>{t('howToPay', locale)}</strong>
          <br />
          {i.how_to_pay || t('howToPayAsk', locale)}
          <br />
          {t('payReference', locale)}
        </section>
      )}
    </>
  );
}

function InvoiceLine({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
