import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:get/get.dart';

import 'config/brand.dart';
import 'controllers/owner_controller.dart';
import 'l10n/translations.dart';
import 'views/home_page.dart';
import 'views/sign_in_page.dart';

class OwnerApp extends StatelessWidget {
  const OwnerApp({required this.controller, super.key});

  final OwnerController controller;

  /// The Zirr house theme: denim and thread on cotton (night blue in the dark), Rubik, continuous corners and shadows
  /// tinted with ink. Selection uses a wash; the accent is kept for buttons that act.
  static ThemeData _theme(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final primary = dark ? Brand.denimDark : Brand.denim;
    final card = dark ? Brand.cardDark : Colors.white;
    final scheme = ColorScheme.fromSeed(seedColor: Brand.denim, brightness: brightness).copyWith(
      primary: primary,
      onPrimary: dark ? Brand.pageDark : Colors.white,
      secondary: dark ? Brand.threadDark : Brand.thread,
      onSecondary: Brand.ink,
      surface: dark ? Brand.pageDark : Brand.page,
      surfaceContainerLowest: card,
    );
    const corners = RoundedSuperellipseBorder(borderRadius: BorderRadius.all(Radius.circular(18)));
    const buttonCorners = RoundedSuperellipseBorder(borderRadius: BorderRadius.all(Radius.circular(14)));
    return ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      fontFamily: Brand.fontFamily,
      scaffoldBackgroundColor: scheme.surface,
      appBarTheme: AppBarTheme(
        backgroundColor: card,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(fontFamily: Brand.fontFamily, fontSize: 20, fontWeight: FontWeight.w600, color: scheme.onSurface),
      ),
      cardTheme: CardThemeData(
        color: card,
        surfaceTintColor: Colors.transparent,
        elevation: 1,
        shadowColor: Brand.ink.withValues(alpha: dark ? 0.6 : 0.25),
        shape: corners,
      ),
      dialogTheme: const DialogThemeData(shape: corners),
      filledButtonTheme: const FilledButtonThemeData(style: ButtonStyle(shape: WidgetStatePropertyAll(buttonCorners))),
      outlinedButtonTheme: const OutlinedButtonThemeData(style: ButtonStyle(shape: WidgetStatePropertyAll(buttonCorners))),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: card,
        border: const OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12))),
      ),
      navigationBarTheme: NavigationBarThemeData(backgroundColor: card, indicatorColor: primary.withValues(alpha: 0.14)),
    );
  }

  @override
  Widget build(BuildContext context) => GetMaterialApp(
    title: Brand.name,
    debugShowCheckedModeBanner: false,
    theme: _theme(Brightness.light),
    darkTheme: _theme(Brightness.dark),
    initialBinding: BindingsBuilder(() {
      Get.put(controller);
    }),
    translations: AppTranslations(),
    locale: controller.locale.value,
    fallbackLocale: const Locale('en'),
    supportedLocales: const [Locale('en'), Locale('ar')],
    localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
    home: Obx(() => controller.signedIn ? const HomePage() : const SignInPage()),
  );
}
