import type { Platform } from '../platform';
import type { Router } from './http';
import { registerAgentRoutes } from './routes-agents';
import { registerConnectionRoutes } from './routes-connections';
import { registerDemoRoutes } from './routes-demo';
import { registerOwnerRoutes } from './routes-owner';
import { registerPublicRoutes } from './routes-public';
import { registerSalesRoutes } from './routes-sales';
import { registerSettingsRoutes } from './routes-settings';

/** Every address of the API, one file per area. Sales comes first, as it always has. */
export function registerRoutes(router: Router, platform: Platform): void {
  registerSalesRoutes(router, platform);
  registerPublicRoutes(router, platform);
  registerDemoRoutes(router, platform);
  registerOwnerRoutes(router, platform);
  registerConnectionRoutes(router, platform);
  registerSettingsRoutes(router, platform);
  registerAgentRoutes(router, platform);
}
