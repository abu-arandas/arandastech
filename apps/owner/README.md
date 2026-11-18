# Owner app

The owner's dashboard and approval inbox for the Zirr platform, in Flutter. Arabic and English.

| Tab | What it shows |
|---|---|
| Today | Waiting approvals, leads, orders, inbox and alerts, and the metrics of the last 30 days with when they were counted |
| Approvals | Each waiting action with its level, payload preview and a warning when outside content prompted it |
| Team | Whether the departments use the AI model or manual mode, the morning briefing, what each department did today, and the command center: write what you want done, read the plan, press Go ahead |
| Business | Customers (the lead pipeline with scores, and the messages, flagged ones marked), Store (orders: release a held one, prepare a refund that waits in Approvals; the catalog) and Money (the cash waterfall per currency) |
| Systems | Health (alerts to mark as seen or resolve, each connector's honest status and when it last worked), Settings (the policy sheet, standing rules to revoke, business memory to approve) and Activity (the audit log) |

Anyone signed in can pause the agents. Only the owner can resume them. A Level 3 approval asks the owner to retype the amount and the recipient.

## Brand

The name, colours and font are in [`lib/config/brand.dart`](lib/config/brand.dart). The web page's title and icons are in `web/`, and the Android name and icons in `android/app/src/main/`.

## Structure

The Zirr house structure from Zirr Starter: models, services, controllers, bindings, views and widgets. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Run it

Every build belongs to one platform, named at build time. There is no demo mode. Start the site (`npm run dev -w @zirr/web`), then:

```bash
flutter run -d chrome --dart-define=PLATFORM_URL=http://localhost:3000
```

Sign in with the platform's `OWNER_API_TOKEN`. When the app runs in a browser, set `OWNER_APP_ORIGIN` on the site to the app's address. On the hosted site the first deploy makes the token; `docs/runbook.md` ("Put it live for free") says where to read it. The Pages build is made with `--dart-define=PLATFORM_URL=https://zirr-platform-ehab-arandas.vercel.app`.

## Check it

```bash
dart format --output=none --set-exit-if-changed lib tool
flutter analyze
tool/check_layers.sh
node tool/check_arabic.mjs
flutter build web --release --wasm --dart-define=PLATFORM_URL=https://zirr-platform-ehab-arandas.vercel.app
```

There are no app tests, as in every Zirr app. The rules the owner relies on (approvals, levels, standing rules, the pause) are checked and tested on the platform, in `packages/core`.

## Not built yet

- The token is kept in memory only. Signing in again is needed after a restart.
- Sign-in with a Supabase account and two-step sign-in.
- Push notifications for new approvals.
- An iOS project. Android and web are set up.
