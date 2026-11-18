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

  /// The departments' state, from the Team screen.
  final Rxn<Json> team = Rxn<Json>();
  final RxList<Json> commands = <Json>[].obs;

  // Customers, store, systems and settings (blueprint 8.2).
  final RxList<Json> leads = <Json>[].obs;
  final RxList<Json> messages = <Json>[].obs;
  final RxList<Json> orders = <Json>[].obs;
  final RxList<Json> products = <Json>[].obs;
  final Rxn<Json> metrics = Rxn<Json>();
  final RxList<Json> connectors = <Json>[].obs;
  final RxList<Json> alerts = <Json>[].obs;
  final RxList<Json> policy = <Json>[].obs;
  final RxList<Json> rules = <Json>[].obs;
  final RxList<Json> memory = <Json>[].obs;

  /// When the screens were last filled from the platform, so every status shows how fresh it is.
  final Rxn<DateTime> loadedAt = Rxn<DateTime>();

  /// Whether the departments use the AI model now. Without a key they follow fixed rules at no cost.
  bool get aiOn => (team.value?['mode'] as Json?)?['mode'] == 'ai';

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
    team.value = null;
    commands.clear();
    for (final list in [leads, messages, orders, products, connectors, alerts, policy, rules, memory]) {
      list.clear();
    }
    metrics.value = null;
    loadedAt.value = null;
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
    team.value = await platform.team();
    commands.assignAll(await platform.commands());
    leads.assignAll(await platform.leads());
    messages.assignAll(await platform.inbox());
    orders.assignAll(await platform.orders());
    products.assignAll(await platform.catalog());
    metrics.value = await platform.metrics();
    connectors.assignAll(await platform.connectors());
    alerts.assignAll(await platform.alerts());
    policy.assignAll(await platform.policy());
    rules.assignAll(await platform.rules());
    memory.assignAll(await platform.memory());
    loadedAt.value = DateTime.now();
  });

  /// Runs one owner action, then shows the platform as it is afterwards. An error stays on screen.
  Future<bool> _act(Future<void> Function(PlatformApi platform) work) async {
    final ok = await _guard(() => work(api.value!));
    final shown = error.value;
    await reload();
    if (!ok) error.value = shown;
    return ok;
  }

  Future<bool> releaseOrder(Json order) => _act((p) => p.releaseOrder(order['id'] as String));

  /// The refund is only prepared here. It appears in Approvals, where the owner confirms the amount and the recipient.
  Future<bool> proposeRefund(Json order, String reason, {int? amountMinor}) {
    if (reason.trim().length < 3) {
      error.value = 'Write the reason for the refund.';
      return Future.value(false);
    }
    return _act((p) => p.proposeRefund(order['id'] as String, reason: reason.trim(), amountMinor: amountMinor));
  }

  Future<bool> resolveAlert(Json alert, {bool acknowledgeOnly = false}) =>
      _act((p) => p.resolveAlert(alert['id'] as String, acknowledgeOnly: acknowledgeOnly));

  /// Changes one value on the policy sheet. The text is read as the kind of value the setting already holds.
  Future<bool> setPolicy(Json setting, String text) {
    final current = setting['value'];
    final Object? value;
    final trimmed = text.trim();
    if (current is bool) {
      value = trimmed == 'true';
    } else if (current is num || current == null) {
      final parsed = num.tryParse(trimmed);
      if (parsed == null && !(current == null && trimmed.isEmpty)) {
        error.value = 'Write a number.';
        return Future.value(false);
      }
      value = parsed;
    } else {
      value = trimmed;
    }
    return _act((p) => p.setPolicy(setting['key'] as String, value));
  }

  Future<bool> togglePolicy(Json setting) => _act((p) => p.setPolicy(setting['key'] as String, setting['value'] != true));

  Future<bool> revokeRule(Json rule) => _act((p) => p.revokeRule(rule['id'] as String));

  Future<bool> approveMemory(Json item) => _act((p) => p.approveMemory(item['key'] as String));

  /// Asks Operations for a plan. Returns it, or null when the platform refused.
  Future<Json?> plan(String instruction) async {
    Json? planned;
    if (instruction.trim().length < 3) {
      error.value = 'Write what you want done, in a sentence.';
      return null;
    }
    await _guard(() async => planned = await api.value!.planCommand(instruction.trim()));
    if (planned != null) commands.insert(0, planned!);
    return planned;
  }

  /// The owner's go-ahead: the plan's tasks start. Anything that leaves the company still waits in Approvals.
  Future<bool> start(Json command) => _act((p) async => _replace(await p.startCommand(command['id'] as String)));

  Future<bool> refreshCommand(Json command) => _guard(() async => _replace(await api.value!.command(command['id'] as String)));

  /// Runs the work that is due now, then shows what changed.
  Future<bool> runDue() => _act((p) => p.runDue());

  void _replace(Json command) {
    final i = commands.indexWhere((c) => c['id'] == command['id']);
    if (i < 0) {
      commands.insert(0, command);
    } else {
      commands[i] = command;
    }
  }

  /// Sends the owner's decision. A Level 3 approval must carry the amount and the recipient the owner typed.
  Future<bool> decide(Json request, String decision, {int? amountMinor, String? recipient}) async {
    final confirmation = amountMinor == null || recipient == null
        ? null
        : <String, dynamic>{'amount_minor': amountMinor, 'recipient': recipient};
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
