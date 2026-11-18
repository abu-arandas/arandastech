import { type Fetch, LiveConnector, request, unknownAction } from './base';

const VERCEL = 'https://api.vercel.com';

/** The team a Vercel token belongs to: the first team it can see, or none for a personal account. */
export async function findVercelTeam(fetcher: Fetch, token: string): Promise<string> {
  const teams = await request<{ teams?: Array<{ id: string }> }>(fetcher, 'Vercel', `${VERCEL}/v2/teams?limit=1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return teams.teams?.[0]?.id ?? 'personal';
}

export class VercelConnector extends LiveConnector {
  readonly id = 'vercel';

  constructor(
    private readonly creds: { token: string; team_id: string },
    private readonly fetcher: Fetch,
  ) {
    super();
  }

  private api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const team = this.creds.team_id && this.creds.team_id !== 'personal' ? this.creds.team_id : null;
    const url = `${VERCEL}${path}${team ? `${path.includes('?') ? '&' : '?'}teamId=${encodeURIComponent(team)}` : ''}`;
    return request<T>(this.fetcher, 'Vercel', url, {
      ...init,
      headers: { authorization: `Bearer ${this.creds.token}`, 'content-type': 'application/json' },
    });
  }

  protected async call(actionType: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (actionType !== 'vercel.create_preview' && actionType !== 'vercel.deploy_production')
      throw unknownAction(this.id, actionType);
    const project = String(payload.project);
    const found = await this.api<{ name: string; link?: { type?: string; repoId?: number } }>(
      `/v9/projects/${encodeURIComponent(project)}`,
    );
    if (found.link?.type !== 'github' || !found.link.repoId)
      throw new Error(`${project} is not linked to a GitHub repository on Vercel.`);
    const deployment = await this.api<{ id: string; url: string }>('/v13/deployments', {
      method: 'POST',
      body: JSON.stringify({
        name: found.name,
        project,
        ...(actionType === 'vercel.deploy_production' ? { target: 'production' } : {}),
        gitSource: { type: 'github', repoId: found.link.repoId, ref: String(payload.ref) },
      }),
    });
    return { id: deployment.id, url: `https://${deployment.url}` };
  }

  async health(): Promise<{ ok: boolean; note: string }> {
    try {
      const user = await this.api<{ user: { username: string } }>('/v2/user');
      return { ok: true, note: `Connected as ${user.user.username}.` };
    } catch (error) {
      return { ok: false, note: error instanceof Error ? error.message : String(error) };
    }
  }
}
