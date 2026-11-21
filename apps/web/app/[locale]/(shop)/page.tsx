import { Reveals } from '@/app/_components/motion';
import { call } from '@/lib/platform';
import { amount, isLocale, type Locale, money, pick, t, type TextKey } from '@/lib/i18n';
import { cheapest, type Pkg, type Product } from '@/lib/catalog';
import { jsonLd, pageMetadata } from '@/lib/seo';
import { trialDays } from '@/lib/trial';
import { type Fact, Hero } from '@/app/_components/home/hero';
import { Ticker } from '@/app/_components/home/ticker';
import { Products } from '@/app/_components/home/products';
import { Agencies } from '@/app/_components/home/agencies';
import { Closing, Guides, TrialTeaser } from '@/app/_components/home/closing';

const TICKS: TextKey[] = ['tick1', 'tick2', 'tick3', 'tick4', 'tick5', 'tick6', 'tick7', 'tick8'];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, '', `${t('brand', locale)} · ${t('tagline', locale)}`, t('intro', locale));
}

/** The figures under the hero's title, all read from the catalogue: how many products, and the lowest price. */
function facts(products: Product[], locale: Locale): Fact[] {
  const onSale = products.filter((product) => !product.is_test && product.variants.length > 0);
  const low = cheapest(onSale);
  return [
    ...(onSale.length > 0 ? [{ value: String(onSale.length), label: t('factProducts', locale) }] : []),
    ...(low
      ? [
          {
            value: t('factFrom', locale).replace('{price}', money(low.price_minor, low.currency)),
            label: t('factFromLabel', locale),
          },
        ]
      : []),
    { value: t('factLanguages', locale), label: t('factLanguagesLabel', locale) },
  ];
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const [packages, catalog, days] = await Promise.all([
    call<{ packages: Pkg[] }>('GET', '/api/public/packages'),
    call<{ products: Product[] }>('GET', '/api/public/catalog'),
    trialDays(),
  ]);
  const products = catalog.data.products;
  return (
    <div className="home">
      <Hero locale={locale} facts={facts(products, locale)} />
      <Ticker
        items={TICKS.map((key) => t(key, locale))}
        label={t('tickerLabel', locale)}
        pause={t('pauseTicker', locale)}
        play={t('playTicker', locale)}
      />
      <Products products={products} locale={locale} />
      <Agencies packages={packages.data.packages} locale={locale} />
      <TrialTeaser locale={locale} days={days} />
      <Guides locale={locale} />
      <Closing locale={locale} />
      <ProductData products={products} locale={locale} />
      <Reveals />
    </div>
  );
}

/** The products on sale as schema.org records, so search engines can show their prices. Test products are left out. */
function ProductData({ products, locale }: { products: Product[]; locale: Locale }) {
  const data = products
    .filter((product) => !product.is_test && product.variants.length > 0)
    .map((product) => ({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: pick(product.name, locale),
      description: pick(product.summary, locale),
      brand: { '@type': 'Brand', name: 'Zirr' },
      offers: product.variants.map((v) => ({
        '@type': 'Offer',
        name: pick(v.name, locale),
        price: amount(v.price_minor, v.currency),
        priceCurrency: v.currency,
        availability: 'https://schema.org/InStock',
      })),
    }));
  if (!data.length) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(data)} />;
}
