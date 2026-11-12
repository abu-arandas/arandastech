import { type Db, json, maybeOne, one } from './lib/db';
import { forbidden, invalid, notFound } from './lib/errors';
import type { Actor, Locale } from './lib/types';
import { audit } from './governance/audit';

export type MemoryKind = 'brand' | 'product' | 'package' | 'pricing' | 'faq' | 'sop' | 'template' | 'style' | 'technical' | 'supplier' | 'policy' | 'decision';

export interface MemoryItem {
  id: string;
  key: string;
  kind: MemoryKind;
  title: string;
  body: unknown;
  source: string;
  owner: string;
  status: 'draft' | 'approved' | 'retired';
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  version: number;
  review_at: string | null;
  deletion_method: string;
}

/** Saves a memory item as a draft. Agents propose and people approve: nothing becomes approved here (blueprint 8.5). */
export async function proposeMemory(
  db: Db,
  item: { key: string; kind: MemoryKind; title: string; body: unknown; source: string; owner: string; sensitivity?: MemoryItem['sensitivity'] },
  by: Actor,
): Promise<MemoryItem> {
  if (!/^[a-z0-9][a-z0-9:._-]{1,80}$/.test(item.key)) throw invalid('a memory key uses lowercase letters, digits and : . _ -');
  const saved = one(
    await db.query<MemoryItem>(
      `insert into memory_items (key, kind, title, body, source, owner, sensitivity) values ($1, $2, $3, $4::jsonb, $5, $6, $7)
       on conflict (key) do update set title = excluded.title, body = excluded.body, source = excluded.source,
         status = 'draft', version = memory_items.version + 1
       returning *`,
      [item.key, item.kind, item.title, json(item.body), item.source, item.owner, item.sensitivity ?? 'internal'],
    ),
  );
  await audit(db, { actor: by, type: 'memory.proposed', subject: { type: 'memory_item', id: item.key }, data: { version: saved.version } });
  return saved;
}

export async function approveMemory(db: Db, key: string, by: Actor, isOwner: boolean): Promise<MemoryItem> {
  if (!isOwner || by.kind !== 'person') throw forbidden('Only the owner can approve a memory item.');
  const rows = await db.query<MemoryItem>(`update memory_items set status = 'approved' where key = $1 returning *`, [key]);
  if (!rows[0]) throw notFound('memory item');
  await audit(db, { actor: by, type: 'memory.approved', subject: { type: 'memory_item', id: key }, data: { version: rows[0].version } });
  return rows[0];
}

/** Only approved items may be used in anything a customer reads. */
export async function approvedMemory(db: Db, key: string): Promise<MemoryItem | null> {
  return maybeOne(await db.query<MemoryItem>(`select * from memory_items where key = $1 and status = 'approved'`, [key]));
}

/** Approved items an agent may read. Restricted items never leave the database through this function. */
export async function listApprovedMemory(db: Db, kind?: MemoryKind): Promise<MemoryItem[]> {
  return db.query<MemoryItem>(
    `select * from memory_items where status = 'approved' and sensitivity <> 'restricted' and ($1::text is null or kind = $1) order by kind, key`,
    [kind ?? null],
  );
}

/**
 * Fills an approved message template in the reader's language. Throws when the template is missing or not approved,
 * so that an unapproved text can never reach a customer by accident.
 */
export async function renderTemplate(db: Db, key: string, locale: Locale, values: Record<string, string>): Promise<{ subject: string; body: string }> {
  const item = await approvedMemory(db, `template:${key}`);
  if (!item || item.kind !== 'template') throw notFound(`approved template ${key}`);
  const texts = item.body as Record<string, { subject: string; body: string } | undefined>;
  const text = texts[locale] ?? texts.en;
  if (!text) throw invalid(`template ${key} has no text`);
  const fill = (source: string): string =>
    source.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
      const value = values[name];
      if (value === undefined) throw invalid(`template ${key} needs a value for ${name}`);
      return value;
    });
  return { subject: fill(text.subject), body: fill(text.body) };
}
