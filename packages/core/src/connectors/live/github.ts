import { type Fetch, LiveConnector, request, unknownAction } from './base';

export class GitHubConnector extends LiveConnector {
  readonly id = 'github';

  constructor(
    private readonly token: string,
    private readonly fetcher: Fetch,
  ) {
    super();
  }

  private api<T>(path: string, init: RequestInit = {}): Promise<T> {
    return request<T>(this.fetcher, 'GitHub', `https://api.github.com${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'zirr-platform',
        'content-type': 'application/json',
      },
    });
  }

  protected async call(actionType: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const repository = String(payload.repository);
    if (actionType === 'github.create_issue') {
      const issue = await this.api<{ number: number; html_url: string }>(`/repos/${repository}/issues`, {
        method: 'POST',
        body: JSON.stringify({ title: payload.title, body: payload.body }),
      });
      return { number: issue.number, url: issue.html_url, repository };
    }
    if (actionType === 'github.merge_pull_request') {
      const merged = await this.api<{ merged: boolean; sha: string }>(
        `/repos/${repository}/pulls/${Number(payload.number)}/merge`,
        { method: 'PUT', body: JSON.stringify({ merge_method: 'squash' }) },
      );
      return { merged: merged.merged, sha: merged.sha };
    }
    throw unknownAction(this.id, actionType);
  }

  async health(): Promise<{ ok: boolean; note: string }> {
    try {
      const user = await this.api<{ login: string }>('/user');
      return { ok: true, note: `Connected as ${user.login}.` };
    } catch (error) {
      return { ok: false, note: error instanceof Error ? error.message : String(error) };
    }
  }
}
