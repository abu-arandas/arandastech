import { z } from 'zod';
import { audit } from '../governance/audit';
import { getPolicy } from '../governance/settings';
import { type Db, json, maybeOne, one } from '../lib/db';
import { notFound, invalid } from '../lib/errors';
import type { Actor } from '../lib/types';
import { enqueue } from './jobs';
import type { AgentRuntime, WorkflowContext } from './runtime';
import { DEPARTMENT_IDS } from './workflows';

/**
 * The command center (blueprint 8.3). The owner types an instruction; Operations turns it into a plan that shows every
 * task, the connector it uses, its level and whether it needs approval, before anything happens. Only when the owner
 * says go do the tasks run, each as its own job, and the report shows what was done, what waits and what failed.
 * An instruction can never raise a permission: each task runs as its department, through the gateway.
 */

/** The work the command center can hand out without a model, and what each one touches. */
const TASK_KINDS = {
  'marketing.draft_posts': {
    department: 'marketing',
    connector: 'Buffer, drafts only',
    level: 1,
    approval: 'None to draft. Each post needs approval to publish.',
  },
  'sales.qualify_leads': { department: 'sales', connector: 'CRM', level: 0, approval: 'None' },
  'sales.reply_new_leads': {
    department: 'sales',
    connector: 'Gmail',
    level: 2,
    approval: 'Every reply waits in the approval inbox.',
  },
  'support.triage_inbox': {
    department: 'support',
    connector: 'Gmail, WhatsApp',
    level: 2,
    approval: 'Every answer waits in the approval inbox.',
  },
  'engineering.create_issue': {
    department: 'engineering',
    connector: 'GitHub',
    // Level 2 in a public repository, which is the default (engineering.repository_public).
    level: 2,
    approval: 'Waits for approval when the repository is public.',
  },
  'finance.money_status': { department: 'finance', connector: 'Ledger', level: 0, approval: 'None' },
  'commerce.catalog_check': { department: 'commerce', connector: 'Catalog', level: 0, approval: 'None' },
  'operations.daily_briefing': { department: 'operations', connector: 'None', level: 0, approval: 'None' },
  'security.review': {
    department: 'security',
    connector: 'None',
    level: 0,
    approval: 'None. It may pause a failing connector; only you can end a pause.',
  },
} as const;
type Kind = keyof typeof TASK_KINDS;
const KINDS = Object.keys(TASK_KINDS) as Kind[];

interface PlannedTask {
  kind: Kind | 'open';
  department: string;
  title: string;
  params: Record<string, unknown>;
  connector: string;
  level: number | null;
  approval: string;
  needs_model: boolean;
}

export interface Plan {
  objective: string;
  tasks: PlannedTask[];
  warnings: string[];
  questions: string[];
  planned_by: 'ai' | 'rules';
  /** The most the run may cost in AI, in millionths of a US dollar: the run ceiling times the tasks that use the model. */
  expected_cost_micros: number;
  data_sources: string[];
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  واحد: 1,
  اثنين: 2,
  ثلاث: 3,
  ثلاثة: 3,
  أربع: 4,
  أربعة: 4,
  خمس: 5,
  خمسة: 5,
  ست: 6,
  ستة: 6,
  سبع: 7,
  سبعة: 7,
};

/** The number written just before a word, as in "five posts", "3 qualified leads" or "خمسة منشورات", if there is one. */
function countBefore(text: string, word: RegExp): number | null {
  const at = new RegExp(word.source, 'iu').exec(text);
  if (!at) return null;
  const before = text
    .slice(0, at.index)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(-2)
    .reverse();
  for (const raw of before) {
    const lower = raw.toLowerCase();
    const n = /^\d+$/.test(lower) ? Number(lower) : NUMBER_WORDS[lower];
    if (n && n > 0) return Math.min(n, 20);
  }
  return null;
}

const RULES: Array<{ kind: Kind; pattern: RegExp; title: string; params: (text: string) => Record<string, unknown> }> =
  [
    {
      kind: 'marketing.draft_posts',
      pattern: /\bposts?\b|منشور|بوست/i,
      title: 'Draft social media posts',
      params: (text) => ({ count: countBefore(text, /posts?|منشورات|منشور|بوستات/) ?? 3 }),
    },
    {
      kind: 'sales.qualify_leads',
      pattern:
        /qualif|\bscor(e|ing)\b.*\bleads?\b|\brank\b.*\bleads?\b|\bleads?\b.*\b(identify|find|best|top)|\b(identify|find|best|top)\b.*\bleads?\b|عملاء محتمل|مؤهل/i,
      title: 'Identify qualified leads',
      params: (text) => ({ count: countBefore(text, /qualified|leads?|عملاء/) ?? 3 }),
    },
    {
      kind: 'sales.reply_new_leads',
      pattern: /\b(reply|answer|respond)\b.*\bleads?\b|\bleads?\b.*\b(reply|answer|respond)\b|رد.*عملاء|الرد على/i,
      title: 'Reply to new leads',
      params: () => ({}),
    },
    {
      kind: 'support.triage_inbox',
      pattern: /\binbox\b|\bmessages?\b|\bemails?\b|\bsupport\b|الرسائل|البريد|الدعم/i,
      title: 'Sort the inbox and draft answers',
      params: () => ({}),
    },
    {
      kind: 'engineering.create_issue',
      pattern: /\bissue\b|\bgithub\b|\bbug\b|مشكلة برمجية|تذكرة/i,
      title: 'Create a GitHub issue',
      params: (text) => {
        const about = /issue (?:for|about|to)\s+(.+?)(?:,| and |\.|$)/i.exec(text)?.[1]?.trim();
        return { title: about ? about.charAt(0).toUpperCase() + about.slice(1) : 'New work item', details: text };
      },
    },
    {
      kind: 'finance.money_status',
      pattern: /\bmoney\b|\bprofit\b|\bcash\b|\brevenue\b|\bfinance\b|المال|الأرباح|الربح|الإيرادات|المالية/i,
      title: 'Report the money status',
      params: () => ({}),
    },
    {
      kind: 'commerce.catalog_check',
      pattern: /\bcatalog|\bproducts?\b|\bmargins?\b|\bprices?\b|المنتجات|الأسعار|الهامش/i,
      title: 'Check the catalog against the margin floor',
      params: () => ({}),
    },
    {
      kind: 'operations.daily_briefing',
      pattern: /\bbriefing\b|\bsummary\b|\bstatus\b|\bhow are we\b|ملخص|تقرير اليوم/i,
      title: 'Prepare the briefing',
      params: () => ({}),
    },
    {
      kind: 'security.review',
      pattern: /\bsecurity\b|\bsuspicious\b|\bsafe\b|الأمان|مشبوه/i,
      title: 'Review security',
      params: () => ({}),
    },
  ];

const meta = (kind: Kind | 'open', department: string): Omit<PlannedTask, 'title' | 'params'> =>
  kind === 'open'
    ? {
        kind,
        department,
        connector: 'Platform tools',
        level: null,
        approval: 'Anything at Level 2 or 3 waits in the approval inbox.',
        needs_model: true,
      }
    : { kind, ...TASK_KINDS[kind], needs_model: false };

/** Plans by fixed rules, for manual mode: each kind of work the instruction names becomes one task. */
export function planByRules(instruction: string): Omit<Plan, 'expected_cost_micros'> {
  const tasks: PlannedTask[] = RULES.filter((rule) => rule.pattern.test(instruction)).map((rule) => ({
    ...meta(rule.kind, TASK_KINDS[rule.kind].department),
    title: rule.title,
    params: rule.params(instruction),
  }));
  const warnings = tasks.length ? ['Planned by fixed rules, without AI. Check that each task is what you meant.'] : [];
  const questions = tasks.length
    ? []
    : [
        'I could not match this to work I can do without AI. Try naming it: posts, leads, replies, inbox, an issue, money, the catalog, a briefing or security.',
      ];
  return {
    objective: instruction.trim(),
    tasks,
    warnings,
    questions,
    planned_by: 'rules',
    data_sources: [...new Set(tasks.map((task) => task.connector))],
  };
}

const planSchema = z.object({
  objective: z.string().min(1).max(500),
  tasks: z
    .array(
      z.object({
        kind: z.enum(['open', ...KINDS]),
        department: z.enum(DEPARTMENT_IDS),
        title: z.string().min(1).max(200),
        count: z.number().int().min(1).max(20).nullable(),
        topic: z.string().max(300).nullable(),
        instruction: z.string().max(2000).nullable(),
      }),
    )
    .max(8),
  warnings: z.array(z.string().max(300)).max(8),
  questions: z.array(z.string().max(300)).max(5),
});

export interface CommandRow {
  id: string;
  instruction: string;
  objective: string | null;
  plan: Plan | null;
  warnings: string[];
  report: unknown;
  status: 'planning' | 'running' | 'done' | 'failed';
  created_by: string | null;
  created_at: Date;
  finished_at: Date | null;
}

/** Turns the owner's instruction into a plan and keeps it. Nothing runs until the owner says go. */
export async function planCommand(rt: AgentRuntime, instruction: string, by: Actor): Promise<CommandRow> {
  const text = instruction.trim();
  if (text.length < 3 || text.length > 2000) throw invalid('Write an instruction of 3 to 2000 characters.');
  const { id } = one(
    await rt.db.query<{ id: string }>(`insert into commands (instruction, created_by) values ($1, $2) returning id`, [
      text,
      by.id,
    ]),
  );
  const ctx: WorkflowContext = { trigger: 'command', triggerRef: id };
  const plan = await rt.record('operations.plan_command', ctx, { instruction: text }, async (run) => {
    const written = await rt.think(run, {
      skills: ['command-plan'],
      effort: 'medium',
      task: `The owner gave this instruction in the command center. Turn it into tasks for the departments. Prefer a fixed kind of work when one fits: ${KINDS.join(', ')}. Use kind "open" with an instruction only for work none of them covers. Give a count for posts or leads when the owner names one. If the instruction is unclear, ask in questions and plan nothing you are unsure of. Never plan anything that policy forbids; warn instead.\n\nInstruction: ${text}`,
      facts: { kinds: TASK_KINDS },
      schema: planSchema,
    });
    if (!written) return planByRules(text);
    return {
      objective: written.objective,
      tasks: written.tasks.map((task) => {
        const kind = task.kind as Kind | 'open';
        const department = kind === 'open' ? task.department : TASK_KINDS[kind].department;
        const params: Record<string, unknown> = {};
        if (task.count !== null) params.count = task.count;
        if (task.topic) params.topic = task.topic;
        if (kind === 'engineering.create_issue')
          Object.assign(params, { title: task.title, details: task.instruction ?? text });
        if (kind === 'open') params.instruction = task.instruction ?? task.title;
        return { ...meta(kind, department), title: task.title, params };
      }),
      warnings: written.warnings,
      questions: written.questions,
      planned_by: 'ai' as const,
      data_sources: [
        ...new Set(written.tasks.map((task) => meta(task.kind as Kind | 'open', task.department).connector)),
      ],
    };
  });
  const mode = await rt.mode();
  const perRun = await getPolicy(rt.db, 'ai.run_cap_micros');
  const modelTasks = mode.mode === 'ai' ? plan.tasks.length : plan.tasks.filter((t) => t.needs_model).length;
  const full: Plan = { ...plan, expected_cost_micros: mode.mode === 'ai' ? modelTasks * perRun : 0 };
  if (mode.mode === 'manual' && plan.tasks.some((task) => task.needs_model))
    full.warnings.push('Some tasks need the AI model, which is not available now. They will be skipped.');
  return one(
    await rt.db.query<CommandRow>(
      `update commands set objective = $2, plan = $3::jsonb, warnings = $4::jsonb where id = $1 returning *`,
      [id, full.objective, json(full), json(full.warnings)],
    ),
  );
}

/** The owner says go: each task becomes a task record and a job, run in order. */
export async function startCommand(rt: AgentRuntime, id: string, by: Actor): Promise<CommandRow> {
  return rt.db.tx(async (tx) => {
    const command = maybeOne(await tx.query<CommandRow>('select * from commands where id = $1 for update', [id]));
    if (!command) throw notFound('command');
    if (command.status !== 'planning' || !command.plan) throw invalid('This plan has already started.');
    if (!command.plan.tasks.length)
      throw invalid('This plan has no tasks to run. Answer its questions in a new instruction.');
    const start = rt.platform.clock().getTime();
    for (const [index, task] of command.plan.tasks.entries()) {
      const { id: taskId } = one(
        await tx.query<{ id: string }>(
          `insert into tasks (command_id, department, kind, title, params, created_by_kind, created_by_id)
           values ($1, $2, $3, $4, $5::jsonb, 'person', $6) returning id`,
          [id, task.department, task.kind, task.title, json(task.params), by.id],
        ),
      );
      // A millisecond apart, so the tasks run in the order they were planned, and all are due at once.
      await enqueue(
        tx,
        'operations.command_task',
        { task_id: taskId },
        {
          key: `command_task:${taskId}`,
          runAt: new Date(start + index),
          maxAttempts: 2,
        },
      );
    }
    await audit(tx, {
      actor: by,
      type: 'command.started',
      subject: { type: 'command', id },
      data: { tasks: command.plan.tasks.length },
    });
    return one(await tx.query<CommandRow>(`update commands set status = 'running' where id = $1 returning *`, [id]));
  });
}

interface TaskRow {
  id: string;
  command_id: string | null;
  department: string;
  kind: string;
  title: string;
  params: Record<string, unknown>;
  status: string;
  result: unknown;
  error: string | null;
}

/** What one task's result says about it: done, waiting for the owner, or skipped. */
function outcomeOf(result: unknown): 'done' | 'waiting_approval' | 'skipped' {
  const text = JSON.stringify(result ?? {});
  if (/"skipped":true/.test(text)) return 'skipped';
  if (/"status":"pending"/.test(text)) return 'waiting_approval';
  return 'done';
}

/** Runs one task of a command, as its department, then closes the command when it was the last one. */
async function commandTask(rt: AgentRuntime, input: Record<string, unknown>): Promise<unknown> {
  const task = maybeOne(await rt.db.query<TaskRow>('select * from tasks where id = $1', [input.task_id]));
  if (!task || !task.command_id) return { skipped: 'No such task.' };
  if (!['queued', 'running'].includes(task.status)) return { already: task.status };
  await rt.db.query(`update tasks set status = 'running' where id = $1`, [task.id]);
  const workflow = task.kind === 'open' ? `${task.department}.open` : task.kind;
  try {
    const result = await rt.runWorkflow(workflow, task.params, {
      trigger: 'command',
      triggerRef: task.command_id,
      taskId: task.id,
    });
    await rt.db.query(`update tasks set status = $2, result = $3::jsonb where id = $1`, [
      task.id,
      outcomeOf(result),
      json(result ?? null),
    ]);
  } catch (error) {
    await rt.db.query(`update tasks set status = 'failed', error = $2 where id = $1`, [
      task.id,
      error instanceof Error ? error.message : String(error),
    ]);
  }
  await closeIfDone(rt.db, task.command_id, rt.platform.clock());
  return { task_id: task.id };
}

async function closeIfDone(db: Db, commandId: string, now: Date): Promise<void> {
  const tasks = await db.query<TaskRow>('select * from tasks where command_id = $1 order by created_at', [commandId]);
  if (tasks.some((task) => ['queued', 'running'].includes(task.status))) return;
  const actions = await db.query<{
    task_id: string;
    action_type: string;
    status: string;
    summary: string;
    level: number;
  }>(
    `select task_id, action_type, status, summary, level from actions where task_id = any($1::uuid[]) order by created_at`,
    [tasks.map((task) => task.id)],
  );
  const runs = await db.query<{ task_id: string; output: { notes?: string[] } | null; cost_micros: string }>(
    `select task_id, output, cost_micros::text from agent_runs where task_id = any($1::uuid[])`,
    [tasks.map((task) => task.id)],
  );
  const report = {
    tasks: tasks.map((task) => ({
      title: task.title,
      department: task.department,
      status: task.status,
      error: task.error,
      actions: actions.filter((a) => a.task_id === task.id),
      notes: [...new Set(runs.filter((r) => r.task_id === task.id).flatMap((r) => r.output?.notes ?? []))],
    })),
    counts: {
      done: tasks.filter((t) => t.status === 'done').length,
      waiting_approval: tasks.filter((t) => t.status === 'waiting_approval').length,
      skipped: tasks.filter((t) => t.status === 'skipped').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    },
    ai_cost_micros: runs.reduce((sum, r) => sum + Number(r.cost_micros), 0),
  };
  const status = tasks.every((task) => task.status === 'failed') ? 'failed' : 'done';
  await db.query(
    `update commands set status = $2, report = $3::jsonb, finished_at = $4 where id = $1 and status = 'running'`,
    [commandId, status, json(report), now],
  );
}

export async function getCommand(db: Db, id: string): Promise<CommandRow & { tasks: TaskRow[] }> {
  const command = maybeOne(await db.query<CommandRow>('select * from commands where id = $1', [id]));
  if (!command) throw notFound('command');
  const tasks = await db.query<TaskRow>(
    'select id, command_id, department, kind, title, params, status, result, error from tasks where command_id = $1 order by created_at',
    [id],
  );
  return { ...command, tasks };
}

export async function listCommands(db: Db, limit = 20): Promise<CommandRow[]> {
  return db.query<CommandRow>('select * from commands order by created_at desc limit $1', [limit]);
}

export function registerCommandWorkflows(rt: AgentRuntime): void {
  rt.register('operations.command_task', (inner, input) => commandTask(inner, input));
}
