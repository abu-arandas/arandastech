import { type Fetch, LiveConnector, ProviderError, request, unknownAction } from './base';

const BUFFER = 'https://api.buffer.com';

async function graphql<T>(fetcher: Fetch, key: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const answer = await request<{ data?: T; errors?: Array<{ message: string }> }>(fetcher, 'Buffer', BUFFER, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (answer.errors?.length) throw new ProviderError('Buffer', 200, answer.errors.map((e) => e.message).join('; '));
  if (!answer.data) throw new ProviderError('Buffer', 200, 'no data');
  return answer.data;
}

/** The Facebook and LinkedIn channels a Buffer key can post to, as `{"facebook": "<id>", "linkedin": "<id>"}`. */
export async function findBufferChannels(fetcher: Fetch, key: string): Promise<Record<string, string>> {
  const account = await graphql<{ account: { organizations: Array<{ id: string }> } }>(
    fetcher,
    key,
    'query { account { organizations { id } } }',
  );
  const found: Record<string, string> = {};
  for (const org of account.account.organizations) {
    if (!/^[a-f\d]{24}$/i.test(org.id)) continue;
    const data = await graphql<{ channels: Array<{ id: string; service: string }> }>(
      fetcher,
      key,
      `query { channels(input: { organizationId: "${org.id}" }) { id service } }`,
    );
    for (const channel of data.channels) {
      const service = channel.service.toLowerCase();
      if ((service === 'facebook' || service === 'linkedin') && !found[service]) found[service] = channel.id;
    }
  }
  return found;
}

export class BufferConnector extends LiveConnector {
  readonly id = 'buffer';

  constructor(
    private readonly creds: { api_key: string; channels: Record<string, string> },
    private readonly fetcher: Fetch,
  ) {
    super();
  }

  protected async call(actionType: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (actionType !== 'buffer.create_draft' && actionType !== 'buffer.schedule_post')
      throw unknownAction(this.id, actionType);
    const channel = String(payload.channel);
    const channelId = this.creds.channels[channel];
    if (!channelId)
      throw new Error(`Buffer has no ${channel} channel. Connect one in Buffer, then save the key again.`);
    const text = payload.link ? `${String(payload.text)}\n\n${String(payload.link)}` : String(payload.text);
    const input: Record<string, unknown> = {
      text,
      channelId,
      schedulingType: 'automatic',
      mode: payload.scheduled_for ? 'customScheduled' : 'addToQueue',
      ...(payload.scheduled_for ? { dueAt: payload.scheduled_for } : {}),
      ...(actionType === 'buffer.create_draft' ? { saveToDraft: true } : {}),
      ...(channel === 'facebook' ? { metadata: { facebook: { type: 'post' } } } : {}),
    };
    const data = await graphql<{ createPost: { post?: { id: string }; message?: string } }>(
      this.fetcher,
      this.creds.api_key,
      `
        mutation ($input: CreatePostInput!) {
          createPost(input: $input) {
            ... on PostActionSuccess {
              post {
                id
              }
            }
            ... on MutationError {
              message
            }
          }
        }
      `,
      { input },
    );
    if (!data.createPost.post)
      throw new ProviderError('Buffer', 200, data.createPost.message ?? 'the post was not made');
    return { post_id: data.createPost.post.id };
  }

  async health(): Promise<{ ok: boolean; note: string }> {
    try {
      await graphql(this.fetcher, this.creds.api_key, 'query { account { id } }');
      const names = Object.keys(this.creds.channels);
      return {
        ok: true,
        note: names.length
          ? `Connected. Channels: ${names.join(', ')}.`
          : 'Connected, but no Facebook or LinkedIn channel.',
      };
    } catch (error) {
      return { ok: false, note: error instanceof Error ? error.message : String(error) };
    }
  }
}
