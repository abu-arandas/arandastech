import { Fragment } from 'react';
import { call } from '@/lib/platform';
import { type Locale, money, pick, t, type TextKey } from '@/lib/i18n';
import { Celebrate } from '@/app/_components/motion';
import { Done } from '@/app/_components/text';

interface Status {
  number: string;
  status: string;
  total_minor: number;
  currency: string;
  items: Array<{ title: { en: string; ar: string }; quantity: number }>;
}

export default async function Order({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const locale = (await params).locale as Locale;
  const query = await searchParams;
  const found =
    query.number && query.email
      ? await call<Status>(
          'GET',
          `/api/public/orders/${encodeURIComponent(query.number)}?email=${encodeURIComponent(query.email)}`,
        )
      : null;
  return (
    <>
      <h1 className="enter">{t('orderStatus', locale)}</h1>
      {/* An order just paid gets one shower of confetti, once per order. The words stay plain. */}
      {query.paid && (
        <>
          <Done>{t('paidThanks', locale)}</Done>
          <Celebrate kind="rain" once={`paid-${query.number ?? ''}`} />
        </>
      )}
      <form method="get" className="enter" style={{ animationDelay: '80ms' }}>
        <label>
          {t('orderNumber', locale)}
          <input name="number" required defaultValue={query.number ?? ''} dir="ltr" />
        </label>
        <label>
          {t('email', locale)}
          <input name="email" type="email" required defaultValue={query.email ?? ''} dir="ltr" />
        </label>
        <button type="submit">{t('lookUp', locale)}</button>
      </form>
      {found && !found.ok && (
        <p className="error" role="alert">
          {t('notFound', locale)}
        </p>
      )}
      {found?.ok && (
        <dl>
          <dt>{t('orderNumber', locale)}</dt>
          <dd dir="ltr">{found.data.number}</dd>
          <dt>{t('orderStatus', locale)}</dt>
          <dd>{t(`status_${found.data.status}` as TextKey, locale)}</dd>
          <dt>{t('total', locale)}</dt>
          <dd>{money(found.data.total_minor, found.data.currency)}</dd>
          {found.data.items.map((item) => (
            <Fragment key={item.title.en}>
              <dt>×{item.quantity}</dt>
              <dd>{pick(item.title, locale)}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </>
  );
}
