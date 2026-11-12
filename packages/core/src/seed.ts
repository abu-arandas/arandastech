import { CONNECTORS } from './governance/actions';
import { seedPolicy } from './governance/settings';
import type { Db } from './lib/db';

/** The eight departments (blueprint 7.2). Each runs alone up to Level 1; Security may also pause. */
export const DEPARTMENTS = [
  { id: 'operations', name: 'Operations', mission: 'Turn goals into coordinated work and keep the owner accurately informed.' },
  { id: 'engineering', name: 'Engineering', mission: 'Build and maintain the software.' },
  { id: 'marketing', name: 'Marketing', mission: 'Bring the right people to the right offer.' },
  { id: 'sales', name: 'Sales', mission: 'Turn interest into agreed work.' },
  { id: 'support', name: 'Support', mission: 'Answer customers correctly and quickly.' },
  { id: 'commerce', name: 'Commerce', mission: 'Find, list and fulfill products that make a profit.' },
  { id: 'finance', name: 'Finance', mission: 'Keep the numbers true.' },
  { id: 'security', name: 'Security', mission: 'Keep accounts, data and the rules safe.' },
] as const;

export type DepartmentId = (typeof DEPARTMENTS)[number]['id'];

/** What every installation needs before anything else: the policy sheet, the departments and the connectors. Safe to run again. */
export async function seedBase(db: Db): Promise<void> {
  await seedPolicy(db);
  for (const d of DEPARTMENTS) {
    await db.query(
      `insert into agents (id, name, mission, can_pause) values ($1, $2, $3, $4)
       on conflict (id) do update set name = excluded.name, mission = excluded.mission, can_pause = excluded.can_pause`,
      [d.id, d.name, d.mission, d.id === 'security'],
    );
  }
  for (const c of CONNECTORS) {
    await db.query(
      `insert into connectors (id, name, mode, status, status_note) values ($1, $2, 'mock', $3, $4) on conflict (id) do nothing`,
      [c.id, c.name, c.status, c.note],
    );
  }
}
