import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { call, workAfterResponse } from '@/lib/platform';
import { isLocale, type Locale, money, t, type TextKey } from '@/lib/i18n';
import { Celebrate } from '@/app/_components/motion';
import { Done } from '@/app/_components/text';

/** A proposal the client opens from our email, by its secret link, and accepts or declines here. */

interface Proposal {
  number: string;
  title: string;
  client: string;
  items: Array<{ description: string; amount_minor: number }>;
  total_minor: number;
  currency: string;
  deposit_minor: number;
  notes: string;
  valid_until: string;
  status: 'sent' | 'accepted' | 'declined' | 'expired';
}

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Only a known locale and a link-safe token go into the redirect, so a changed field cannot send anyone elsewhere.
const back = (formData: FormData): string => {
  const raw = String(formData.get('locale'));
  const locale: Locale = isLocale(raw) ? raw : 'en';
  const token = String(formData.get('token')).replace(/[^\w-]/g, '');
  return `/${locale}/p/${token}`;
};

async function accept(formData: FormData): Promise<void> {
  'use server';
  const token = String(formData.get('token')).replace(/[^\w-]/g, '');
  const result = await call('POST', `/api/public/proposals/${token}/accept`, {
    name: String(formData.get('name') ?? ''),
  });
  // The invoice email is written right after the answer, not at the next daily run.
  if (result.ok) workAfterResponse();
  redirect(`${back(formData)}?${result.ok ? 'accepted=1' : `error=${encodeURIComponent(result.error ?? '')}`}`);
}

async function decline(formData: FormData): Promise<void> {
  'use server';
  const token = String(formData.get('token')).replace(/[^\w-]/g, '');
  const result = await call('POST', `/api/public/proposals/${token}/decline`, {
    reason: String(formData.get('reason') ?? ''),
  });
  redirect(`${back(formData)}?${result.ok ? 'declined=1' : `error=${encodeURIComponent(result.error ?? '')}`}`);
}

export default async function ProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale: raw, token } = await params;
  const locale = raw as Locale;
  const query = await searchParams;
  if (query.accepted)
    return (
      <>
        <Done>{t('acceptedThanks', locale)}</Done>
        <Celebrate kind="burst" once={`accepted-${token}`} />
      </>
    );
  if (query.declined) return <Done>{t('declinedThanks', locale)}</Done>;
  const found = await call<Proposal>('GET', `/api/public/proposals/${encodeURIComponent(token)}`);
  if (!found.ok)
    return (
      <p className="error" role="alert">
        {t('linkNotFound', locale)}
      </p>
    );
  const p = found.data;
  const partial = p.deposit_minor > 0 && p.deposit_minor < p.total_minor;
  return (
    <>
      <p className="eyebrow enter">
        {t('proposal', locale)} <span dir="ltr">{p.number}</span>
      </p>
      <h1 className="enter">{p.title}</h1>
      {query.error && (
        <p className="error" role="alert">
          {query.error}
        </p>
      )}
      <dl className="enter" style={{ animationDelay: '60ms' }}>
        <dt>{t('preparedFor', locale)}</dt>
        <dd>{p.client}</dd>
        {p.items.map((item, index) => (
          <Line key={index} label={item.description} value={money(item.amount_minor, p.currency)} />
        ))}
        <dt>{t('total', locale)}</dt>
        <dd>{money(p.total_minor, p.currency)}</dd>
        {partial && <Line label={t('depositOnAccept', locale)} value={money(p.deposit_minor, p.currency)} />}
        <dt>{t('validUntil', locale)}</dt>
        <dd dir="ltr">{p.valid_until}</dd>
      </dl>
      {p.notes && (
        <section className="notice enter" style={{ whiteSpace: 'pre-line', animationDelay: '100ms' }}>
          <strong>{t('notes', locale)}</strong>
          <br />
          {p.notes}
        </section>
      )}
      {p.status === 'sent' ? (
        <>
          <form action={accept} className="enter" style={{ animationDelay: '140ms' }}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="token" value={token} />
            <label>
              {t('acceptName', locale)}
              <input name="name" required maxLength={120} autoComplete="name" />
            </label>
            <button type="submit">{t('acceptProposal', locale)}</button>
          </form>
          <details className="enter" style={{ animationDelay: '180ms' }}>
            <summary>{t('declineProposal', locale)}</summary>
            <form action={decline}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="token" value={token} />
              <label>
                {t('declineReason', locale)}
                <textarea name="reason" rows={3} maxLength={1000} />
              </label>
              <button type="submit">{t('declineProposal', locale)}</button>
            </form>
          </details>
        </>
      ) : (
        <p className="notice">{t(`proposal_${p.status}` as TextKey, locale)}</p>
      )}
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
