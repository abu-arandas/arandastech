import { redirect } from 'next/navigation';
import { call } from '@/lib/platform';
import { isLocale, type Locale, t, type TextKey } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { Celebrate } from '@/app/_components/motion';
import { Done } from '@/app/_components/text';

/** What happens after the form: the same three steps the home page shows agencies. */
const NEXT: [TextKey, TextKey][] = [
  ['step1Title', 'step1Body'],
  ['step2Title', 'step2Body'],
  ['step3Title', 'step3Body'],
];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, '/contact', t('contact', locale), t('intro', locale));
}

async function send(formData: FormData): Promise<void> {
  'use server';
  // Only a known locale goes into the redirect, so a changed form field cannot send the visitor to another site.
  const raw = String(formData.get('locale'));
  const locale: Locale = isLocale(raw) ? raw : 'en';
  const text = (name: string): string => String(formData.get(name) ?? '').trim();
  const result = await call('POST', '/api/public/leads', {
    name: text('name'),
    email: text('email'),
    phone: text('phone') || undefined,
    message: text('message'),
    packageId: text('package') || undefined,
    locale,
    website: text('website'),
  });
  redirect(`/${locale}/contact?${result.ok ? 'sent=1' : `error=${encodeURIComponent(result.error ?? '')}`}`);
}

export default async function Contact({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const locale = (await params).locale as Locale;
  const query = await searchParams;
  if (query.sent)
    return (
      <>
        <Done>{t('leadThanks', locale)}</Done>
        <Celebrate kind="burst" />
      </>
    );
  return (
    <>
      <div className="split">
        <div className="split-copy">
          <p className="eyebrow enter">{t('contactEyebrow', locale)}</p>
          <h1 className="enter">{t('contactTitle', locale)}</h1>
          <p className="lead enter">{t('contactLead', locale)}</p>
          <h2 className="small-head enter">{t('contactNext', locale)}</h2>
          <ol className="mini-steps enter" style={{ animationDelay: '80ms' }}>
            {NEXT.map(([title, body]) => (
              <li key={title}>
                <strong>{t(title, locale)}</strong> {t(body, locale)}
              </li>
            ))}
          </ol>
        </div>
        <div className="panel enter" style={{ animationDelay: '120ms' }}>
          {query.error && (
            <p className="error" role="alert">
              {query.error}
            </p>
          )}
          <ContactForm locale={locale} pkg={query.package} />
        </div>
      </div>
    </>
  );
}

function ContactForm({ locale, pkg }: { locale: Locale; pkg?: string }) {
  return (
    <form action={send}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="package" value={pkg ?? ''} />
      {/* People never see this field. Only a script fills it in. */}
      <label className="hp" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <label>
        {t('name', locale)}
        <input name="name" required maxLength={120} />
      </label>
      <label>
        {t('email', locale)}
        <input name="email" type="email" required maxLength={200} dir="ltr" />
      </label>
      <label>
        {t('phone', locale)}
        <input name="phone" maxLength={40} dir="ltr" />
      </label>
      <label>
        {t('message', locale)}
        <textarea name="message" required rows={6} maxLength={5000} />
      </label>
      <button type="submit">{t('send', locale)}</button>
    </form>
  );
}
