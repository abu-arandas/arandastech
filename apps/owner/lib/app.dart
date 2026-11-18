import 'package:flutter_localizations/flutter_localizations.dart' as legacy;
import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import 'bindings/app_binding.dart';
import 'config/brand.dart';
import 'config/routes.dart';
import 'config/theme.dart';
import 'l10n/translations.dart';

class OwnerApp extends StatelessWidget {
  const OwnerApp({required this.binding, super.key});

  final AppBinding binding;

  @override
  Widget build(BuildContext context) => GetMaterialApp(
    title: Brand.name,
    debugShowCheckedModeBanner: false,
    initialBinding: binding,
    translations: AppTranslations(),
    locale: binding.locale,
    fallbackLocale: const Locale('en'),
    supportedLocales: Brand.locales,
    localizationsDelegates: const [
      // The material_ui delegates (they bring the Cupertino and Widgets ones too) for the pages...
      ...GlobalMaterialLocalizations.delegates,
      // ...and the old ones for the flutter/material app GetX 4.7.3 builds underneath. Remove with GetX's move.
      // ignore: deprecated_member_use
      legacy.GlobalMaterialLocalizations.delegate,
      // ignore: deprecated_member_use
      legacy.GlobalCupertinoLocalizations.delegate,
    ],
    initialRoute: Routes.home,
    getPages: appPages,
    // GetX 4.7.3 still builds a legacy (flutter/material) MaterialApp, so its theme: parameter cannot take a
    // material_ui ThemeData. The material_ui theme and snack-bar host are given to the pages here instead.
    builder: (context, child) => Theme(
      data: MediaQuery.platformBrightnessOf(context) == Brightness.dark ? AppTheme.dark() : AppTheme.light(),
      child: ScaffoldMessenger(child: child ?? const SizedBox.shrink()),
    ),
  );
}

/// Shown instead of the app when the build cannot start, with the reason.
class StartupProblem extends StatelessWidget {
  const StartupProblem(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(message, textAlign: TextAlign.center),
        ),
      ),
    ),
  );
}
