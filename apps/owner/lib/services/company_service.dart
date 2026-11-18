import '../models/audit.dart';
import '../models/json.dart';
import '../models/metrics.dart';
import '../models/overview.dart';
import 'platform_client.dart';

/// The company as a whole: the overview, the numbers, the audit log and the pause.
abstract interface class CompanyService {
  Future<Overview> overview();
  Future<Metrics> metrics();
  Future<AuditLog> audit();

  /// Stops every agent and holds their actions. Anyone signed in may pause.
  Future<void> pause();

  /// Only the owner may resume.
  Future<void> resume();
}

class HttpCompanyService implements CompanyService {
  HttpCompanyService(this._client);

  final PlatformClient _client;

  @override
  Future<Overview> overview() async => Overview.fromJson(await _client.send('GET', '/api/owner/overview'));

  @override
  Future<Metrics> metrics() async => Metrics.fromJson(jsonMap((await _client.send('GET', '/api/owner/metrics'))['metrics']));

  @override
  Future<AuditLog> audit() async => AuditLog.fromJson(await _client.send('GET', '/api/owner/audit?limit=100'));

  @override
  Future<void> pause() => _client.send('POST', '/api/owner/pause', {'scope': 'global', 'reason': 'Paused from the owner app.'});

  @override
  Future<void> resume() => _client.send('POST', '/api/owner/resume', {'scope': 'global'});
}
