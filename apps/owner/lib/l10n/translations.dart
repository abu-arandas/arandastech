import 'package:get/get.dart';

import 'ar.dart';

/// The app's text in each language GetX can switch to.
class AppTranslations extends Translations {
  @override
  Map<String, Map<String, String>> get keys => {'en': const {}, 'ar': ar};
}
