import type { Locale } from '@/lib/i18n';
import { PRIVACY } from '@/lib/legal';
import { Legal } from '@/app/_components/legal';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <Legal page={PRIVACY} locale={(await params).locale as Locale} />;
}
