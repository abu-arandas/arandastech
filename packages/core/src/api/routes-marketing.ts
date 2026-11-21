import { POST_TEMPLATE_KEYS, POST_TEMPLATES } from '../post-templates';
import type { Platform } from '../platform';
import { activeAutopilot, type Autopilot, switchAutopilot } from './autopilot';
import { staffOf } from './guards';
import type { Router } from './http';

/** The standing rule that lets Marketing publish its approved post templates without asking each time. */
const MARKETING_AUTOPILOT: Autopilot = {
  name: 'Marketing autopilot',
  actionType: 'buffer.schedule_post',
  templates: POST_TEMPLATE_KEYS,
  // One post a day at most, whatever the weekly number on the policy sheet says.
  limit: async () => 7,
  period: 'week',
};

/** Marketing's weekly posts (work package 3): what is planned, which templates are approved, and the autopilot. */
export function registerMarketingRoutes(router: Router, platform: Platform): void {
  const { db } = platform;

  router.add('GET', '/api/owner/marketing', 'staff', async ({ caller }) => {
    staffOf(caller);
    const approved = await db.query<{ key: string; status: string }>(
      `select key, status from memory_items where key = any($1::text[])`,
      [POST_TEMPLATE_KEYS.map((key) => `template:${key}`)],
    );
    const posts = await db.query(
      `select id, status, summary, payload ->> 'channel' as channel, payload ->> 'locale' as locale,
         payload ->> 'template' as template, payload ->> 'scheduled_for' as scheduled_for
       from actions where action_type = 'buffer.schedule_post' order by created_at desc limit 10`,
    );
    return {
      autopilot: await activeAutopilot(db, MARKETING_AUTOPILOT),
      buffer_connected: platform.connectors.buffer?.mode === 'live',
      templates: POST_TEMPLATE_KEYS.map((key) => ({
        key,
        title: POST_TEMPLATES[key]!.title,
        channel: POST_TEMPLATES[key]!.channel,
        approved: approved.some((row) => row.key === `template:${key}` && row.status === 'approved'),
      })),
      posts,
    };
  });

  router.add('POST', '/api/owner/marketing/autopilot', 'owner', async ({ caller, json }) => ({
    autopilot: await switchAutopilot(platform, staffOf(caller), MARKETING_AUTOPILOT, json.on === true),
  }));
}
