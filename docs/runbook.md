# Runbook

How to run, check and connect what is in this repository. The plan it implements is the [blueprint](blueprint.md).

## What exists today

| Part | Where | Status |
|---|---|---|
| Agent team for OpenMausBot | `agents/openmausbot` | Built. Not yet applied to a running app. |
| Database schema | `supabase/migrations` | Built. Applied to a local PostgreSQL 16. Not yet applied to a Supabase project. |
| Platform services and API | `packages/core` | Built. 67 tests pass, including the nine-step acceptance run of blueprint §15. |
| MCP server for the bots | `packages/core/src/api/mcp.ts` | Built and tested through the API. Not yet tried from a real MCP client. |
| Public site and storefront | `apps/web` | Built. Arabic and English, lead form, test checkout, order status. A browser smoke test passes. Not deployed. |
| Owner app (Flutter) | `apps/owner` | Built. Arabic and English, demo mode and sign-in with the owner token. 17 tests pass and a live test passed against the local API. Not released to any store. |
| Live connectors | none | Every connector is a mock. No live account is connected. |

## Run the checks

You need Node.js 22 and PostgreSQL 16.

Install once:

```bash
npm install
```

Point the tests at a PostgreSQL role that can create databases. The default is `postgres://zirr:zirr@localhost:5432/postgres`:

```bash
export TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/postgres
```

Run everything:

```bash
npm test
```

The acceptance run alone:

```bash
npx vitest run test/acceptance.test.ts --root packages/core
```

## Run the site locally

Create a local demo database (this drops `zirr_dev` if it exists):

```bash
npm run db:reset
```

Copy the example settings, then start the site:

```bash
cp apps/web/.env.example apps/web/.env.local
```

```bash
npm run dev
```

Open http://localhost:3000. With the site running on port 3100 from a production build, the browser smoke test is:

```bash
node apps/web/e2e/smoke.mjs http://localhost:3100
```

## How the pieces fit

1. A bot (in OpenMausBot) or the owner app calls the API.
2. Anything that would leave the platform is proposed to the gateway (`packages/core/src/governance/gateway.ts`).
3. The policy engine sets the level from the action itself. Level 0 and 1 run. Level 2 and 3 wait for the owner.
4. The owner decides in the owner app. An approval is tied to the hash of the exact payload.
5. The gateway runs the action through a connector, with an idempotency key, unless a pause holds it.
6. Every step is written to the append-only audit log.

## Before anything goes live

These are the owner's steps. Nothing here has been done.

| Step | Why |
|---|---|
| Decide the Phase 0 items in blueprint §20 | Markets, payment route and launch budget block everything else |
| Create a Supabase project and apply `supabase/migrations` | The platform needs a database. Use a paid plan for backups. |
| Set `OWNER_API_TOKEN`, the webhook secrets and one token per department | The API refuses every caller without them |
| Set the real payment fee in the policy sheet | Margins are calculated from it. It starts at zero. |
| Replace each mock connector with a live one, reading first | No live account is connected today |
| Review the email templates and the Arabic marked "new wording" in `packages/core/src/company.ts` | They reach customers |
| Add the MCP server to OpenMausBot (Plugins, MCP servers, Add server) with each bot's own token | So that bots act through the gateway |

## Known limits

- Demo mode (`demo: true`) seeds a demo owner, approved sample data and a test product. Never use it with live accounts.
- The store sells digital and physical products in separate orders.
- Authentication accepts an owner token or a Supabase JWT signed with a shared secret. Two-step sign-in is not built yet.
- The owner app keeps the owner token in memory only and has no push notifications yet. See `apps/owner/README.md`.
- There is no rate limiting by IP address. Put the API behind the host's own protection before launch.
