import 'package:material_ui/material_ui.dart';

import 'brand.dart';

/// The Zirr house theme, the same as Zirr Starter, Retail and Boutique: denim and thread on cotton (night blue in the
/// dark), Rubik a step light with titles a touch tight, corners that flow into their sides ([AppTheme.shape]), cards
/// with a hairline edge instead of a grey shadow, fields that show their edge under the pointer and turn white with a
/// ring when in use, pill buttons that rise a little on hover, and calm motion. Selection uses a wash; the accent is
/// kept for buttons that act. A rebrand changes [Brand] and keeps all of this.
class AppTheme {
  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  /// A rectangle whose corners flow into its sides (a superellipse) rather than a quarter circle stuck on.
  static RoundedSuperellipseBorder shape(double radius, {BorderSide side = BorderSide.none}) =>
      RoundedSuperellipseBorder(borderRadius: BorderRadius.all(Radius.circular(radius)), side: side);

  /// Figures that line up in columns: counts, money, dates.
  static const figures = [FontFeature.tabularFigures()];

  static const _fast = Duration(milliseconds: 160);

  static ThemeData _build(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final primary = dark ? Brand.denimDark : Brand.denim;
    final card = dark ? Brand.cardDark : Colors.white;
    final page = dark ? Brand.pageDark : Brand.page;
    final scheme = ColorScheme.fromSeed(seedColor: Brand.denim, brightness: brightness).copyWith(
      primary: primary,
      onPrimary: dark ? Brand.pageDark : Colors.white,
      secondary: dark ? Brand.threadDark : Brand.thread,
      onSecondary: Brand.ink,
      surface: page,
      surfaceContainerLowest: card,
      // The quiet fill of a field at rest: a shade of the page, not a grey.
      surfaceContainerHigh: dark ? const Color(0xFF1B2333) : const Color(0xFFEFECE4),
      outlineVariant: dark ? const Color(0xFF2A3448) : const Color(0xFFE2DED4),
      outline: dark ? const Color(0xFF3D4A63) : const Color(0xFFC9C2B2),
      shadow: Brand.ink,
    );

    final base = ThemeData(colorScheme: scheme, useMaterial3: true, fontFamily: Brand.fontFamily);
    // Titles semibold and a touch tight, as on the website; body text stays regular.
    TextStyle title(TextStyle s) => s.copyWith(fontWeight: FontWeight.w600, letterSpacing: -0.4);
    final text = base.textTheme.copyWith(
      headlineLarge: title(base.textTheme.headlineLarge!),
      headlineMedium: title(base.textTheme.headlineMedium!).copyWith(fontFeatures: figures),
      headlineSmall: title(base.textTheme.headlineSmall!),
      titleLarge: title(base.textTheme.titleLarge!),
      titleMedium: base.textTheme.titleMedium!.copyWith(fontWeight: FontWeight.w600),
      bodyLarge: base.textTheme.bodyLarge!.copyWith(height: 1.5),
      bodyMedium: base.textTheme.bodyMedium!.copyWith(height: 1.45),
      labelLarge: base.textTheme.labelLarge!.copyWith(fontWeight: FontWeight.w500),
    );

    OutlineInputBorder edge(Color color, [double width = 1]) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: color, width: width),
    );

    const buttonStyle = ButtonStyle(
      minimumSize: WidgetStatePropertyAll(Size(44, 46)),
      shape: WidgetStatePropertyAll(StadiumBorder()),
      animationDuration: _fast,
    );

    return base.copyWith(
      textTheme: text,
      scaffoldBackgroundColor: page,
      appBarTheme: AppBarTheme(
        backgroundColor: page,
        surfaceTintColor: Colors.transparent,
        // Flat on the page until something scrolls under it, then a soft ink shadow, not a grey tint.
        scrolledUnderElevation: 2,
        shadowColor: Brand.ink.withValues(alpha: dark ? 0.6 : 0.18),
        titleTextStyle: TextStyle(fontFamily: Brand.fontFamily, fontSize: 20, fontWeight: FontWeight.w500, letterSpacing: -0.2, color: scheme.onSurface),
        shape: Border(bottom: BorderSide(color: scheme.outlineVariant)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: WidgetStateColor.resolveWith((s) => s.contains(WidgetState.focused) ? card : scheme.surfaceContainerHigh),
        hoverColor: Colors.transparent,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: WidgetStateInputBorder.resolveWith((s) {
          final focused = s.contains(WidgetState.focused);
          if (s.contains(WidgetState.error)) return edge(scheme.error, focused ? 1.6 : 1);
          if (focused) return edge(scheme.primary, 1.6);
          if (s.contains(WidgetState.hovered) && !s.contains(WidgetState.disabled)) return edge(scheme.outline);
          return edge(Colors.transparent);
        }),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: buttonStyle.copyWith(
          shadowColor: WidgetStatePropertyAll(primary.withValues(alpha: 0.5)),
          elevation: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.hovered) && !s.contains(WidgetState.pressed) && !s.contains(WidgetState.disabled) ? 3 : 0,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: buttonStyle.copyWith(
          side: WidgetStateProperty.resolveWith(
            (s) => BorderSide(color: s.contains(WidgetState.hovered) || s.contains(WidgetState.focused) ? primary : scheme.outline),
          ),
        ),
      ),
      textButtonTheme: const TextButtonThemeData(style: buttonStyle),
      // Cards: a hairline edge and a soft ink shadow under it, corners that flow.
      cardTheme: CardThemeData(
        color: card,
        surfaceTintColor: Colors.transparent,
        elevation: 1,
        shadowColor: Brand.ink.withValues(alpha: dark ? 0.8 : 0.22),
        margin: const EdgeInsets.symmetric(vertical: 4),
        shape: shape(20, side: BorderSide(color: scheme.outlineVariant)),
      ),
      listTileTheme: ListTileThemeData(shape: shape(12)),
      dialogTheme: DialogThemeData(backgroundColor: card, surfaceTintColor: Colors.transparent, shape: shape(22)),
      snackBarTheme: SnackBarThemeData(behavior: SnackBarBehavior.floating, shape: shape(12)),
      chipTheme: ChipThemeData(
        shape: const StadiumBorder(),
        side: BorderSide(color: scheme.outlineVariant),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(color: scheme.inverseSurface, borderRadius: BorderRadius.circular(8)),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        textStyle: TextStyle(color: scheme.onInverseSurface, fontSize: 12.5),
        waitDuration: const Duration(milliseconds: 350),
      ),
      // Thin, and only as dark as it needs to be.
      scrollbarTheme: ScrollbarThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (s) => scheme.onSurfaceVariant.withValues(alpha: s.contains(WidgetState.hovered) || s.contains(WidgetState.dragged) ? 0.55 : 0.3),
        ),
        thickness: const WidgetStatePropertyAll(6),
        radius: const Radius.circular(8),
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1, thickness: 1),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: card,
        surfaceTintColor: Colors.transparent,
        indicatorColor: primary.withValues(alpha: 0.12),
        indicatorShape: const StadiumBorder(),
        labelTextStyle: const WidgetStatePropertyAll(TextStyle(fontFamily: Brand.fontFamily, fontSize: 12, fontWeight: FontWeight.w500)),
      ),
      // Tabs are pills: the chosen one sits in a denim wash, the rest are quiet words. No underline, no divider.
      tabBarTheme: TabBarThemeData(
        indicator: ShapeDecoration(
          color: primary.withValues(alpha: dark ? 0.18 : 0.1),
          shape: const StadiumBorder(),
        ),
        indicatorSize: TabBarIndicatorSize.tab,
        labelColor: primary,
        unselectedLabelColor: scheme.onSurfaceVariant,
        labelStyle: const TextStyle(fontFamily: Brand.fontFamily, fontWeight: FontWeight.w600),
        unselectedLabelStyle: const TextStyle(fontFamily: Brand.fontFamily, fontWeight: FontWeight.w400),
        dividerColor: Colors.transparent,
        dividerHeight: 0,
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
        splashFactory: NoSplash.splashFactory,
      ),
    );
  }
}
