import 'package:flutter_localizations/flutter_localizations.dart' as legacy;
import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import 'config/brand.dart';
import 'controllers/owner_controller.dart';
import 'l10n/translations.dart';
import 'views/home_page.dart';
import 'views/sign_in_page.dart';
import 'views/widgets/motion.dart';

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
    initialBinding: BindingsBuilder(() {
      Get.put(controller);
    }),
    translations: AppTranslations(),
    locale: controller.locale.value,
    fallbackLocale: const Locale('en'),
    supportedLocales: const [Locale('en'), Locale('ar')],
    localizationsDelegates: const [
      // The material_ui delegates (they bring the Cupertino and Widgets ones too) for the pages...
      ...GlobalMaterialLocalizations.delegates,
      // ...and the old ones for the flutter/material app GetX 4.7.3 builds underneath. Remove with GetX's move.
      // ignore: deprecated_member_use
      legacy.GlobalMaterialLocalizations.delegate,
      // ignore: deprecated_member_use
      legacy.GlobalCupertinoLocalizations.delegate,
    ],
    // GetX 4.7.3 still builds a legacy (flutter/material) MaterialApp, so its theme: parameter cannot take a
    // material_ui ThemeData. The material_ui theme and snack-bar host are given to the pages here instead.
    builder: (context, child) => Theme(
      data: _theme(MediaQuery.platformBrightnessOf(context)),
      child: ScaffoldMessenger(child: child ?? const SizedBox.shrink()),
    ),
    // Signing in and out cross-fades between the two screens.
    home: Obx(
      () => AnimatedSwitcher(
        duration: Motion.medium,
        switchInCurve: Motion.enter,
        switchOutCurve: Motion.exit,
        child: controller.signedIn ? const HomePage(key: ValueKey('home')) : const SignInPage(key: ValueKey('sign-in')),
      ),
    ),
  );
}
