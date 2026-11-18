# Zirr platform

Planning repository for the platform that runs Zirr (زِرّ): an owner-controlled AI company operating system for digital services and online commerce.

| Part                                       | What it is                                                                                                                                                                | Status                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Blueprint](docs/blueprint.md)             | The product and implementation plan, version 2.0                                                                                                                          | Written                                                          |
| [Agent team](agents/openmausbot/README.md) | The eight AI departments: they run inside the platform, and the same team can be installed in OpenMausBot                                                                 | Working on the live site, in manual mode until an AI key is set. |
| [Database](supabase/migrations)            | 39 tables with row-level security, an append-only audit log and a finance ledger                                                                                          | Built                                                            |
| [Platform services](packages/core)         | Rules engine, approvals, connector gateway, store, ledger, CRM, API and an MCP server for the bots                                                                        | Built on mock connectors. 99 tests pass.                         |
| [Storefront](apps/web)                     | The public site in Arabic and English: services, licenses, lead form, test checkout, order status                                                                         | Live in demo mode (test payments).                               |
| [Owner app](apps/owner)                    | The owner's dashboard and approval inbox, in Flutter: the full dashboard: today and metrics, approvals, team, customers, store, money, systems, settings, activity, pause | Live on GitHub Pages. 22 tests pass.                             |

**Motion and voice.** The storefront follows the Zirr house style for a shop: the title rises word by word, sections and
cards come in once as they scroll into view, cards lift and buttons give when pressed (CSS first, in
`apps/web/app/globals.css`, with a small script in `apps/web/app/_components/motion.tsx`). Checkout and payment stay calm.
An order paid gets one shower of confetti, a sent message a burst, the logo pressed five times on the home page rains
buttons, and the not-found page and the loader carry a kind line in Arabic and English. No jokes on prices, payment,
orders or errors, and with reduced motion nothing moves. The owner app is a work tool: screens fade through, the Today
figures count up once, and a cleared approvals inbox gets a tick that draws itself; money never moves.

See the [runbook](docs/runbook.md) for how to run it and what must happen before anything goes live.

The first build is the vertical slice in [§15 of the blueprint](docs/blueprint.md#15-first-build-the-vertical-slice). Going live waits on the owner decisions in [§20](docs/blueprint.md#20-owner-decisions).

## Commands

Install once:

```bash
npm install
```

Check the agent team files:

```bash
npm run agents:check
```

Run all tests (needs PostgreSQL 16, see the runbook):

```bash
npm test
```
