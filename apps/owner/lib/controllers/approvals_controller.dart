import 'package:get/get.dart';

import '../models/approval.dart';
import '../services/platform.dart';
import 'session_controller.dart';

/// The requests waiting for the owner, and the decisions.
class ApprovalsController extends GetxController implements PlatformReader {
  ApprovalsController(this._session);

  final SessionController _session;
  final approvals = <ApprovalRequest>[].obs;

  @override
  Future<void Function()> read(Platform platform) async {
    final now = await platform.approvals.approvals();
    return () => approvals.assignAll(now);
  }

  @override
  void clear() => approvals.clear();

  /// Sends the owner's decision. A Level 3 approval must carry the amount and the recipient the owner typed.
  Future<bool> decide(ApprovalRequest request, String decision, {int? amountMinor, String? recipient}) =>
      _session.act((p) => p.approvals.decide(request.id, decision, amountMinor: amountMinor, recipient: recipient));

  /// The owner typed something that does not match a Level 3 request: nothing is sent.
  void mismatch() => _session.error.value = 'The amount or the recipient does not match.';
}
