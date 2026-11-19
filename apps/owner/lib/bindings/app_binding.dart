import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart' show Locale;

import '../config/brand.dart';
import '../controllers/approvals_controller.dart';
import '../controllers/business_controller.dart';
import '../controllers/sales_controller.dart';
import '../controllers/session_controller.dart';
import '../controllers/systems_controller.dart';
import '../controllers/team_controller.dart';
import '../services/platform.dart';
import '../services/sign_in_store.dart';

/// Registers the controllers. The only place that decides which platform the app runs on: main.dart passes the
/// real one over HTTP.
class AppBinding extends Bindings {
  AppBinding({required this.connect, required this.baseUrl, Locale? preferred, this.refreshEvery})
    : locale = Brand.locales.firstWhere((l) => l.languageCode == preferred?.languageCode, orElse: () => Brand.locales.first);

  final PlatformConnector connect;
  final String baseUrl;
  final Duration? refreshEvery;

  /// The language the app opens in: the device's, when the app speaks it.
  final Locale locale;

  @override
  void dependencies() {
    final session = Get.put(SessionController(connect: connect, baseUrl: baseUrl, locale: locale, store: SignInStore.device(), refreshEvery: refreshEvery));
    // Typed puts: inside the list, Dart would infer PlatformReader and register all five under that one type.
    final business = Get.put<BusinessController>(BusinessController(session));
    final sales = Get.put<SalesController>(SalesController(session));
    final approvals = Get.put<ApprovalsController>(ApprovalsController(session));
    final team = Get.put<TeamController>(TeamController(session));
    final systems = Get.put<SystemsController>(SystemsController(session));
    // Read in this order: the inbox is synced with the business share, before anything else shows it.
    session.readers.addAll([business, sales, approvals, team, systems]);
  }
}
