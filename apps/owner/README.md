# Owner app

The owner's dashboard and approval inbox for the Arandas Tech platform, in Flutter. Arabic and English.

| Tab | What it shows |
|---|---|
| Today | Waiting approvals, open leads, orders and whether the agents are paused |
| Approvals | Each waiting action with its level, payload preview and a warning when outside content prompted it |
| Money | Revenue, costs and margin from the ledger |
| Activity | The audit log, newest first |

Anyone signed in can pause the agents. Only the owner can resume them. A Level 3 approval asks the owner to retype the amount and the recipient.

## Run it

"Open the demo" on the sign-in page uses sample data inside the app and needs no server.

```bash
flutter run -d chrome
```

To sign in to a real platform, start the site (`npm run dev -w @arandas/web`), then enter its address and the `OWNER_API_TOKEN`. When the app runs in a browser, set `OWNER_APP_ORIGIN` on the site to the app's address.

## Check it

```bash
flutter analyze
```

```bash
flutter test --coverage
```

```bash
sh tool/check_coverage.sh 60
```

The live test runs the app's real client against a running platform in demo mode. It is not part of `flutter test`:

```bash
API_URL=http://localhost:3100 OWNER_TOKEN=your-token flutter test integration/live_api_test.dart
```

## Not built yet

- The token is kept in memory only. Signing in again is needed after a restart.
- Sign-in with a Supabase account and two-step sign-in.
- Push notifications for new approvals.
- An iOS project. Android and web are set up.
