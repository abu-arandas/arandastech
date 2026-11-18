import 'json.dart';

/// An action waiting for the owner's decision. Level 3 needs the amount and the recipient typed again.
class ApprovalRequest {
  const ApprovalRequest({required this.id, required this.level, required this.expiresAt, required this.action});

  factory ApprovalRequest.fromJson(Json json) => ApprovalRequest(
    id: json['id']! as String,
    level: intOf(json['level']),
    expiresAt: '${json['expires_at']}',
    action: PendingAction.fromJson(jsonMap(json['action'])),
  );

  final String id;
  final int level;
  final String expiresAt;
  final PendingAction action;
}

/// Exactly what an approval lets happen.
class PendingAction {
  const PendingAction({
    required this.type,
    required this.summary,
    required this.payload,
    required this.risk,
    required this.expectedResult,
    required this.requestedByKind,
    this.requestedById,
    this.recipient,
    this.costMinor = 0,
    this.currency,
    this.untrustedInput = false,
  });

  factory PendingAction.fromJson(Json json) => PendingAction(
    type: json['action_type']! as String,
    summary: json['summary']! as String,
    payload: jsonMap(json['payload']),
    risk: '${json['risk'] ?? ''}',
    expectedResult: '${json['expected_result'] ?? ''}',
    requestedByKind: '${json['requested_by_kind'] ?? ''}',
    requestedById: json['requested_by_id'] as String?,
    recipient: json['recipient'] as String?,
    costMinor: intOf(json['cost_minor']),
    currency: json['currency'] as String?,
    untrustedInput: json['untrusted_input'] == true,
  );

  final String type;
  final String summary;

  /// What will be sent, as the platform will send it.
  final Json payload;
  final String risk;
  final String expectedResult;
  final String requestedByKind;
  final String? requestedById;
  final String? recipient;
  final int costMinor;
  final String? currency;

  /// Outside content (an email, a form) led to this request, so it is read with care.
  final bool untrustedInput;
}
