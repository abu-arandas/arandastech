export type ActorKind = 'person' | 'agent' | 'automation' | 'system';

/** Who or what did something: a person, an agent run, an automation or the system itself. */
export interface Actor {
  kind: ActorKind;
  id: string | null;
}

export const SYSTEM: Actor = { kind: 'system', id: null };

export type Locale = 'en' | 'ar';
export type Level = 0 | 1 | 2 | 3;

/** Text kept in both languages the company works in. */
export interface Localized {
  en: string;
  ar: string;
}

export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

export function pick(text: Localized, locale: Locale): string {
  return text[locale] || text.en;
}
