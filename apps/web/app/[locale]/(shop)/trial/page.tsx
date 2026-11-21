import { redirect } from 'next/navigation';
import { call } from '@/lib/platform';
import { trialDays, withDays } from '@/lib/trial';
import { isLocale, type Locale, t, type TextKey } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { Celebrate } from '@/app/_components/motion';
import { Done } from '@/app/_components/text';

/**
 * The free trial page for shops: a shop owner leaves their details, Sales answers with the link to book the setup
 * call, and marking the lead "Won" in the owner app starts the shop's plan after the free days.
 */

const KINDS: TextKey[] = ['kindShop', 'kindCafe', 'kindBoutique', 'kindOther'];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, '/trial', withDays(t('trialTitle', locale), await trialDays()), t('trialIntro', locale));
}

async function send(formData: FormData): Promise<void> {
  'use server';
  // Only a known locale goes into the redirect, so a changed form field cannot send the visitor to another site.
  const raw = String(formData.get('locale'));
  const locale: Locale = isLocale(raw) ? raw : 'en';
  const text = (name: string): string => String(formData.get(name) ?? '').trim();
  const kind = KINDS.find((key) => key === text('kind')) ?? 'kindOther';
  // The team reads the request in English, whatever language the page was in.
  const message = [
    `Free trial request. Business: ${t(kind, 'en')}.`,
    text('city') && `City: ${text('city')}.`,
    text('notes'),
  ]
    .filter(Boolean)
    .join('\n');
  const result = await call('POST', '/api/public/leads', {
    name: text('name'),
    email: text('email'),
    phone: text('phone') || undefined,
    company: text('shop'),
    message,
    projectType: 'shop-trial',
    source: 'trial',
    locale,
    website: text('website'),
  });
  redirect(`/${locale}/trial?${result.ok ? 'sent=1' : `error=${encodeURIComponent(result.error ?? '')}`}`);
}

export default async function Trial({
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
        <Done>{t('trialThanks', locale)}</Done>
        <Celebrate kind="burst" />
      </>
    );
  const days = await trialDays();
  return (
    <>
      <div className="split">
        <div className="split-copy">
          <p className="eyebrow enter">{t('trialEyebrow', locale)}</p>
          <h1 className="enter">{withDays(t('trialTitle', locale), days)}</h1>
          <p className="lead enter">{t('trialIntro', locale)}</p>
          <ol className="mini-steps enter" style={{ animationDelay: '60ms' }}>
            <li>{t('trialStep1', locale)}</li>
            <li>{t('trialStep2', locale)}</li>
            <li>{withDays(t('trialStep3', locale), days)}</li>
          </ol>
          <img
            className="split-shot enter"
            style={{ animationDelay: '160ms' }}
            src="/shots/retail-till.webp"
            alt={t('trialShot', locale)}
            width={1440}
            height={900}
          />
        </div>
        <div className="panel enter" style={{ animationDelay: '120ms' }}>
          {query.error && (
            <p className="error" role="alert">
              {query.error}
            </p>
          )}
          <TrialForm locale={locale} />
        </div>
      </div>
    </>
  );
}

function TrialForm({ locale }: { locale: Locale }) {
  return (
    <form action={send}>
      <input type="hidden" name="locale" value={locale} />
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
        {t('shopName', locale)}
        <input name="shop" required maxLength={160} />
      </label>
      <label>
        {t('businessKind', locale)}
        <select name="kind" defaultValue="kindShop">
          {KINDS.map((key) => (
            <option key={key} value={key}>
              {t(key, locale)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('city', locale)}
        <input name="city" maxLength={60} />
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
        {t('trialNotes', locale)}
        <textarea name="notes" rows={4} maxLength={2000} />
      </label>
      <button type="submit">{t('trialSend', locale)}</button>
    </form>
  );
}
