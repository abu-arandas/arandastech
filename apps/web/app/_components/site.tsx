import { type Locale, t } from '@/lib/i18n';

/** The Zirr mark: a shirt button whose four holes are app tiles, with the top-right hole lit in thread orange. */
function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <circle className="mark-disc" cx="60" cy="60" r="52" />
      <circle className="mark-ring" cx="60" cy="60" r="43" />
      <rect className="mark-hole" x="38" y="38" width="19" height="19" rx="6" />
      <rect className="mark-lit" x="63" y="38" width="19" height="19" rx="6" />
      <rect className="mark-hole" x="38" y="63" width="19" height="19" rx="6" />
      <rect className="mark-hole" x="63" y="63" width="19" height="19" rx="6" />
    </svg>
  );
}

function Links({ locale }: { locale: Locale }) {
  return (
    <>
      <a href={`/${locale}#products`}>{t('navProducts', locale)}</a>
      <a href={`/${locale}#agencies`}>{t('agenciesEyebrow', locale)}</a>
      <a href={`/${locale}/trial`}>{t('trial', locale)}</a>
      <a href={`/${locale}/guides`}>{t('guides', locale)}</a>
      <a href={`/${locale}/order`}>{t('orderStatus', locale)}</a>
    </>
  );
}

/**
 * The header: the mark and wordmark, the links, the other language and the one main action. On a phone the links fold
 * into a menu that opens without any script (a details element).
 */
export function SiteHeader({ locale }: { locale: Locale }) {
  const other = locale === 'en' ? 'ar' : 'en';
  return (
    <header className="site">
      <div className="wrap">
        <a className="brand" href={`/${locale}`}>
          <Mark />
          {t('wordmark', locale)}
        </a>
        <nav className="links" aria-label={t('menu', locale)}>
          <Links locale={locale} />
        </nav>
        <a className="lang" href={`/${other}`} lang={other}>
          {t('otherLanguage', locale)}
        </a>
        <a className="button small" href={`/${locale}/contact`} data-magnetic="">
          {t('ctaProject', locale)}
        </a>
        <details className="menu">
          <summary aria-label={t('menu', locale)}>
            <span />
            <span />
          </summary>
          <nav aria-label={t('menu', locale)}>
            <Links locale={locale} />
            <a href={`/${locale}/contact`}>{t('contact', locale)}</a>
          </nav>
        </details>
      </div>
    </header>
  );
}

/** The footer: ink, with the wordmark large, three short columns and the smile line. */
export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="site">
      <div className="wrap">
        <div className="footer-brand">
          <a className="brand" href={`/${locale}`}>
            <Mark size={36} />
            {t('wordmark', locale)}
          </a>
          <p>{t('footerAbout', locale)}</p>
        </div>
        <nav aria-label={t('navProducts', locale)}>
          <h2>{t('navProducts', locale)}</h2>
          <a href={`/${locale}#products`}>{t('products', locale)}</a>
          <a href={`/${locale}/trial`}>{t('trial', locale)}</a>
          <a href={`/${locale}/guides`}>{t('guides', locale)}</a>
        </nav>
        <nav aria-label={t('footerStudio', locale)}>
          <h2>{t('footerStudio', locale)}</h2>
          <a href={`/${locale}#agencies`}>{t('agenciesEyebrow', locale)}</a>
          <a href={`/${locale}/contact`}>{t('contact', locale)}</a>
          <a href={`/${locale}/order`}>{t('orderStatus', locale)}</a>
        </nav>
        <nav aria-label={t('footerLegal', locale)}>
          <h2>{t('footerLegal', locale)}</h2>
          <a href={`/${locale}/privacy`}>{t('privacy', locale)}</a>
          <a href={`/${locale}/terms`}>{t('terms', locale)}</a>
        </nav>
        <div className="footer-base">
          <span>
            © {new Date().getFullYear()} {t('brand', locale)}
          </span>
          <span>{t('smile', locale)}</span>
        </div>
      </div>
    </footer>
  );
}
