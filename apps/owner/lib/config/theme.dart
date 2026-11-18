import 'package:material_ui/material_ui.dart';

import 'brand.dart';

/// The Zirr house theme: denim and thread on cotton (night blue in the dark), Rubik, continuous corners and shadows
/// tinted with ink. Selection uses a wash; the accent is kept for buttons that act. A rebrand changes [Brand] and
/// keeps all of this.
class AppTheme {
  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
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
}
