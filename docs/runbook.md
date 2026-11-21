# Runbook

How to run, check and connect what is in this repository. The plan it implements is the [blueprint](blueprint.md).

## What exists today

| Part                       | Where                          | Status                                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent team for OpenMausBot | `agents/openmausbot`           | The departments run inside the platform (`packages/core/src/agents`), from the same souls and skills. The OpenMausBot team is checked by `npm run agents:check` and not yet imported into a running OpenMausBot.                        |
| Database schema            | `supabase/migrations`          | Built, five migrations. Live on a free Neon PostgreSQL, applied by `npm run db:deploy` on each production build.                                                                                                                        |
| Platform services and API  | `packages/core`                | Built. 127 tests pass, including the nine-step acceptance run of blueprint §15 and the departments' jobs.                                                                                                                               |
| MCP server for the bots    | `packages/core/src/api/mcp.ts` | Built and tested through the API. Not yet tried from a real MCP client.                                                                                                                                                                 |
| Public site and storefront | `apps/web`                     | Live at https://zirr-platform-ehab-arandas.vercel.app (Vercel project `zirr-platform`) in demo mode: Arabic and English, lead form, test checkout, order status. Payments are test payments only.                                       |
| Owner app (Flutter)        | `apps/owner`                   | Live on GitHub Pages at https://abu-arandas.github.io/arandastech/. Arabic and English. Zirr Starter structure. Each build names its platform (`PLATFORM_URL`); sign-in takes the owner token. No demo mode. Not released to any store. |
| Live connectors            | none                           | Built for Gmail, GitHub, Vercel, Buffer, WhatsApp and PayTabs. Each stays a mock until the owner saves its keys in the owner app (Systems, Connections).                                                                                |

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

Lint, formatting and types, as CI runs them:

```bash
npm run lint
npm run deadcode
npm run format
npm run typecheck
```

Keeping the code readable: lint fails on a file over 800 lines or a function over 120, and `npm run deadcode` (knip) fails on an unused file, export or dependency. Split a long function into named steps rather than raising the limit.

`npm run format` only checks. To fix the files, run `npx prettier --write "**/*.{ts,tsx,mjs,json,md,css}"`. The agent team's Markdown is left as written, because `zirr.md` is built from it.

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

   To go from demo to live mode on the same database, set `DEMO_MODE=false` and `RESET_DEMO_DATABASE=yes` for Production, then deploy. The deploy empties the demo database (test orders, sample data, the old owner token and every saved connection), installs it again in live mode and makes a new owner token. It only ever empties a database that is in demo mode, so leaving the variable set is harmless. In live mode:
   - the products start as drafts and the shop is empty: put each one on sale from the owner app (Business, Store), and confirm it in Approvals,
   - checkout is closed, with a pointer to the contact form, until PayTabs is connected,
   - the test tools under `/api/demo/` are gone,
   - `OWNER_USER_ID` is put on the team, so the owner token signs in (`OWNER_EMAIL` names its email address, if set).

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

## Hardening and metrics

- **Prompt-injection suite** (`packages/core/test/hardening.test.ts`): ten attacks in English and Arabic go through the inbox on every test run. None may send anything, every reply may only go back to its sender, and a flagged message gets a draft at most (blueprint 10.2 and 17).
- **Metrics** (`GET /api/owner/metrics?days=30`): the numbers of blueprint 18, counted from the records at the moment of the request, with the time they were counted. The owner app shows them on Today.
- **Alerts**: `POST /api/owner/alerts/:id/resolve` with `{"status": "acknowledged"}` or `{"status": "resolved"}`, written to the audit log.

## The departments at work

The eight departments of blueprint §7 run inside the platform. Each one does real work from the platform's own data and
proposes every outside step to the gateway, so the levels and approvals above still hold.

| Department  | What it does, and when                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sales       | Scores each new lead and writes the first reply from the lead form, as an email for your approval (a flagged message only gets a draft). Runs on each new lead. Prospects you added never get this reply: they get the outreach emails.                             |
| Support     | Sorts each email and WhatsApp message, answers from the approved FAQ for your approval, and raises an alert for legal, refund or urgent ones. Runs on each one, and once a day sweeps up any message still waiting. A lead's own reply is left to Sales and to you. |
| Operations  | The morning briefing in English and Arabic every day, with the month against the revenue goal and what Sales did toward it; it shows on Today in the owner app. Also the plans of the command center.                                                               |
| Finance     | The money status from the ledger. Only you can move money.                                                                                                                                                                                                          |
| Commerce    | Every day: checks every price against the margin floor in the policy sheet, and opens an alert (once a day) for any price under it.                                                                                                                                 |
| Security    | Every day: flagged messages, failing connectors and background jobs that gave up, each as an alert once a day. It pauses a connector that keeps failing; only you can end a pause.                                                                                  |
| Marketing   | Drafts social posts in Buffer, from the command center. Publishing waits for you.                                                                                                                                                                                   |
| Engineering | Files a GitHub issue, from the command center. In a public repository it waits for you.                                                                                                                                                                             |

The **command center** is in the owner app's Team tab, and at `POST /api/owner/commands`. Write what you want done; Operations
shows the plan, with each task's department, connector and approval, and nothing runs until you press Go ahead.

Work runs right after the request that caused it (a new lead, a message, your go-ahead), in the same Vercel function, and once a
day from the Vercel cron in `apps/web/vercel.json`. Every run is in `agent_runs`, with its cost.

**Manual mode, at no cost.** With no AI key, the departments follow fixed rules and the approved templates in
`packages/core/src/company.ts`: replies, answers, briefings and checks all work, and nothing is spent. Plans come from fixed
rules too, and free-form tasks are skipped and say so.

**With an AI key.** The departments write with Claude (the latest Opus model unless `AGENT_MODEL` says otherwise), read their
soul and skills from `agents/openmausbot`, and stop at the caps in the policy sheet: `ai.daily_cap_micros` (1 US dollar a day),
`ai.monthly_cap_micros` (10 a month) and `ai.run_cap_micros` (0.25 a run). At a cap they go back to manual mode and raise an
alert. The Claude API is billed by Anthropic and has no free plan, so this is the one part that costs money. To turn it on:

1. Make a key at https://console.anthropic.com (Settings, API keys) and set a monthly spend limit there too.
2. Put it in Vercel: project `zirr-platform`, Settings, Environment Variables, `ANTHROPIC_API_KEY`, Production. Or in the
   database's SQL editor: `insert into ops.secrets (name, value) values ('anthropic_api_key', '<the key>');`.
3. Redeploy. The Team tab then says the departments use the AI model.

To switch it off again without removing the key, set `ai.enabled` to false in the policy sheet.

**The bots in OpenMausBot or Claude.** Instead of a key, the same team can run on your own Claude subscription through the
MCP server at `/api/mcp`. The first deploy makes one token per department in `ops.secrets` (`agent_token:sales` and so on);
read them in the SQL editor with `select name, value from ops.secrets where starts_with(name, 'agent_token:');`.

## The revenue engine

The goal is in the policy sheet: `revenue.monthly_goal_minor` (3,000 US dollars a month to start). The owner app's
**Sales** tab, and the top of **Today**, show the month in Amman time: what is collected (paid invoices and paid orders,
the dinar at its peg), what is invoiced and not paid, the proposals waiting, the deals still needed at the usual deal
size (`revenue.average_deal_minor` until five invoices are paid), and what those deals take in proposals, calls, replies
and first emails. The funnel starts at 5% replies, 50% calls, 60% proposals and 30% wins, and is measured from the
records once there are 20 contacted leads and 5 proposals in 90 days.

| Step        | What happens                                                                                                                                                                                                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prospects   | The owner adds businesses (Sales, Add prospects, or `POST /api/owner/prospects`). An agency gets the `outreach` sequence, a shop, café or restaurant `outreach_shop`. Each gets a fit score (website, address on its own domain, region, app work in the notes, a deal value) with its reasons.                                                          |
| Outreach    | Every morning at 08:00 in Amman, Sales writes the next email of each sequence from the approved templates, at most `sales.daily_send_limit`, best-fitting prospects first. The intro asks a one-line question, the follow-up 4 to 5 days later offers a small first job and the booking link, and the last email a week later asks who else to write to. |
| Reply       | An email from a lead stops their outreach. "No thanks" in English or Arabic marks them do-not-contact for good. Any other reply raises an alert and gets the booking link (`sales.booking_link`).                                                                                                                                                        |
| Call booked | A Google Calendar booking notice that names a lead moves them to "Call booked". The owner can move any lead by hand.                                                                                                                                                                                                                                     |
| Proposal    | The owner writes it in the app; Sales emails its secret link (`/en/p/<token>`). One reminder after 3 days. The client accepts by typing their name.                                                                                                                                                                                                      |
| Invoice     | Accepting raises the deposit invoice (`billing.deposit_bps`) and Sales emails it (`/en/i/<token>`, with `billing.payment_instructions`). Two reminders after the due date, a week apart.                                                                                                                                                                 |
| Paid        | The owner marks it paid (bank, CliQ, PayPal, cash). It is posted to the services books, the client is thanked, and check-ins follow after 2 weeks and 2 months. A Gumroad sale is recorded as paid.                                                                                                                                                      |

**Autopilot.** By default every sales email waits in Approvals. The Sales tab's autopilot switch makes one standing rule,
"Sales autopilot", for the sales templates, up to the daily limit, for `rules.max_lifetime_days`; turn it on again to
renew it. It sends only an email whose words are an approved template with its blanks filled in (`fitsTemplate`), so no
other wording can use it. Answers to a lead's reply read outside content, so they always wait for the owner. An email
that lapses in Approvals is proposed again the next morning; one the owner rejects stops that lead's sequence.

**Lead scores.** A website lead is scored by fixed rules in `packages/core/src/crm/scoring.ts`: a package, detail, a
named budget, a timeline, urgency, app work, a company address and a phone add points; selling us a service, a job
application, a throwaway address, a message of links or a few words take them away. With an AI key, the assistant's
score is averaged with the rules, and the rules alone decide for spam and job seekers. 60 and over is qualified.

**New wording.** On each deploy, a template that is still a draft takes the latest wording from the code. An approved
template, or one a department rewrote, is never changed.

**Deliverability.** A mail server's failure notice ("Delivery Status Notification", "Undeliverable") marks each
address it names that Sales wrote to as bounced and do-not-contact, and goes to nobody. Every sequence email carries an
unsubscribe link (`/en/u/<token>`, where a button stops the emails, since opening the link alone changes nothing) and
the `List-Unsubscribe` one-click header, which posts to `/api/public/unsubscribe/<token>`. While more than 5% of the
addresses written to in two weeks bounced (from 20 addresses on), the daily limit is halved and Security raises an
alert once a day.

**Keys that expire.** GitHub, Vercel and Buffer take an optional "Expires on" date in Connections. A week before it,
Security raises an alert once a day.

**The Sunday report.** On Sundays in Amman, with Gmail live, the morning briefing also goes to the owner's own mailbox
(`gmail.notify_owner`, Level 1: it can reach no one else), in English and Arabic with a link to the owner app.

**A/B tests.** A template can have a version B, named with `.b` after its key (`prospect-intro.b`, `shop-intro.b`).
While the owner has approved both, half the leads get version B, by their id (`packages/core/src/crm/ab-tests.ts`). A
reply counts for the last email the lead got before replying. Once each version has gone to 40 people, the one with the
higher reply rate (A on a tie) is kept in `template_tests` and sent from then on; the briefing shows each test's replies. A version B left as a
draft changes nothing. The autopilot covers both versions, but only from the next time it is switched on.

**The weekly research file.** Sales, Add prospects, takes the file pasted whole: a CSV or tab-separated sheet whose first
line names the columns (`name,email,company,country,audience,locale,website,notes`; values with commas in double
quotes, lines starting with `#` skipped). Without that header line, the order is name, email, company, country,
audience. Addresses already in the pipeline or that asked not to be written to are skipped and listed.

**Search pages.** The site has a guide per question a buyer searches for (`/en/guides`, `/ar/guides`, words in
`apps/web/lib/guides-content.ts`), a compare page, a sitemap (`/sitemap.xml`, linked from `robots.txt`) with each page's
Arabic or English twin, and schema.org data for the products and their prices. Add a guide by adding an entry there:
its test checks the Arabic, the description length and the links. Submit the sitemap once in Google Search Console.

**The free trial.** `/en/trial` and `/ar/trial` take a shop's name, kind, city and contact. The lead comes in with
source `trial`, and Sales answers with the `trial-welcome` email (the setup call link; it waits in Approvals like every
answer to a website form). Once the till is installed, mark the lead **Won**: its plan starts from the policy sheet,
free for `billing.trial_days`, then billed `billing.trial_plan_price`, `billing.trial_plan_every` (once, month or
year; today 299 JOD once, as the shop emails say). Cancel the plan in Sales if the shop says no before the trial ends.

**Plans.** Sales, a lead, **Start a plan** bills an amount once, every month or every year, after optional free days
(`packages/core/src/crm/plans.ts`). Each morning Sales raises the invoices that fall due and emails them; the usual two
reminders follow (due day and a week later); 14 days after the due date the plan goes **on hold**, the client gets one
polite `plan-on-hold` note and the owner an alert. A plan on hold raises no invoices. Marking the late invoice paid
brings it back on its usual day (the months on hold are not billed); **Resume** does it without the payment. Payment is
by bank or CliQ for now, marked paid in one tap; card payments come with PayTabs.

**Heartbeat.** `.github/workflows/heartbeat.yml` calls `/api/cron/agents` every 30 minutes, so new mail is read and
answered within half an hour. The daily jobs still run once a day.

## Connecting the real accounts

The owner app's **Systems, Connections** lists each outside account with its steps and the addresses to copy into the
provider. A key is typed once: it goes into `ops.secrets` as `connector:<id>:<field>` and the API never returns it,
not even to the owner. When every value a connector needs is saved, it goes live at once and is checked against the
provider; **Disconnect** puts the mock back. Each live call is made once per idempotency key (`connector_calls`).

| Account  | What the owner pastes                                           | Found or made by the platform                                     |
| -------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| Gmail    | Google OAuth client ID and secret, then Sign in with Google     | The refresh token and the mailbox address                         |
| GitHub   | A fine-grained token (Issues, Pull requests, Contents)          | Nothing else                                                      |
| Vercel   | An access token                                                 | The team                                                          |
| Buffer   | A personal API key                                              | The Facebook and LinkedIn channels                                |
| WhatsApp | Phone number ID, a permanent system-user token, the app secret  | The webhook verify token; the webhook is `/api/webhooks/whatsapp` |
| PayTabs  | Profile ID and server key (region `jor` by default)             | The callback is `/api/webhooks/paytabs`                           |
| Gumroad  | The shop address and the products to count (seller ID optional) | The secret ping address `/api/webhooks/gumroad/<key>`             |

- New mail is read when the owner app refreshes (at most once a minute) and by the daily cron run, then Support answers it.
  Publish the Google app (Google Auth Platform, Publish app) so the sign-in does not expire after 7 days; with only the
  owner signing in, Google shows an "unverified app" notice that can be passed.
- With PayTabs connected, the storefront sends buyers to PayTabs' own card page and only a callback signed with the server
  key marks an order paid; the test payment is refused. Test keys take test cards; live keys come after PayTabs approves
  the merchant account.
- In demo mode a standing rule never acts through a live account, because anyone can place an order there: each send
  waits in Approvals.
- **Gumroad** only receives. Paste the ping address into Gumroad (Settings, Advanced, Ping) and press Send test ping;
  the test is written to the audit log and records nothing. Each real sale of a listed product becomes a paid invoice
  (`paid_via` gumroad) in the services books, the buyer becomes a client and gets the check-ins after 2 weeks and 2
  months, unless they told Gumroad not to contact them. A repeated ping changes nothing (`gumroad_sales`). Gumroad sends
  the receipt and the file itself. While card checkout is closed, a listed product's checkout page sends the buyer to
  its Gumroad page. A refund on Gumroad is not pinged: void or refund it in the owner app.
- WhatsApp free-form replies reach a customer only within 24 hours of their last message (Meta's rule).

## Before anything goes live

These are the owner's steps. Nothing here has been done.

| Step                                                                                             | Why                                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Decide the Phase 0 items in blueprint §20                                                        | Markets, payment route and launch budget block everything else                                                                            |
| Move the database to a paid plan                                                                 | Free plans keep little or no backup history. See "Put it live for free" for the rest.                                                     |
| Set the live payment provider's webhook secret                                                   | The first deploy makes the owner token, one token per department and stand-in webhook secrets. A live provider signs with its own secret. |
| Set the real payment fee in the policy sheet                                                     | Margins are calculated from it. It starts at zero.                                                                                        |
| Connect each account in the owner app (Systems, Connections)                                     | Each connector is a mock until its keys are saved there                                                                                   |
| Review the email templates and the Arabic marked "new wording" in `packages/core/src/company.ts` | They reach customers                                                                                                                      |
| Add the MCP server to OpenMausBot (Plugins, MCP servers, Add server) with each bot's own token   | So that bots act through the gateway                                                                                                      |

## Known limits

- Demo mode (`demo: true`) seeds a demo owner, approved sample data and a test product. Never use it with live accounts.
- The store sells digital and physical products in separate orders.
- Authentication accepts an owner token or a Supabase JWT signed with a shared secret. Two-step sign-in is not built yet.
- The owner app keeps the owner token in memory only and has no push notifications yet. See `apps/owner/README.md`.
- Rate limits count per visitor address (hashed): 5 lead messages, 10 checkouts (test payments included) and 20 order lookups per 10 minutes, and 20 failed sign-ins per 15 minutes, after which even the right token waits. A refusal says how long to wait (`retry-after`).
- In demo mode the test tools that show what was "sent" to customers or that stand in for the outside world (`/api/demo/deliveries`, `inbound-email`, `settle`, `supplier`) need the owner token. Only the storefront's test payment (`/api/demo/pay`) is open to visitors.
- Every page carries a content security policy and the usual browser protections (`apps/web/next.config.ts`): nothing loads from, frames or receives forms for another site. `robots.txt` keeps search engines away in demo mode and off `/api/` always.
- Policy settings accept only known keys and whole numbers; a per-currency setting is a map like `{"USD": 50000, "JOD": null}`, which the owner app now edits too. They live in `rate_limits` and `packages/core/src/lib/rate-limit.ts`. Put the API behind the host's own protection as well before launch.
