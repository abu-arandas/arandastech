import { call } from '@/lib/platform';
import { amount, isLocale, type Locale, money, pick, t } from '@/lib/i18n';
import { jsonLd, pageMetadata } from '@/lib/seo';
import { GUIDES, say } from '@/lib/guides';
import { Rise, stagger } from '@/app/_components/text';

type L = { en: string; ar: string };
interface Pkg {
  id: string;
  name: L;
  outcome: L;
  deliverables: L[];
}
interface Variant {
  sku: string;
  name: L;
  summary: L;
  includes: L[];
  price_minor: number;
  currency: string;
}
interface Product {
  slug: string;
  name: L;
  summary: L;
  is_test: boolean;
  variants: Variant[];
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, '', `${t('brand', locale)} · ${t('tagline', locale)}`, t('intro', locale));
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const [packages, catalog] = await Promise.all([
    call<{ packages: Pkg[] }>('GET', '/api/public/packages'),
    call<{ products: Product[] }>('GET', '/api/public/catalog'),
  ]);
  return (
    <>
      <p className="eyebrow enter">{t('homeEyebrow', locale)}</p>
      <Rise text={t('tagline', locale)} />
      <p className="lead enter" style={stagger(0, 360)}>
        {t('intro', locale)}
      </p>

      <div className="section-head" data-reveal="">
        <p className="eyebrow">{t('servicesEyebrow', locale)}</p>
        <h2 id="services">{t('services', locale)}</h2>
      </div>
      <div className="grid">
        {packages.data.packages.map((p, i) => (
          <section className="card" key={p.id} data-reveal="" style={stagger(i + 1)}>
            <h3>{pick(p.name, locale)}</h3>
            <p>{pick(p.outcome, locale)}</p>
            <ul>
              {p.deliverables.map((d) => (
                <li key={d.en}>{pick(d, locale)}</li>
              ))}
            </ul>
            <a className="button push" href={`/${locale}/contact?package=${p.id}`}>
              {t('askQuote', locale)}
            </a>
          </section>
        ))}
      </div>

      <div className="section-head" data-reveal="">
        <p className="eyebrow">{t('productsEyebrow', locale)}</p>
        <h2 id="products">{t('products', locale)}</h2>
      </div>
      {catalog.data.products.map((product) => (
        <section className="product" key={product.slug}>
          <h3 data-reveal="">
            {pick(product.name, locale)} {product.is_test && <span className="tag">{t('testProduct', locale)}</span>}
          </h3>
          <p className="lead" data-reveal="" style={stagger(1)}>
            {pick(product.summary, locale)}
          </p>
          <div className="grid">
            {product.variants.map((v, i) => (
              <div className="card" key={v.sku} data-reveal="" style={stagger(i + 1)}>
                <h3>{pick(v.name, locale)}</h3>
                {pick(v.summary, locale) && <p>{pick(v.summary, locale)}</p>}
                {v.includes.length > 0 && (
                  <ul>
                    {v.includes.map((i) => (
                      <li key={i.en}>{pick(i, locale)}</li>
                    ))}
                  </ul>
                )}
                <div className="price push">{money(v.price_minor, v.currency)}</div>
                <a className="button" href={`/${locale}/checkout/${v.sku}`}>
                  {t('buy', locale)}
                </a>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="section-head" data-reveal="">
        <p className="eyebrow">{t('guides', locale)}</p>
        <h2 id="guides">{t('guidesTitle', locale)}</h2>
      </div>
      <div className="grid">
        {GUIDES.slice(0, 6).map((guide, i) => (
          <a
            className="card guide-card"
            key={guide.slug}
            href={`/${locale}/guides/${guide.slug}`}
            data-reveal=""
            style={stagger(i)}
          >
            <h3>{say(guide.title, locale)}</h3>
          </a>
        ))}
      </div>
      <p data-reveal="">
        <a href={`/${locale}/guides`}>{t('guidesAll', locale)}</a>
      </p>
      <ProductData products={catalog.data.products} locale={locale} />
    </>
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
