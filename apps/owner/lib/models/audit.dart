import 'json.dart';

/// The append-only activity log, and whether its hash chain is unbroken.
class AuditLog {
  const AuditLog({this.chainIntact = true, this.events = const []});

  factory AuditLog.fromJson(Json json) =>
      AuditLog(chainIntact: json['chain_intact'] == true, events: jsonList(json['events']).map(AuditEvent.fromJson).toList());

  final bool chainIntact;
  final List<AuditEvent> events;
}

class AuditEvent {
  const AuditEvent({required this.seq, required this.at, required this.actorKind, required this.eventType, this.actorId});

  factory AuditEvent.fromJson(Json json) => AuditEvent(
    seq: intOf(json['seq']),
    at: '${json['at']}',
    actorKind: '${json['actor_kind']}',
    actorId: json['actor_id'] as String?,
    eventType: '${json['event_type']}',
  );

  final int seq;
  final String at;
  final String actorKind;
  final String? actorId;
  final String eventType;
}
