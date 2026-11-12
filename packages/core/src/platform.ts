import { Store } from './commerce/store';
import { seedCompany } from './company';
import { createMockConnectors } from './connectors/mock';
import type { Connector } from './connectors/types';
import { Gateway } from './governance/gateway';
import type { Db } from './lib/db';
import { type Clock, systemClock } from './lib/types';
import { seedBase } from './seed';

export interface PlatformConfig {
  /** Demo mode: mock connectors, a demo owner, test products and approved sample data. Never use it with live accounts. */
  demo: boolean;
  /** Shared secrets that sign each provider's webhooks. */
  webhookSecrets: { payments: string; supplier: string };
}

export interface Platform {
  db: Db;
  clock: Clock;
  config: PlatformConfig;
  connectors: Record<string, Connector>;
  gateway: Gateway;
  store: Store;
}

/** Builds the platform around one database. Every connector is a mock until the owner connects a live account. */
export function createPlatform(db: Db, config: PlatformConfig, overrides: { clock?: Clock; connectors?: Record<string, Connector> } = {}): Platform {
  const clock = overrides.clock ?? systemClock;
  const connectors = overrides.connectors ?? createMockConnectors();
  const gateway = new Gateway(db, connectors, clock);
  const store = new Store(db, gateway, clock, { webhookSecrets: config.webhookSecrets, allowTestProducts: config.demo });
  return { db, clock, config, connectors, gateway, store };
}

/** Puts the policy sheet, departments, connectors and company data into a migrated database. Safe to run again. */
export async function install(platform: Platform): Promise<void> {
  await seedBase(platform.db);
  await seedCompany(platform.db, { demo: platform.config.demo, now: platform.clock() });
}
