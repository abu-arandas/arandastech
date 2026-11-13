import { call } from '@/lib/platform';
import { type Locale, money, pick, t } from '@/lib/i18n';

type L = { en: string; ar: string };
interface Pkg { id: string; name: L; outcome: L; deliverables: L[] }
interface Variant { sku: string; name: L; summary: L; includes: L[]; price_minor: number; currency: string }
interface Product { slug: string; name: L; summary: L; is_test: boolean; variants: Variant[] }

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale;
  const [packages, catalog] = await Promise.all([call<{ packages: Pkg[] }>('GET', '/api/public/packages'), call<{ products: Product[] }>('GET', '/api/public/catalog')]);
  return (
    <>
      <h1>{t('tagline', locale)}</h1>
      <p className="lead">{t('intro', locale)}</p>

      <h2 id="services">{t('services', locale)}</h2>
      <div className="grid">
        {packages.data.packages.map((p) => (
          <section className="card" key={p.id}>
            <h3>{pick(p.name, locale)}</h3>
            <p>{pick(p.outcome, locale)}</p>
            <ul>{p.deliverables.map((d) => <li key={d.en}>{pick(d, locale)}</li>)}</ul>
            <a className="button push" href={`/${locale}/contact?package=${p.id}`}>{t('askQuote', locale)}</a>
          </section>
        ))}
      </div>

      <h2 id="products">{t('products', locale)}</h2>
      {catalog.data.products.map((product) => (
        <section key={product.slug}>
          <h3>{pick(product.name, locale)} {product.is_test && <span className="tag">{t('testProduct', locale)}</span>}</h3>
          <p className="lead">{pick(product.summary, locale)}</p>
          <div className="grid">
            {product.variants.map((v) => (
              <div className="card" key={v.sku}>
                <h3>{pick(v.name, locale)}</h3>
                {pick(v.summary, locale) && <p>{pick(v.summary, locale)}</p>}
                {v.includes.length > 0 && <ul>{v.includes.map((i) => <li key={i.en}>{pick(i, locale)}</li>)}</ul>}
                <div className="price push">{money(v.price_minor, v.currency)}</div>
                <a className="button" href={`/${locale}/checkout/${v.sku}`}>{t('buy', locale)}</a>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
