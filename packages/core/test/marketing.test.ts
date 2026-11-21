import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postTimes } from '../src/agents/marketing';
import { createApi, type ApiResponse } from '../src/api/index';
import { BufferConnector } from '../src/connectors/live/buffer';
import { DEMO_OWNER_ID } from '../src/company';
import { setPolicy } from '../src/governance/settings';
import { createTestPlatform, OWNER, type TestPlatform } from './helpers/platform';

/**
 * Marketing's weekly posts (work package 3): each Sunday Marketing schedules the approved post templates used least
 * lately on Buffer for Monday, Wednesday and Friday. Without the autopilot each post waits for the owner; with it, the
 * approved wording goes out by itself, and any other wording still waits.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const TOKEN = 'owner-test-token';
const DAY = 24;

describe('the times the posts go out', () => {
  it('Monday, Wednesday and Friday at 10:00 in Amman, moving a time that is past to the next week', () => {
    const sunday = new Date('2026-11-15T09:00:00Z');
    expect(postTimes(sunday, 3).map((d) => d.toISOString())).toEqual([
      '2026-11-16T07:00:00.000Z',
      '2026-11-18T07:00:00.000Z',
      '2026-11-20T07:00:00.000Z',
    ]);
    const monday = new Date('2026-11-16T08:00:00Z');
    expect(postTimes(monday, 3).map((d) => d.toISOString())).toEqual([
      '2026-11-18T07:00:00.000Z',
      '2026-11-20T07:00:00.000Z',
      '2026-11-23T07:00:00.000Z',
    ]);
  });
});

describe('weekly posts', () => {
  let t: TestPlatform;
  let owner: (method: string, path: string, body?: unknown) => Promise<ApiResponse & { body: Json }>;
  const run = async () =>
    (await t.platform.agents.runWorkflow('marketing.weekly_posts', {}, { trigger: 'schedule' })) as { posts: Json[] };
  const posts = () =>
    t.test.db.query<Json>(`select * from actions where action_type = 'buffer.schedule_post' order by created_at`);

  beforeAll(async () => {
    t = await createTestPlatform();
    const api = createApi(t.platform, { ownerToken: TOKEN, ownerUserId: DEMO_OWNER_ID, agentTokens: {} });
    owner = async (method, path, body) =>
      (await api({
        method,
        path,
        query: {},
        headers: { authorization: `Bearer ${TOKEN}` },
        body: body === undefined ? '' : JSON.stringify(body),
      })) as ApiResponse & { body: Json };
    // The demo approves every template on install; a real install starts with the posts as drafts.
    await t.test.db.query(`update memory_items set status = 'draft' where key like 'template:post-%'`);
  });
  afterAll(async () => t.test.drop());

  it('posts nothing until the owner approves a post template', async () => {
    expect((await run()).posts).toEqual([]);
    const status = (await owner('GET', '/api/owner/marketing')).body;
    expect(status.templates.length).toBeGreaterThanOrEqual(8);
    expect(status.templates.every((p: Json) => !p.approved)).toBe(true);
    // The owner sees the exact wording before approving it.
    const trial = status.templates.find((p: Json) => p.key === 'post-trial');
    expect(trial.text.en).toContain('{{trial_days}} days');
    expect(trial.text.ar).toContain('{{link}}');
    expect(status.autopilot).toBeNull();
  });

  it('schedules three approved posts for the week, filled in by code, each waiting for the owner', async () => {
    for (const key of ['post-trial', 'post-agencies', 'post-offline'])
      expect((await owner('POST', `/api/owner/memory/template:${key}/approve`, {})).status).toBe(200);
    const week = await run();
    expect(week.posts).toHaveLength(3);
    const planned = await posts();
    expect(planned.map((p) => p.status)).toEqual(['pending', 'pending', 'pending']);
    const trial = planned.find((p) => p.payload.template === 'post-trial')!;
    // A Facebook post for shops starts in Arabic; a LinkedIn post for agencies in English.
    expect(trial.payload).toMatchObject({ channel: 'facebook', locale: 'ar' });
    expect(trial.payload.text).toContain('14 يوماً');
    expect(trial.payload.text).toContain('https://shop.example.test/ar/trial');
    expect(planned.find((p) => p.payload.template === 'post-agencies')!.payload.locale).toBe('en');
    expect(planned.map((p) => p.payload.scheduled_for).sort()).toEqual([
      '2026-11-16T07:00:00.000Z',
      '2026-11-18T07:00:00.000Z',
      '2026-11-20T07:00:00.000Z',
    ]);

    // Run again the same week: the coming days are already planned.
    expect((await run()).posts).toEqual([]);
    expect(await posts()).toHaveLength(3);
  });

  it('with the autopilot on, next week the approved posts go out by themselves, in the other language', async () => {
    const on = await owner('POST', '/api/owner/marketing/autopilot', { on: true });
    expect(on.body.autopilot).toMatchObject({ name: 'Marketing autopilot', status: 'active', period: 'week' });
    t.clock.advance(7 * DAY);
    const week = await run();
    expect(week.posts).toHaveLength(3);
    const latest = (await posts()).slice(3);
    expect(latest.map((p) => p.status)).toEqual(['executed', 'executed', 'executed']);
    expect(latest.find((p) => p.payload.template === 'post-trial')!.payload.locale).toBe('en');
  });

  it('other wording under a template name still waits for the owner', async () => {
    const { action } = await t.platform.gateway.propose({
      type: 'buffer.schedule_post',
      payload: { channel: 'facebook', locale: 'en', template: 'post-trial', text: 'Huge sale today only! Buy now.' },
      requester: { kind: 'agent', id: 'marketing' },
      evidence: [],
    });
    expect(action.status).toBe('pending');
  });

  it('the Sunday tick queues the weekly posts, and the number per week comes from the policy sheet', async () => {
    t.clock.advance(7 * DAY);
    expect(await t.platform.agents.scheduleDaily()).toContain('marketing.weekly_posts');
    await setPolicy(t.test.db, 'marketing.posts_per_week', 1, OWNER);
    t.clock.advance(7 * DAY);
    expect((await run()).posts).toHaveLength(1);
    expect((await owner('POST', '/api/owner/marketing/autopilot', { on: false })).body.autopilot).toBeNull();
  });

  it('two quick taps on the switch leave one rule, and turning it off leaves none', async () => {
    await Promise.all([
      owner('POST', '/api/owner/marketing/autopilot', { on: true }),
      owner('POST', '/api/owner/marketing/autopilot', { on: true }),
    ]);
    const active = () =>
      t.test.db.query(`select id from standing_rules where name = 'Marketing autopilot' and status = 'active'`);
    expect(await active()).toHaveLength(1);
    await owner('POST', '/api/owner/marketing/autopilot', { on: false });
    expect(await active()).toHaveLength(0);
  });

  it('with a Buffer key that has only a LinkedIn page, only LinkedIn posts are planned', async () => {
    const mock = t.platform.connectors.buffer!;
    t.platform.connectors.buffer = new BufferConnector(
      { api_key: 'test', channels: { linkedin: 'li-1' } },
      t.platform.fetch,
    );
    try {
      await setPolicy(t.test.db, 'marketing.posts_per_week', 3, OWNER);
      t.clock.advance(7 * DAY);
      const week = await run();
      const planned = await t.test.db.query<Json>(`select payload from actions where id = any($1::uuid[])`, [
        week.posts.map((p) => p.action_id),
      ]);
      expect(planned.map((p) => p.payload.channel)).toEqual(['linkedin']);
    } finally {
      t.platform.connectors.buffer = mock;
    }
  });
});
