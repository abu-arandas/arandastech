import '../models/approval.dart';
import 'platform_client.dart';

/// The requests waiting for the owner's decision.
abstract interface class ApprovalsService {
  Future<List<ApprovalRequest>> approvals();

  /// `approve`, `reject` or `postpone`. A Level 3 approval carries the amount and the recipient the owner typed.
  Future<void> decide(String requestId, String decision, {int? amountMinor, String? recipient});
}

class HttpApprovalsService implements ApprovalsService {
  HttpApprovalsService(this._client);

  final PlatformClient _client;

  @override
  Future<List<ApprovalRequest>> approvals() async => (await _client.list('/api/owner/approvals', 'approvals')).map(ApprovalRequest.fromJson).toList();

  @override
  Future<void> decide(String requestId, String decision, {int? amountMinor, String? recipient}) =>
      _client.send('POST', '/api/owner/approvals/$requestId/decide', {
        'decision': decision,
        if (amountMinor != null && recipient != null) 'confirmation': {'amount_minor': amountMinor, 'recipient': recipient},
      });
}
