import 'package:flutter/painting.dart' show Color;

/// Everything a rebrand changes in the Dart code, in one place. The web page's title and icons are in web/index.html
/// and web/manifest.json, the Android name in android/app/src/main/AndroidManifest.xml.
class Brand {
  /// The company's name in English, also the translation key for [nameAr]. Zirr (زِرّ) is "button": the one on a
  /// shirt and the one on a screen.
  static const name = 'Zirr';

  /// The name as the logo spells it, next to the mark: all lower case in English, [nameAr] in Arabic.
  static const wordmark = 'zirr';

  /// The company's name in Arabic.
  static const nameAr = 'زِرّ';

  /// Denim: buttons, links and the mark. The palette is made from it.
  static const denim = Color(0xFF2B4C8C);

  /// Thread orange: the lit hole of the mark and the stitch. Dark text on it, never white.
  static const thread = Color(0xFFEE7B30);

  /// Denim and thread as they read on the dark theme's night blue.
  static const denimDark = Color(0xFF8EAEF0);
  static const threadDark = Color(0xFFFF9F5A);

  /// The page: cotton white, or night blue in the dark. Cards sit on white, or on [cardDark].
  static const page = Color(0xFFF7F5F0);
  static const pageDark = Color(0xFF0D121C);
  static const cardDark = Color(0xFF151C2A);

  /// Indigo ink for text, and for the tint of shadows.
  static const ink = Color(0xFF18202E);

  /// One font for Arabic and Latin text, bundled in assets/fonts and declared in pubspec.yaml.
  static const fontFamily = 'Rubik';
}
