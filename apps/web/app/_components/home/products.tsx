import { type Locale, money, pick, t } from '@/lib/i18n';
import type { Product, Variant } from '@/lib/catalog';
import { showcase } from '@/lib/showcase';
import { stagger } from '@/app/_components/text';

function License({ v, locale, i }: { v: Variant; locale: Locale; i: number }) {
  return (
    <div className="card license" data-reveal="" style={stagger(i + 1)}>
      <h4>{pick(v.name, locale)}</h4>
      {pick(v.summary, locale) && <p className="muted">{pick(v.summary, locale)}</p>}
      {v.includes.length > 0 && (
        <ul>
          {v.includes.map((item) => (
            <li key={item.en}>{pick(item, locale)}</li>
          ))}
        </ul>
      )}
      <div className="license-foot push">
        <span className="price">{money(v.price_minor, v.currency)}</span>
        <a className="button" href={`/${locale}/checkout/${v.sku}`}>
          {t('buy', locale)}
        </a>
      </div>
    </div>
  );
}

/** One product: its picture on two screens (tilting toward the pointer), its name, what it is, and its licenses. */
function ProductRow({ product, locale, flip }: { product: Product; locale: Locale; flip: boolean }) {
  const shots = showcase(product.slug, locale);
  return (
    <article className={`product-row${flip ? ' flip' : ''}${shots ? '' : ' no-shot'}`}>
      {shots && (
        <a className="product-art" href={shots.live} target="_blank" rel="noopener" data-reveal="" data-wipe="">
          <span className="browser" data-tilt="">
            <span className="browser-bar" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <img src={shots.shot} alt={pick(product.name, locale)} width={1440} height={900} loading="lazy" />
          </span>
          <span className="phone">
            <img src={shots.phone} alt="" width={390} height={844} loading="lazy" />
          </span>
        </a>
      )}
      <div className="product-copy">
        <h3 data-reveal="">
          {pick(product.name, locale)} {product.is_test && <span className="tag">{t('testProduct', locale)}</span>}
        </h3>
        <p className="lead" data-reveal="" style={stagger(1)}>
          {pick(product.summary, locale)}
        </p>
        {shots && (
          <a className="arrow-link" href={shots.live} target="_blank" rel="noopener" data-reveal="" style={stagger(1)}>
            {t('seeLive', locale)}
          </a>
        )}
        <div className="licenses">
          {product.variants.map((v, i) => (
            <License key={v.sku} v={v} locale={locale} i={i} />
          ))}
        </div>
      </div>
    </article>
  );
}

/** The products on sale, one row each, their pictures on alternating sides. */
export function Products({ products, locale }: { products: Product[]; locale: Locale }) {
  if (products.length === 0) return null;
  return (
    <section className="block" id="products">
      <div className="section-head" data-reveal="">
        <p className="eyebrow">{t('productsEyebrow', locale)}</p>
        <h2>{t('productsTitle', locale)}</h2>
      </div>
      {products.map((product, i) => (
        <ProductRow key={product.slug} product={product} locale={locale} flip={i % 2 === 1} />
      ))}
    </section>
  );
}
