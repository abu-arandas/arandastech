# Architecture

The owner app follows the Zirr house structure from [Zirr Starter](https://github.com/abu-arandas/zirr-starter), so a reviewer who has read one Zirr app can find their way around this one. Where it differs, this file says so and why.

## Folders

```
lib/
  main.dart        startup only: read the platform address, run the app (no address: the startup problem)
  app.dart         GetMaterialApp: theme, translations, routes, the startup-problem screen
  config/
    brand.dart     the rebrand file: name (EN/AR), colours, font, languages
    env.dart       PLATFORM_URL from --dart-define; required
    theme.dart     light and dark themes from the brand colours, in the house style
    breakpoints.dart  Bootstrap's 576/768/992/1200/1400 breakpoints, GridContainer, GridRow, GridCol
    routes.dart    route names and pages
  models/          plain Dart records: immutable, read from the platform's JSON, nothing else (money.dart formats amounts)
  services/        every read and write: an interface per area and its HTTP version, over platform_client.dart
  controllers/     GetX controllers: session (sign-in, language, pause, refresh), approvals, team, business, systems
  bindings/        GetX dependency injection: the one place that picks the platform
  views/           pages, one folder per feature: auth, dashboard, today, approvals, team, business, systems
  widgets/         UI shared by more than one feature: motion, the brand mark, the language button, page layout
  l10n/            Arabic for every English text; English text is its own key
tool/              check_layers.sh (rules 1 and 3), check_arabic.mjs (rule 6)
```

## Rules

1. **`lib/models` and `lib/services` import neither GetX nor Flutter.** They are plain Dart (`package:http`), so state management can change without touching how records are read and written. `tool/check_layers.sh` fails the build on a stray import.
2. **Controllers depend on service interfaces, never on HTTP.** `AppBinding` decides the implementation, and `main.dart` hands it the HTTP one (`Platform.http`).
3. **Real data only.** Every build talks to a real platform, named at build time with `--dart-define=PLATFORM_URL=...`. There is no demo mode and no sample data in the app; a build without the address shows why it cannot start. `tool/check_layers.sh` fails on a stand-in class (`Memory*`, `Demo*`, `Fake*`, `Sample*`, `Mock*`) in `lib`.
4. **The platform is the security boundary.** The app holds only the owner token, typed at sign-in and kept in memory. Every rule (who may approve, what needs Level 3, what a standing rule allows) is checked on the platform, which has its own tests in `packages/core`.
5. **No secrets in git.** The address comes from `--dart-define`; the token is typed.
6. **Every text is translated.** Write English and look it up with `.tr`; add the Arabic to `lib/l10n/ar.dart`. `node tool/check_arabic.mjs` fails when one is missing. Use start/end, never left/right, so Arabic mirrors.
7. **Brand values come from `config/brand.dart`,** never from string literals in views.
8. **Long lists are built lazily** (the audit log uses `ListView.builder`).
9. **Errors become messages.** Controllers catch failures and set an `error` the screen shows; nothing the owner does should crash a page.
10. **CI is the bar:** `dart format`, `flutter analyze` with zero issues under the house rules in `analysis_options.yaml`, the layer and Arabic checks, and a web build. There are no app tests, as in every Zirr app.

## How a screen gets its data

`SessionController` owns sign-in and the refresh. Each feature controller (approvals, team, business, systems) is a `PlatformReader`: it reads its share from the platform and hands back how to show it. The session reads every share first and shows them together, and only if the owner is still signed in and did nothing in the meantime. A sign-out or an action during a read never brings older data back on screen. A background refresh runs every minute and never clears an error or interrupts an action.

## Where it differs from the Starter

- **No Supabase and no `supabase/` folder.** The owner app talks to the platform's API (`apps/web`), and the platform holds the database (`supabase/migrations` at the repository root, with its SQL checks run by `packages/core`).
- **Sign-in is the owner token**, not an email and password: the platform makes the token on its first deploy (`docs/runbook.md`).
