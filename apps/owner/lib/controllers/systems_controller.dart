import 'dart:convert';

import 'package:get/get.dart';

import '../models/alert.dart';
import '../models/audit.dart';
import '../models/connection.dart';
import '../models/settings.dart';
import '../services/platform.dart';
import 'session_controller.dart';

/// The outside accounts, the alerts, the owner's settings and the audit log.
class SystemsController extends GetxController implements PlatformReader {
  SystemsController(this._session);

  final SessionController _session;
  final connections = <Connection>[].obs;

  /// What each account said the last time it was saved or checked, by connection id.
  final connectionHealth = <String, ConnectionHealth>{}.obs;
  final alerts = <Alert>[].obs;
  final policy = <PolicySetting>[].obs;
  final rules = <StandingRule>[].obs;
  final memory = <KnowledgeItem>[].obs;
  final audit = const AuditLog().obs;

  @override
  Future<void Function()> read(Platform platform) async {
    final connectionsNow = await platform.systems.connections();
    final alertsNow = await platform.systems.alerts();
    final policyNow = await platform.systems.policy();
    final rulesNow = await platform.systems.rules();
    final memoryNow = await platform.systems.memory();
    final auditNow = await platform.company.audit();
    return () {
      connections.assignAll(connectionsNow);
      alerts.assignAll(alertsNow);
      policy.assignAll(policyNow);
      rules.assignAll(rulesNow);
      memory.assignAll(memoryNow);
      audit.value = auditNow;
    };
  }

  @override
  void clear() {
    connections.clear();
    connectionHealth.clear();
    alerts.clear();
    policy.clear();
    rules.clear();
    memory.clear();
    audit.value = const AuditLog();
  }

  Future<bool> resolveAlert(Alert alert, {bool acknowledgeOnly = false}) =>
      _session.act((p) => p.systems.resolveAlert(alert.id, acknowledgeOnly: acknowledgeOnly));

  /// Saves the values typed for one account. Empty boxes are left out, so a saved secret is never cleared by accident.
  Future<bool> saveConnection(Connection connection, Map<String, String> typed) {
    final values = {for (final e in typed.entries) e.key: e.value.trim()}..removeWhere((_, v) => v.isEmpty);
    if (values.isEmpty) {
      _session.error.value = 'Type at least one value.';
      return Future.value(false);
    }
    if (values.values.any((v) => RegExp(r'\s').hasMatch(v))) {
      _session.error.value = 'The value has a space in it. Copy it again without spaces.';
      return Future.value(false);
    }
    return _session.act((p) async => connectionHealth[connection.id] = await p.systems.saveConnection(connection.id, values));
  }

  Future<bool> checkConnection(Connection connection) =>
      _session.act((p) async => connectionHealth[connection.id] = await p.systems.checkConnection(connection.id));

  Future<bool> disconnect(Connection connection) {
    connectionHealth.remove(connection.id);
    return _session.act((p) => p.systems.disconnect(connection.id));
  }

  /// Google's sign-in page for the mailbox, or null when the platform refused.
  Future<String?> gmailSignIn() async {
    String? url;
    await _session.guard(() async => url = await _session.platform.value!.systems.gmailSignIn());
    return url;
  }

  Future<bool> togglePolicy(PolicySetting setting) => _session.act((p) => p.systems.setPolicy(setting.key, setting.value != true));

  /// Changes one value on the policy sheet. The text is read as the kind of value the setting already holds.
  Future<bool> setPolicy(PolicySetting setting, String text) {
    final current = setting.value;
    final trimmed = text.trim();
    final Object? value;
    if (current is bool) {
      value = trimmed == 'true';
    } else if (current is num || current == null) {
      final parsed = num.tryParse(trimmed);
      if (parsed == null && !(current == null && trimmed.isEmpty)) {
        _session.error.value = 'Write a number.';
        return Future.value(false);
      }
      // Amounts, shares and counts are whole numbers on the platform.
      if (parsed != null && (!parsed.isFinite || parsed < 0 || parsed != parsed.roundToDouble())) {
        _session.error.value = 'Write a whole number, 0 or more.';
        return Future.value(false);
      }
      value = parsed?.toInt();
    } else if (current is Map) {
      // A per-currency setting: each currency, like USD, with a whole amount in minor units, or null for no limit.
      Object? parsed;
      try {
        parsed = jsonDecode(trimmed);
      } on FormatException {
        parsed = null;
      }
      final fine =
          parsed is Map &&
          parsed.entries.every((e) => RegExp(r'^[A-Z]{3}$').hasMatch('${e.key}') && (e.value == null || (e.value is int && (e.value as int) >= 0)));
      if (!fine) {
        _session.error.value = 'Write each currency with its amount, like {"USD": 50000, "JOD": null}.';
        return Future.value(false);
      }
      value = parsed;
    } else {
      value = trimmed;
    }
    return _session.act((p) => p.systems.setPolicy(setting.key, value));
  }

  Future<bool> revokeRule(StandingRule rule) => _session.act((p) => p.systems.revokeRule(rule.id));

  Future<bool> approveMemory(KnowledgeItem item) => _session.act((p) => p.systems.approveMemory(item.key));
}
