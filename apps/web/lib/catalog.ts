/** The shapes the public catalogue and service packages come back in, from /api/public/catalog and /packages. */
type L = { en: string; ar: string };

export interface Pkg {
  id: string;
  name: L;
  outcome: L;
  deliverables: L[];
}

export interface Variant {
  sku: string;
  name: L;
  summary: L;
  includes: L[];
  price_minor: number;
  currency: string;
}

export interface Product {
  slug: string;
  name: L;
  summary: L;
  is_test: boolean;
  variants: Variant[];
}

/** The cheapest variant on sale, for "From 39.00 USD". Undefined when nothing is on sale. */
export function cheapest(products: Product[]): Variant | undefined {
  return products
    .filter((product) => !product.is_test)
    .flatMap((product) => product.variants)
    .reduce<Variant | undefined>((low, v) => (!low || v.price_minor < low.price_minor ? v : low), undefined);
}
