# Arandas Tech

Planning repository for the Arandas Tech platform: an owner-controlled AI company operating system for digital services and online commerce.

| Part | What it is | Status |
|---|---|---|
| [Blueprint](docs/blueprint.md) | The product and implementation plan, version 2.0 | Written |
| [Agent team](agents/openmausbot/README.md) | The eight AI departments as a team for OpenMausBot | Built. Not yet applied to a running app. |
| [Database](supabase/migrations) | 38 tables with row-level security, an append-only audit log and a finance ledger | Built and applied to a local PostgreSQL |
| Platform services | The rules engine, approvals, connector gateway, commerce and finance | In development |
| Storefront and owner app | The public site and the owner's dashboard | Planned |

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
