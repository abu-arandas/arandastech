import '../models/alert.dart';
import '../models/connection.dart';
import '../models/json.dart';
import '../models/settings.dart';
import 'platform_client.dart';

/// The outside accounts, the alerts, and the owner's settings: the policy sheet, standing rules and business memory.
abstract interface class SystemsService {
  /// Which values each account has saved (never the secret ones), its steps and the addresses to copy.
  Future<List<Connection>> connections();

  /// Saves what the owner typed. The answer says whether the account answered.
  Future<ConnectionHealth> saveConnection(String id, Map<String, String> values);
  Future<ConnectionHealth> checkConnection(String id);
  Future<void> disconnect(String id);

  /// Google's sign-in page for the mailbox.
  Future<String> gmailSignIn();
  Future<List<Alert>> alerts();
  Future<void> resolveAlert(String id, {bool acknowledgeOnly = false});
  Future<List<PolicySetting>> policy();
  Future<void> setPolicy(String key, Object? value);
  Future<List<StandingRule>> rules();
  Future<void> revokeRule(String id);
  Future<List<KnowledgeItem>> memory();
  Future<void> approveMemory(String key);
}

class HttpSystemsService implements SystemsService {
  HttpSystemsService(this._client);

  final PlatformClient _client;

  ConnectionHealth _health(Json answer) => ConnectionHealth.fromJson(jsonMap(answer['health']));

  @override
  Future<List<Connection>> connections() async => (await _client.list('/api/owner/connections', 'connections')).map(Connection.fromJson).toList();

  @override
  Future<ConnectionHealth> saveConnection(String id, Map<String, String> values) async =>
      _health(await _client.send('PUT', '/api/owner/connections/$id', {'values': values}));

  @override
  Future<ConnectionHealth> checkConnection(String id) async => _health(await _client.send('POST', '/api/owner/connections/$id/check', {}));

  @override
  Future<void> disconnect(String id) => _client.send('POST', '/api/owner/connections/$id/disconnect', {});

  @override
  Future<String> gmailSignIn() async => (await _client.send('POST', '/api/owner/connections/gmail/sign-in', {}))['url']! as String;

  @override
  Future<List<Alert>> alerts() async => (await _client.list('/api/owner/alerts', 'alerts')).map(Alert.fromJson).toList();

  @override
  Future<void> resolveAlert(String id, {bool acknowledgeOnly = false}) =>
      _client.send('POST', '/api/owner/alerts/$id/resolve', {'status': acknowledgeOnly ? 'acknowledged' : 'resolved'});

  @override
  Future<List<PolicySetting>> policy() async => (await _client.list('/api/owner/policy', 'settings')).map(PolicySetting.fromJson).toList();

  @override
  Future<void> setPolicy(String key, Object? value) => _client.send('PUT', '/api/owner/policy/${Uri.encodeComponent(key)}', {'value': value});

  @override
  Future<List<StandingRule>> rules() async => (await _client.list('/api/owner/rules', 'rules')).map(StandingRule.fromJson).toList();

  @override
  Future<void> revokeRule(String id) => _client.send('POST', '/api/owner/rules/$id/revoke', {});

  @override
  Future<List<KnowledgeItem>> memory() async => (await _client.list('/api/owner/memory', 'items')).map(KnowledgeItem.fromJson).toList();

  @override
  Future<void> approveMemory(String key) => _client.send('POST', '/api/owner/memory/${Uri.encodeComponent(key)}/approve', {});
}
