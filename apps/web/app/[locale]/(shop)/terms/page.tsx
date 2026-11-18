import type { Locale } from '@/lib/i18n';
import { TERMS } from '@/lib/legal';
import { Legal } from '@/app/_components/legal';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <Legal page={TERMS} locale={(await params).locale as Locale} />;
}
