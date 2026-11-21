import { mayPropose } from '../api/mcp';
import { BufferConnector } from '../connectors/live/buffer';
import { getPolicy } from '../governance/settings';
import type { Db } from '../lib/db';
import type { Locale } from '../lib/types';
import { listApprovedMemory } from '../memory';
import { POST_TEMPLATES, POST_TEMPLATE_KEYS } from '../post-templates';
import type { Json } from './common';
import type { AgentRuntime, Run, WorkflowContext } from './runtime';
import type { Proposed } from './workflows';

/**
 * Marketing's weekly posts (work package 3). Each Sunday it picks the approved post templates used least lately, fills
 * in their blanks by code and schedules them on Buffer for the coming week at 10:00 in Amman. Marketing's autopilot (a
 * standing rule over the post templates) lets them go without asking; otherwise each one waits in Approvals.
 */

const DAY = 86_400_000;
/** The days after Sunday the posts go out, in the order they are used: Monday, Wednesday, Friday, then the rest. */
const POST_DAYS = [1, 3, 5, 2, 4, 6, 0];
/** 10:00 in Amman, which is UTC+3 all year. */
const POST_HOUR_UTC = 7;

interface ApprovedPost {
  key: string;
  channel: 'facebook' | 'linkedin';
  text: Record<Locale, string>;
}

/** The post templates the owner approved, with the wording they approved (not the newer wording in the code). */
async function approvedPosts(db: Db): Promise<ApprovedPost[]> {
  const approved = await listApprovedMemory(db, 'template');
  const posts: ApprovedPost[] = [];
  for (const key of POST_TEMPLATE_KEYS) {
    const body = approved.find((item) => item.key === `template:${key}`)?.body as
      Record<Locale, { text?: string } | undefined> | undefined;
    const [en, ar] = [body?.en?.text, body?.ar?.text];
    if (en && ar) posts.push({ key, channel: POST_TEMPLATES[key]!.channel, text: { en, ar } });
  }
  return posts;
}

/** When each template was last posted, and in which language, so the week takes the ones used least lately. */
async function lastUses(db: Db): Promise<Map<string, { at: Date; locale: Locale }>> {
  const rows = await db.query<{ template: string; locale: Locale; at: Date }>(
    `select distinct on (payload ->> 'template') payload ->> 'template' as template, payload ->> 'locale' as locale,
       created_at as at
     from actions where action_type = 'buffer.schedule_post' and payload ? 'template'
     order by payload ->> 'template', created_at desc`,
  );
  return new Map(rows.map((row) => [row.template, { at: row.at, locale: row.locale }]));
}

/** Shops in Jordan read Facebook in Arabic first, agencies read LinkedIn in English first; then the two alternate. */
function nextLocale(post: ApprovedPost, last: { locale: Locale } | undefined): Locale {
  if (last) return last.locale === 'ar' ? 'en' : 'ar';
  return post.channel === 'facebook' ? 'ar' : 'en';
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (blank, name: string) => values[name] ?? blank);
}

async function weeklyPosts(rt: AgentRuntime, input: Json, ctx: WorkflowContext): Promise<unknown> {
  return rt.record('marketing.weekly_posts', ctx, input, async (run) => {
    const count = Math.min(7, await getPolicy(rt.db, 'marketing.posts_per_week'));
    if (count === 0) return { posts: [], note: 'marketing.posts_per_week is 0.' };
    // Without a Buffer account the post would only reach the stand-in connector, which publishes nothing.
    if (rt.platform.connectors.buffer?.mode !== 'live' && !rt.platform.config.demo) {
      run.notes.push('Buffer is not connected, so no posts were scheduled. Connect it in Systems, Connections.');
      return { posts: [] };
    }
    const site = rt.platform.config.siteUrl?.replace(/\/+$/, '');
    if (!site) {
      run.notes.push('The site address is not set, so the posts would have no link. Nothing was scheduled.');
      return { posts: [] };
    }
    const now = rt.platform.clock();
    if (await plannedAhead(rt.db, now))
      return { posts: [], note: 'The posts for the coming days are already planned.' };
    const used = await lastUses(rt.db);
    // A Buffer key may hold only a Facebook page or only a LinkedIn page: posts for the other one are left out.
    const buffer = rt.platform.connectors.buffer;
    const reachable = (post: ApprovedPost) => !(buffer instanceof BufferConnector) || buffer.hasChannel(post.channel);
    const week = (await approvedPosts(rt.db))
      .filter(reachable)
      .sort((a, b) => (used.get(a.key)?.at.getTime() ?? 0) - (used.get(b.key)?.at.getTime() ?? 0))
      .slice(0, count);
    if (!week.length) {
      run.notes.push('No approved post template fits the connected Buffer pages. Approve them in Team, Weekly posts.');
      return { posts: [] };
    }
    const trialDays = String(await getPolicy(rt.db, 'billing.trial_days'));
    const posts: Proposed[] = [];
    for (const [i, at] of postTimes(now, week.length).entries()) {
      const post = week[i]!;
      const locale = nextLocale(post, used.get(post.key));
      const link = `${site}/${locale}${POST_TEMPLATES[post.key]!.path}`;
      const text = fill(post.text[locale], { link, trial_days: trialDays });
      posts.push(await schedulePost(rt, run, { post, locale, text, at }));
    }
    return { posts };
  });
}

/**
 * The week's post times: Monday, Wednesday and Friday at 10:00 in Amman (more days when more posts are asked for),
 * each in the week that starts this Sunday, or a week later when that time is less than an hour away or past.
 */
export function postTimes(now: Date, count: number): Date[] {
  const sunday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay());
  return POST_DAYS.slice(0, count)
    .map((day) => {
      const at = sunday + day * DAY + POST_HOUR_UTC * 3_600_000;
      return new Date(at < now.getTime() + 3_600_000 ? at + 7 * DAY : at);
    })
    .sort((a, b) => a.getTime() - b.getTime());
}

/** A post is already waiting to go out (or waiting for the owner), so the coming days are planned. */
async function plannedAhead(db: Db, now: Date): Promise<boolean> {
  const rows = await db.query(
    `select 1 from actions where action_type = 'buffer.schedule_post' and payload ? 'template'
       and status not in ('rejected', 'expired', 'blocked', 'failed') and (payload ->> 'scheduled_for')::timestamptz > $1
     limit 1`,
    [now],
  );
  return rows.length > 0;
}

async function schedulePost(
  rt: AgentRuntime,
  run: Run,
  p: { post: ApprovedPost; locale: Locale; text: string; at: Date },
): Promise<Proposed> {
  if (!mayPropose(run.department).includes('buffer.schedule_post'))
    throw new Error(`The ${run.department} department may not post.`);
  const { action } = await rt.platform.gateway.propose({
    type: 'buffer.schedule_post',
    payload: {
      channel: p.post.channel,
      text: p.text,
      locale: p.locale,
      template: p.post.key,
      scheduled_for: p.at.toISOString(),
    },
    requester: { kind: 'agent', id: run.department },
    evidence: [{ kind: 'memory', id: `template:${p.post.key}` }],
    idempotencyKey: `marketing.weekly_posts:${p.at.toISOString()}`,
    agentRunId: run.id,
    taskId: run.taskId,
  });
  return {
    action_id: action.id,
    type: action.action_type,
    level: action.level,
    status: action.status,
    summary: action.summary,
  };
}

export function registerMarketingWorkflows(rt: AgentRuntime): void {
  rt.register('marketing.weekly_posts', weeklyPosts);
}
