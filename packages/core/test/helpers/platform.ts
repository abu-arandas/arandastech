import { signedEvent } from '../../src/commerce/store';
import { createMockConnectors, type MockConnector } from '../../src/connectors/mock';
import { DEMO_OWNER_ID } from '../../src/company';
import type { Actor } from '../../src/lib/types';
import { createPlatform, install, type Platform } from '../../src/platform';
import { createTestDb, testClock, type TestDb } from './db';

export const SECRETS = { payments: 'test-payments-secret', supplier: 'test-supplier-secret' };
export const OWNER: Actor = { kind: 'person', id: DEMO_OWNER_ID };
export const asOwner = { by: OWNER, isOwner: true };

export interface TestPlatform {
  test: TestDb;
  platform: Platform;
  mocks: Record<string, MockConnector>;
  clock: ReturnType<typeof testClock>;
  /** Delivers a signed provider notice, as the mock payment provider would. */
  paymentEvent(type: string, data: Record<string, unknown>, id?: string): Promise<{ duplicate: boolean; result: string }>;
  supplierEvent(type: string, data: Record<string, unknown>): Promise<{ duplicate: boolean; result: string }>;
}

/** A migrated, seeded demo platform on its own database, with mock connectors and a clock the test controls. */
export async function createTestPlatform(): Promise<TestPlatform> {
  const test = await createTestDb();
  const clock = testClock();
  const mocks = createMockConnectors();
  const platform = createPlatform(test.db, { demo: true, webhookSecrets: SECRETS }, { clock: clock.now, connectors: mocks });
  await install(platform);
  return {
    test,
    platform,
    mocks,
    clock,
    paymentEvent(type, data, id) {
      const event = signedEvent(SECRETS.payments, type, data, id);
      return platform.store.handlePaymentWebhook(event.body, event.signature);
    },
    supplierEvent(type, data) {
      const event = signedEvent(SECRETS.supplier, type, data);
      return platform.store.handleSupplierWebhook(event.body, event.signature);
    },
  };
}
