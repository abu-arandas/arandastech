import { z } from 'zod';
import { getCommand, listCommands, planCommand, startCommand } from '../agents/command';
import { listJobs } from '../agents/jobs';
import type { Platform } from '../platform';
import { check, staffOf } from './guards';
import type { Router } from './http';

/** Work the owner may start by hand. Anything that leaves the company still goes through the gateway. */
const RUNNABLE = [
  'operations.daily_briefing',
  'security.review',
  'finance.money_status',
  'commerce.catalog_check',
  'sales.qualify_leads',
  'sales.reply_new_leads',
  'sales.sequences',
  'support.triage_inbox',
] as const;

/** The departments (blueprint 7) and the command center (8.3). */
export function registerAgentRoutes(router: Router, platform: Platform): void {
  const { db, clock } = platform;

  router.add('GET', '/api/owner/agents', 'staff', async ({ caller }) => {
    staffOf(caller);
    const since = new Date(clock().getTime() - 86_400_000);
    const departments = await db.query(
      `select a.id, a.name, a.mission, a.enabled,
              count(r.id) filter (where r.started_at > $1)::int as runs_today,
              count(r.id) filter (where r.started_at > $1 and r.status = 'failed')::int as failed_today,
              coalesce(sum(r.cost_micros) filter (where r.started_at > $1), 0)::int as cost_today_micros,
              max(r.started_at) as last_run_at
       from agents a left join agent_runs r on r.agent_id = a.id and r.workflow <> 'read_outside_content'
       group by a.id order by array_position(array['operations','sales','support','marketing','engineering','commerce','finance','security'], a.id)`,
      [since],
    );
    const jobs = (
      await db.query<{ queued: number; failed: number }>(
        `select count(*) filter (where status in ('queued', 'running'))::int as queued, count(*) filter (where status = 'failed')::int as failed from jobs`,
      )
    )[0];
    const briefing = (
      await db.query(
        `select id, started_at, model, output from agent_runs where workflow = 'operations.daily_briefing' and status = 'succeeded' order by started_at desc limit 1`,
      )
    )[0];
    return { mode: await platform.agents.mode(), departments, jobs, briefing: briefing ?? null };
  });

  router.add('GET', '/api/owner/agents/runs', 'staff', async ({ caller, request }) => {
    staffOf(caller);
    return {
      runs: await db.query(
        `select id, agent_id, workflow, trigger_kind, task_id, status, untrusted_input, output, error, model, input_tokens, output_tokens, cost_micros, started_at, finished_at
         from agent_runs where workflow <> 'read_outside_content' and ($1::text is null or agent_id = $1) order by started_at desc limit 100`,
        [request.query.department ?? null],
      ),
    };
  });

  router.add('GET', '/api/owner/agents/jobs', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { jobs: await listJobs(db) };
  });

  router.add('POST', '/api/owner/agents/run', 'owner', async ({ caller, json }) => {
    staffOf(caller);
    const body = check(z.strictObject({ workflow: z.enum(RUNNABLE).optional() }), json);
    if (!body.workflow) return { ran: await platform.agents.runDue({ budgetMs: 25_000 }) };
    return {
      workflow: body.workflow,
      result: await platform.agents.runWorkflow(body.workflow, {}, { trigger: 'manual' }),
    };
  });

  router.add('GET', '/api/owner/commands', 'staff', async ({ caller }) => {
    staffOf(caller);
    return { commands: await listCommands(db) };
  });

  router.add('POST', '/api/owner/commands', 'owner', async ({ caller, json }) => {
    const staff = staffOf(caller);
    const body = check(z.strictObject({ instruction: z.string().min(3).max(2000) }), json);
    return { command: await planCommand(platform.agents, body.instruction, staff.actor) };
  });

  router.add('GET', '/api/owner/commands/:id', 'staff', async ({ caller, params }) => {
    staffOf(caller);
    return { command: await getCommand(db, check(z.uuid(), params.id)) };
  });

  router.add('POST', '/api/owner/commands/:id/start', 'owner', async ({ caller, params }) => {
    const staff = staffOf(caller);
    await startCommand(platform.agents, check(z.uuid(), params.id), staff.actor);
    return { command: await getCommand(db, params.id!) };
  });
}
