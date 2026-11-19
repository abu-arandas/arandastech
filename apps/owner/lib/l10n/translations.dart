import 'package:get/get.dart';

import 'ar.dart';
import 'ar_fun.dart';
import 'ar_sales.dart';

/// The app's text in each language GetX can switch to.
class AppTranslations extends Translations {
  @override
  Map<String, Map<String, String>> get keys => {
    'en': const {},
    'ar': {...ar, ...arSales, ...arFun},
  };
}
