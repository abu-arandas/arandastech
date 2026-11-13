import 'dart:ui' show Locale;

import 'package:get/get.dart';

import '../services/api.dart';

/// Builds the connection to a platform from its address and the owner token.
typedef Connector = PlatformApi Function(String baseUrl, String token);

/// Everything the owner sees: the overview, the requests waiting for a decision and the activity log.
class OwnerController extends GetxController {
  OwnerController({required Connector connector, Locale? preferred})
    : _connect = connector,
      locale = (preferred?.languageCode == 'ar' ? const Locale('ar') : const Locale('en')).obs;

  final Connector _connect;
  final Rx<Locale> locale;
  final Rxn<PlatformApi> api = Rxn<PlatformApi>();
  final Rxn<Json> overview = Rxn<Json>();
  final RxList<Json> approvals = <Json>[].obs;
  final RxList<Json> events = <Json>[].obs;
  final RxBool chainIntact = true.obs;
  final RxnString error = RxnString();
  final RxBool busy = false.obs;

  bool get signedIn => api.value != null;
  bool get paused => overview.value?['paused'] == true;

  void toggleLanguage() {
    final next = locale.value.languageCode == 'ar' ? const Locale('en') : const Locale('ar');
    Get.locale = next;
    locale.value = next;
    Get.rootController.update();
  }

  /// Signs in to a platform, or opens the demo when [demo] is true. Returns whether it worked.
  Future<bool> connect({String baseUrl = '', String token = '', bool demo = false}) async {
    final candidate = demo ? DemoApi() : _connect(baseUrl.trim().replaceFirst(RegExp(r'/+$'), ''), token.trim());
    // The home screen appears only after the platform has answered: a wrong token never shows it, even briefly.
    final ok = await _load(candidate);
    if (ok) api.value = candidate;
    return ok;
  }

  void signOut() {
    api.value = null;
    overview.value = null;
    approvals.clear();
    events.clear();
  }

  /// Runs [work] and records its error instead of throwing, so that a failed call never leaves a screen half drawn.
  Future<bool> _guard(Future<void> Function() work) async {
    busy.value = true;
    error.value = null;
    try {
      await work();
      return true;
    } on Object catch (e) {
      error.value = e is ApiError ? e.message : 'Could not connect. Check the address and the token.';
      return false;
    } finally {
      busy.value = false;
    }
  }

  Future<bool> reload() => _load(api.value!);

  Future<bool> _load(PlatformApi platform) => _guard(() async {
    overview.value = await platform.overview();
    approvals.assignAll(await platform.approvals());
    final log = await platform.audit();
    chainIntact.value = log['chain_intact'] == true;
    events.assignAll((log['events'] as List).cast<Json>());
  });

  /// Sends the owner's decision. A Level 3 approval must carry the amount and the recipient the owner typed.
  Future<bool> decide(Json request, String decision, {int? amountMinor, String? recipient}) async {
    final confirmation = amountMinor == null || recipient == null ? null : <String, dynamic>{'amount_minor': amountMinor, 'recipient': recipient};
    final sent = await _guard(() => api.value!.decide(request['id'] as String, decision, confirmation: confirmation));
    final shown = error.value;
    await reload();
    if (!sent) error.value = shown;
    return sent;
  }

  Future<void> setPaused({required bool value}) async {
    await _guard(() => value ? api.value!.pause() : api.value!.resume());
    await reload();
  }
}
