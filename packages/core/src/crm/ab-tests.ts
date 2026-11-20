import { audit } from '../governance/audit';
import { type Db, maybeOne } from '../lib/db';
import type { Actor } from '../lib/types';

/**
 * A/B tests of the sales emails. A template can have a version B, named with ".b" after its key (prospect-intro.b).
 * While the owner has approved both and no winner is kept, Sales sends them in turn. A reply counts for the last email
 * the lead was sent before replying. Once each version has gone to MIN_SENDS people, the one with more replies (version
 * A on a tie) is kept in template_tests and every later email uses it. Nothing here writes or sends an email.
 */

const SALES: Actor = { kind: 'agent', id: 'sales' };
export const MIN_SENDS = 40;
const VERSION_B = '.b';

const versionB = (template: string): string => `${template}${VERSION_B}`;

async function approved(db: Db, template: string): Promise<boolean> {
  const rows = await db.query(`select 1 from memory_items where key = $1 and status = 'approved'`, [
    `template:${template}`,
  ]);
  return rows.length > 0;
}

async function winnerOf(db: Db, template: string): Promise<string | null> {
  const row = maybeOne(
    await db.query<{ winner: string }>('select winner from template_tests where template = $1', [template]),
  );
  return row?.winner ?? null;
}

/** The emails proposed with this template that were not turned down: what "in turn" counts. */
async function proposedCount(db: Db, template: string): Promise<number> {
  const [row] = await db.query<{ n: number }>(
    `select count(*)::int as n from actions where action_type = 'gmail.send_email' and payload ->> 'template' = $1
       and status not in ('rejected', 'blocked', 'failed', 'expired')`,
    [template],
  );
  return row?.n ?? 0;
}

/** The template a sequence step sends today: the kept winner, else the version with fewer emails so far (A first). */
export async function chooseTemplate(db: Db, template: string): Promise<string> {
  const winner = await winnerOf(db, template);
  if (winner) return winner;
  const b = versionB(template);
  if (!(await approved(db, b))) return template;
  return (await proposedCount(db, b)) < (await proposedCount(db, template)) ? b : template;
}

export interface TestResult {
  template: string;
  a: { sends: number; replies: number };
  b: { sends: number; replies: number };
  winner: string | null;
}

/**
 * Sends and replies for one version. A send counts once it went out; it earns a reply when the lead replied after it
 * and before any later sales email reached them.
 */
async function score(db: Db, template: string): Promise<{ sends: number; replies: number }> {
  const [row] = await db.query<{ sends: number; replies: number }>(
    `select count(*)::int as sends,
            count(*) filter (where l.replied_at > a.executed_at and not exists (
              select 1 from actions later where later.action_type = 'gmail.send_email' and later.status = 'executed'
                and later.payload ->> 'lead_id' = a.payload ->> 'lead_id'
                and later.executed_at > a.executed_at and later.executed_at < l.replied_at))::int as replies
     from actions a left join leads l on l.id::text = a.payload ->> 'lead_id'
     where a.action_type = 'gmail.send_email' and a.status = 'executed' and a.payload ->> 'template' = $1`,
    [template],
  );
  return row ?? { sends: 0, replies: 0 };
}

/** Every test with a version B the owner approved, decided or not. */
export async function testResults(db: Db): Promise<TestResult[]> {
  const rows = await db.query<{ key: string }>(
    `select key from memory_items where key like $1 and status = 'approved' order by key`,
    [`template:%${VERSION_B}`],
  );
  const results: TestResult[] = [];
  for (const { key } of rows) {
    const template = key.slice('template:'.length, -VERSION_B.length);
    results.push({
      template,
      a: await score(db, template),
      b: await score(db, versionB(template)),
      winner: await winnerOf(db, template),
    });
  }
  return results;
}

const rate = (s: { sends: number; replies: number }): number => (s.sends ? s.replies / s.sends : 0);

/** Keeps the winner of each test whose versions have both gone to MIN_SENDS people. Returns the tests it decided. */
export async function decideTests(db: Db, now: Date): Promise<TestResult[]> {
  const decided: TestResult[] = [];
  for (const test of await testResults(db)) {
    if (test.winner || test.a.sends < MIN_SENDS || test.b.sends < MIN_SENDS) continue;
    const winner = rate(test.b) > rate(test.a) ? versionB(test.template) : test.template;
    const saved = await db.query(
      `insert into template_tests (template, winner, a_sends, a_replies, b_sends, b_replies, decided_at)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (template) do nothing returning template`,
      [test.template, winner, test.a.sends, test.a.replies, test.b.sends, test.b.replies, now],
    );
    if (!saved.length) continue;
    await audit(db, {
      actor: SALES,
      type: 'sales.ab_test_decided',
      subject: { type: 'memory', id: `template:${test.template}` },
      data: { winner, a: test.a, b: test.b },
    });
    decided.push({ ...test, winner });
  }
  return decided;
}

/** One line per test for the briefing, in English or Arabic: replies out of emails sent for each version. */
export function testLine(test: TestResult, locale: 'en' | 'ar'): string {
  const counts = `A ${test.a.replies}/${test.a.sends}, B ${test.b.replies}/${test.b.sends}`;
  if (test.winner) {
    const which = test.winner.endsWith(VERSION_B) ? 'B' : 'A';
    return locale === 'ar'
      ? `- اختبار ${test.template}: فازت النسخة ${which} (الردود: ${counts}).`
      : `- Test ${test.template}: version ${which} won (replies: ${counts}).`;
  }
  return locale === 'ar'
    ? `- اختبار ${test.template} جارٍ (الردود: ${counts})، ويُحسم عند ${MIN_SENDS} رسالة لكل نسخة.`
    : `- Test ${test.template} running (replies: ${counts}); decided at ${MIN_SENDS} emails each.`;
}
