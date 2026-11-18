import type { Db } from '../lib/db';
import { moneySummary } from './ledger';

/**
 * The numbers of blueprint 18, over the last 30 days. Each one comes straight from the records, and each says when it
 * was counted, so the owner can see how fresh it is.
 */
export interface Metrics {
  as_of: string;
  days: number;
  services: { leads: number; qualified_leads: number; won: number; win_rate_bps: number | null };
  commerce: {
    paid_orders: number;
    average_order_minor: Record<string, number>;
    refunded_orders: number;
    refund_rate_bps: number | null;
    disputed_orders: number;
  };
  finance: Array<{ currency: string; settled_revenue: number; confirmed_net_profit: number; status: string }>;
  platform: {
    approvals_decided: number;
    median_hours_to_approve: number | null;
    actions_executed: number;
    actions_under_rules: number;
    rules_share_bps: number | null;
    actions_failed: number;
    ai_cost_micros: number;
    tasks_done: number;
    ai_cost_per_task_micros: number | null;
  };
}

const QUALIFIED = ['qualified', 'proposal_sent', 'won', 'in_delivery', 'delivered', 'paid', 'retained'];
const WON = ['won', 'in_delivery', 'delivered', 'paid', 'retained'];
const PAID = ['paid', 'fulfilling', 'shipped', 'delivered', 'completed', 'return_requested', 'refunded'];
const share = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 10_000) : null);

export async function metrics(db: Db, now: Date, days = 30): Promise<Metrics> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const [leads] = await db.query<{ total: number; qualified: number; won: number }>(
    `select count(*)::int as total,
            count(*) filter (where stage = any($2))::int as qualified,
            count(*) filter (where stage = any($3))::int as won
     from leads where created_at > $1`,
    [since, QUALIFIED, WON],
  );
  const orders = await db.query<{ currency: string; paid: number; total: string; refunded: number; disputed: number }>(
    `select currency, count(*)::int as paid, coalesce(sum(total_minor), 0)::text as total,
            count(*) filter (where status = 'refunded')::int as refunded,
            count(*) filter (where disputed)::int as disputed
     from orders where paid_at > $1 and status = any($2) group by currency order by currency`,
    [since, PAID],
  );
  const paid = orders.reduce((sum, row) => sum + row.paid, 0);
  const refunded = orders.reduce((sum, row) => sum + row.refunded, 0);

  const currencies = [...new Set(['USD', 'JOD', ...orders.map((row) => row.currency)])];
  const finance = await Promise.all(
    currencies.map(async (currency) => {
      const summary = await moneySummary(db, currency, now);
      return {
        currency,
        settled_revenue: summary.engines.commerce.settled_revenue + summary.engines.services.settled_revenue,
        confirmed_net_profit: summary.waterfall.confirmed_net_profit,
        status: summary.status,
      };
    }),
  );

  const [approvals] = await db.query<{ decided: number; median_hours: number | null }>(
    `select count(*)::int as decided,
            (percentile_cont(0.5) within group (order by extract(epoch from (d.decided_at - r.created_at)) / 3600))::float as median_hours
     from approval_decisions d join approval_requests r on r.id = d.request_id
     where d.decided_at > $1 and d.decision in ('approve', 'reject')`,
    [since],
  );
  const [actions] = await db.query<{ executed: number; ruled: number; failed: number }>(
    `select count(*) filter (where status = 'executed')::int as executed,
            count(*) filter (where status = 'executed' and standing_rule_id is not null)::int as ruled,
            count(*) filter (where status = 'failed')::int as failed
     from actions where created_at > $1`,
    [since],
  );
  const [ai] = await db.query<{ cost: string; tasks: number }>(
    `select (select coalesce(sum(cost_micros), 0) from agent_runs where started_at > $1)::text as cost,
            (select count(*) from tasks where status = 'done' and created_at > $1)::int as tasks`,
    [since],
  );
  const cost = Number(ai?.cost ?? 0);
  const tasks = ai?.tasks ?? 0;

  return {
    as_of: now.toISOString(),
    days,
    services: {
      leads: leads?.total ?? 0,
      qualified_leads: leads?.qualified ?? 0,
      won: leads?.won ?? 0,
      win_rate_bps: share(leads?.won ?? 0, leads?.qualified ?? 0),
    },
    commerce: {
      paid_orders: paid,
      average_order_minor: Object.fromEntries(
        orders.map((row) => [row.currency, Math.round(Number(row.total) / row.paid)]),
      ),
      refunded_orders: refunded,
      refund_rate_bps: share(refunded, paid),
      disputed_orders: orders.reduce((sum, row) => sum + row.disputed, 0),
    },
    finance,
    platform: {
      approvals_decided: approvals?.decided ?? 0,
      median_hours_to_approve:
        approvals?.median_hours === null || approvals?.median_hours === undefined
          ? null
          : Math.round(approvals.median_hours * 10) / 10,
      actions_executed: actions?.executed ?? 0,
      actions_under_rules: actions?.ruled ?? 0,
      rules_share_bps: share(actions?.ruled ?? 0, actions?.executed ?? 0),
      actions_failed: actions?.failed ?? 0,
      ai_cost_micros: cost,
      tasks_done: tasks,
      ai_cost_per_task_micros: tasks > 0 ? Math.round(cost / tasks) : null,
    },
  };
}
