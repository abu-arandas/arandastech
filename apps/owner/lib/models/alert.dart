import 'json.dart';

class Alert {
  const Alert({required this.id, required this.summary, required this.kind, required this.status, required this.createdAt, this.severity});

  factory Alert.fromJson(Json json) => Alert(
    id: json['id']! as String,
    summary: '${json['summary']}',
    kind: '${json['kind']}',
    status: '${json['status']}',
    severity: json['severity'] as String?,
    createdAt: '${json['created_at']}',
  );

  final String id;
  final String summary;
  final String kind;

  /// `open`, `acknowledged` or `resolved`.
  final String status;
  final String? severity;
  final String createdAt;

  bool get critical => severity == 'critical';
}
