import { expiringConnections } from '../connectors/connections';
import { bounceRate, MAX_BOUNCE_RATE } from '../crm/deliverability';
import { pause } from '../governance/pause';
import { getPolicy } from '../governance/settings';
import { json } from '../lib/db';
import { formatMoney } from '../lib/money';
import type { Localized } from '../lib/types';
import { minimumPrice } from '../finance/pricing';
import type { Json } from './common';
import type { AgentRuntime, WorkflowContext } from './runtime';

/**
 * The daily checks: Commerce looks for prices under the margin floor, Security for manipulation, failing connectors and
 * failing jobs. Both work from the records alone, with no model, and raise an alert the owner sees on Today.
 */

const DAY = 86_400_000;

/**
 * Opens an alert of [kind] unless one was opened in the last day, so a daily check that keeps finding the same thing
 * says it once a day, not on every run.
 */
async function alertOnce(
  rt: AgentRuntime,
  alert: { kind: string; severity: 'info' | 'warning'; summary: string; detail: Json; by: string },
): Promise<boolean> {
  const since = new Date(rt.platform.clock().getTime() - DAY);
  // One check at a time per kind: a manual run and the scheduled one could both find no alert and both open one.
  return rt.db.tx(async (db) => {
    await db.query(`select pg_advisory_xact_lock(hashtext('security_alert:' || $1))`, [alert.kind]);
    const already = await db.query(`select 1 from security_alerts where kind = $1 and created_at > $2`, [
      alert.kind,
      since,
    ]);
    if (already.length) return false;
    await db.query(
      `insert into security_alerts (severity, kind, summary, detail, created_by_kind, created_by_id) values ($1, $2, $3, $4::jsonb, 'agent', $5)`,
      [alert.severity, alert.kind, alert.summary, json(alert.detail), alert.by],
    );
    return true;
  });
}

// ---------------------------------------------------------------- Commerce

// Only what the shop sells is checked: a published product's active variants. A switched-off SKU cannot lose money.

async function catalogCheck(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('commerce.catalog_check', ctx, input, async (run) => {
    const variants = await rt.db.query<{
      sku: string;
      name: Localized;
      price_minor: number;
      currency: string;
      unit_cost_minor: number;
    }>(
      `select v.sku, p.name, v.price_minor, v.currency, v.unit_cost_minor from product_variants v join products p on p.id = v.product_id
       where p.status = 'published' and v.active order by v.sku`,
    );
    const floorBps = await getPolicy(rt.db, 'margin.min_product_bps');
    const feeBps = await getPolicy(rt.db, 'pricing.payment_fee_bps');
    const fixed = await getPolicy(rt.db, 'pricing.payment_fee_fixed_minor');
    const advertisingBps = await getPolicy(rt.db, 'pricing.advertising_bps');
    const refundBps = await getPolicy(rt.db, 'pricing.refund_allowance_bps');
    const checked = variants.map((v) => {
      const floor = minimumPrice(
        {
          unitCostMinor: Number(v.unit_cost_minor),
          fixedFeeMinor: fixed[v.currency] ?? 0,
          feeBps,
          advertisingBps,
          refundBps,
        },
        floorBps,
      );
      return {
        sku: v.sku,
        name: v.name.en,
        price: formatMoney(Number(v.price_minor), v.currency),
        floor: floor === null ? null : formatMoney(floor, v.currency),
        below_floor: floor === null || Number(v.price_minor) < floor,
      };
    });
    const below = checked.filter((v) => v.below_floor);
    // A price under the floor loses money on every sale, so the owner hears of it, with the SKUs and their floors.
    if (below.length)
      await alertOnce(rt, {
        kind: 'price_below_floor',
        severity: 'warning',
        summary: `${below.length} product price${below.length === 1 ? ' is' : 's are'} under the margin floor: ${below
          .slice(0, 5)
          .map((v) => `${v.sku} (${v.price}, floor ${v.floor ?? 'unknown cost'})`)
          .join(', ')}.`,
        detail: { below_floor: below },
        by: 'commerce',
      });
    else run.notes.push('Every published price is above the margin floor.');
    return {
      checked,
      below_floor: below.map((v) => v.sku),
      source: 'product_variants and the policy sheet, calculated by code',
    };
  });
}

// ---------------------------------------------------------------- Security

async function securityReview(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('security.review', ctx, input, async (run) => {
    const now = rt.platform.clock();
    const dayAgo = new Date(now.getTime() - DAY);
    const hourAgo = new Date(now.getTime() - 3_600_000);
    const findings: string[] = [];
    const [{ flagged }] = (await rt.db.query<{ flagged: number }>(
      `select count(*)::int as flagged from messages where flagged and created_at > $1`,
      [dayAgo],
    )) as [{ flagged: number }];
    if (flagged >= 3) {
      findings.push(`${flagged} messages tried to give instructions in the last day.`);
      await alertOnce(rt, {
        kind: 'repeated_manipulation',
        severity: 'warning',
        summary: `${flagged} messages tried to give the bots instructions in one day.`,
        detail: { since: dayAgo },
        by: 'security',
      });
    }
    // A connector that keeps failing is paused, so it cannot fail customers again. Only the owner can end the pause.
    const failing = await rt.db.query<{ connector: string; n: number }>(
      `select connector, count(*)::int as n from actions where status = 'failed' and created_at > $1 group by connector having count(*) >= 5`,
      [hourAgo],
    );
    for (const { connector, n } of failing) {
      await pause(
        rt.db,
        { scope: 'connector', target: connector },
        `Security paused it: ${n} actions failed in the last hour.`,
        { kind: 'agent', id: 'security' },
      );
      findings.push(`Paused the ${connector} connector after ${n} failures in the last hour.`);
    }
    const [{ blocked }] = (await rt.db.query<{ blocked: number }>(
      `select count(*)::int as blocked from actions where status = 'blocked' and created_at > $1`,
      [dayAgo],
    )) as [{ blocked: number }];
    if (blocked) findings.push(`The policy engine blocked ${blocked} proposed actions in the last day.`);
    const [{ critical }] = (await rt.db.query<{ critical: number }>(
      `select count(*)::int as critical from security_alerts where status = 'open' and severity = 'critical'`,
    )) as [{ critical: number }];
    if (critical) findings.push(`${critical} critical alerts are open.`);
    // A background job that used all its tries did not do its work: a lead with no reply, a message not sorted.
    const failedJobs = await rt.db.query<{ kind: string; n: number; last_error: string | null }>(
      `select kind, count(*)::int as n, max(last_error) as last_error from jobs
       where status = 'failed' and finished_at > $1 group by kind order by n desc`,
      [dayAgo],
    );
    if (failedJobs.length) {
      const total = failedJobs.reduce((sum, job) => sum + job.n, 0);
      findings.push(`${total} background job${total === 1 ? '' : 's'} failed in the last day.`);
      await alertOnce(rt, {
        kind: 'jobs_failed',
        severity: 'warning',
        summary: `${total} background job${total === 1 ? '' : 's'} gave up in the last day: ${failedJobs
          .map((job) => `${job.kind} (${job.n})`)
          .join(', ')}. See Team for what each one was doing.`,
        detail: { jobs: failedJobs },
        by: 'security',
      });
    }
    findings.push(...(await mailboxHealth(rt, now)));
    if (!findings.length) run.notes.push('Nothing unusual in the last day.');
    return { findings };
  });
}

/** Too many bounces, and keys about to stop working: each said once a day, a week before it matters. */
async function mailboxHealth(rt: AgentRuntime, now: Date): Promise<string[]> {
  const findings: string[] = [];
  const bounces = await bounceRate(rt.db, now);
  if (bounces.rate > MAX_BOUNCE_RATE) {
    const share = Math.round(bounces.rate * 100);
    findings.push(`${share}% of the addresses written to in two weeks bounced; the daily limit is halved.`);
    await alertOnce(rt, {
      kind: 'bounces_high',
      severity: 'warning',
      summary: `${bounces.bounced} of ${bounces.contacted} addresses Sales wrote to in two weeks bounced (${share}%). The daily limit is halved until it falls under 5%. Check where the prospect list came from.`,
      detail: bounces,
      by: 'security',
    });
  }
  for (const key of await expiringConnections(rt.db, now, 7)) {
    findings.push(`The ${key.id} key expires on ${key.expires_on}.`);
    await alertOnce(rt, {
      kind: `key_expiring:${key.id}`,
      severity: 'warning',
      summary: `The ${key.id} key expires on ${key.expires_on}. Make a new one and paste it in Systems, Connections, with its new date.`,
      detail: key,
      by: 'security',
    });
  }
  return findings;
}

export function registerCheckWorkflows(rt: AgentRuntime): void {
  rt.register('commerce.catalog_check', catalogCheck);
  rt.register('security.review', securityReview);
}
