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

## Put it live for free

Everything here runs on free plans. The storefront and the API run on Vercel's Hobby plan. The database is any PostgreSQL 16 or later: a free Neon database from the Vercel Marketplace, or a Supabase project. The owner app's web build is on GitHub Pages, which is free for a public repository.

1. Create a Vercel project from this repository with the root directory `apps/web`, and set Deployment Protection to previews only so the live site is public. `apps/web/vercel.json` installs from the repository root, then builds with `npm run db:deploy` and `next build`. Node.js is 22, as in CI.
2. Link the database.
   - Neon from the Vercel Marketplace adds `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` for you.
   - On Supabase, set `DATABASE_URL` to the transaction pooler address (port 6543) and `DATABASE_URL_UNPOOLED` to the session pooler address (port 5432).
3. Set the other variables from `apps/web/.env.example` for Production:
   - `OWNER_USER_ID`,
   - `OWNER_APP_ORIGIN=https://abu-arandas.github.io`, so the owner app on GitHub Pages may call the API,
   - `DEMO_MODE=true` while payments are test payments only. A database stays in the mode it was first installed in, so going live later means a fresh database, and demo data never reaches customers.

   You do not make `OWNER_API_TOKEN`, `PAYMENTS_WEBHOOK_SECRET` or `SUPPLIER_WEBHOOK_SECRET`. The first deploy makes each one in the database, in `ops.secrets`, and the site reads them from there. A variable you set yourself wins, for example the webhook secret a live payment provider gives you. The example's `change-me` never counts on Vercel.
4. Deploy. Each production build runs `npm run db:deploy` first. It:
   - adds the Supabase roles and `auth.uid()` when the database is a plain PostgreSQL,
   - applies only the migrations the database has not had yet, records each one in `ops.applied_migrations`, and does it all in one transaction, so a failure changes nothing and the build stops,
   - installs the starting data, adding only what is missing, so the owner's own edits survive,
   - makes the owner token and webhook secrets once, when they are missing, and logs only their names.

   Preview builds skip it, so a preview never changes the live database.
5. For the owner app, set Pages to deploy from GitHub Actions in the repository settings. Each push to `main` that touches `apps/owner` publishes https://abu-arandas.github.io/arandastech/ through `.github/workflows/owner-web.yml`. Sign in there with the site's address and the owner token. To see the token, open the database's SQL editor (in Vercel: Storage, the database, Open in Neon, SQL Editor) and run `select value from ops.secrets where name = 'owner_api_token';`. To change it, set `OWNER_API_TOKEN` in Vercel and redeploy.

Free plans keep little or no backup history. Move the database to a paid plan before real customers pay.

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
| Move the database to a paid plan | Free plans keep little or no backup history. See "Put it live for free" for the rest. |
| Set the live payment provider's webhook secret and one token per department | The first deploy makes the owner token and stand-in webhook secrets. A live provider signs with its own secret, and each bot needs its own token. |
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
