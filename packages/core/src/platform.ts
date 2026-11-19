import { registerCommandWorkflows } from './agents/command';
import type { ModelClient } from './agents/model';
import { AgentRuntime } from './agents/runtime';
import { registerSalesWorkflows } from './agents/sales';
import { registerWorkflows } from './agents/workflows';
import { Store } from './commerce/store';
import { seedCompany } from './company';
import type { Fetch } from './connectors/live/base';
import { createMockConnectors, type MockConnector } from './connectors/mock';
import type { ConnectorHost } from './connectors/registry';
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
  /** The AI model the departments use. Without one they work in manual mode: approved templates and fixed rules, at no cost. */
  model?: ModelClient | null;
  /** The site's own address, for the addresses providers call back (Google sign-in, WhatsApp, PayTabs). */
  siteUrl?: string;
}

export interface Platform extends ConnectorHost {
  db: Db;
  clock: Clock;
  config: PlatformConfig;
  /** What the gateway uses: each connector's live adapter once the owner connects it, its mock until then. */
  connectors: Record<string, Connector>;
  mocks: Record<string, MockConnector>;
  fetch: Fetch;
  gateway: Gateway;
  store: Store;
  /** The departments: their workflows, the job queue and the command center. */
  agents: AgentRuntime;
}

/** Builds the platform around one database. Every connector is a mock until the owner connects a live account. */
export function createPlatform(
  db: Db,
  config: PlatformConfig,
  overrides: { clock?: Clock; connectors?: Record<string, MockConnector>; fetch?: Fetch } = {},
): Platform {
  const clock = overrides.clock ?? systemClock;
  const mocks = overrides.connectors ?? createMockConnectors();
  const connectors: Record<string, Connector> = { ...mocks };
  // In demo mode anyone can place an order, so a standing rule never sends through a live account there.
  const gateway = new Gateway(db, connectors, clock, {
    rulesAllowed: (connector) => !(config.demo && connectors[connector]?.mode === 'live'),
  });
  const store = new Store(db, gateway, clock, {
    webhookSecrets: config.webhookSecrets,
    allowTestProducts: config.demo,
  });
  const platform = {
    db,
    clock,
    config,
    connectors,
    mocks,
    fetch: overrides.fetch ?? ((url, init) => fetch(url, init)),
    gateway,
    store,
    paymentEvent: (event) => store.processPaymentEvent(event),
  } as Platform;
  platform.agents = new AgentRuntime(platform, config.model ?? null);
  registerWorkflows(platform.agents);
  registerSalesWorkflows(platform.agents);
  registerCommandWorkflows(platform.agents);
  return platform;
}

/** Puts the policy sheet, departments, connectors and company data into a migrated database. Safe to run again. */
export async function install(platform: Platform): Promise<void> {
  await seedBase(platform.db);
  await seedCompany(platform.db, { demo: platform.config.demo, now: platform.clock() });
}
