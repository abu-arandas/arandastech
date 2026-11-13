import { randomUUID } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';
import { call } from '@/lib/platform';
import { isLocale, type Locale, money, pick, t } from '@/lib/i18n';

type L = { en: string; ar: string };
interface Product { kind: string; name: L; variants: Array<{ sku: string; name: L; price_minor: number; currency: string }> }

async function order(formData: FormData): Promise<void> {
  'use server';
  // Only a known locale goes into the redirect, so a changed form field cannot send the visitor to another site.
  const raw = String(formData.get('locale'));
  const locale: Locale = isLocale(raw) ? raw : 'en';
  const text = (name: string): string => String(formData.get(name) ?? '').trim();
  const result = await call<{ session: string }>('POST', '/api/public/checkout', {
    items: [{ sku: text('sku'), quantity: 1 }], buyer: { name: text('name'), email: text('email') }, locale,
    shippingAddress: text('address') || undefined, idempotencyKey: text('key'),
  });
  if (!result.ok) redirect(`/${locale}/checkout/${encodeURIComponent(text('sku'))}?error=${encodeURIComponent(result.error ?? '')}`);
  // A live provider would host this page. In the first build it is a test page that takes no money.
  redirect(`/${locale}/pay/${result.data.session}`);
}

export default async function Checkout({ params, searchParams }: { params: Promise<{ locale: string; sku: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale: raw, sku } = await params;
  const locale = raw as Locale;
  const catalog = await call<{ products: Product[] }>('GET', '/api/public/catalog');
  const product = catalog.data.products.find((p) => p.variants.some((v) => v.sku === sku));
  const variant = product?.variants.find((v) => v.sku === sku);
  if (!product || !variant) notFound();
  const error = (await searchParams).error;
  return (
    <>
      <h1>{t('checkout', locale)}</h1>
      <dl>
        <dt>{pick(product.name, locale)}</dt><dd>{pick(variant.name, locale)}</dd>
        <dt>{t('total', locale)}</dt><dd>{money(variant.price_minor, variant.currency)}</dd>
      </dl>
      {error && <p className="error" role="alert">{error}</p>}
      <form action={order}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="sku" value={sku} />
        {/* The same key on a repeated submit finds the same order instead of creating a second one. */}
        <input type="hidden" name="key" value={randomUUID()} />
        <label>{t('name', locale)}<input name="name" required maxLength={120} /></label>
        <label>{t('email', locale)}<input name="email" type="email" required maxLength={200} dir="ltr" /></label>
        {product.kind === 'physical' && <label>{t('address', locale)}<textarea name="address" required rows={3} maxLength={500} /></label>}
        <button type="submit">{t('continueToPayment', locale)}</button>
      </form>
    </>
  );
}
