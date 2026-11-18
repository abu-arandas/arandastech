import 'json.dart';

/// One line of the policy sheet. Its value is a bool, a whole number, null (not set) or a per-currency map.
class PolicySetting {
  const PolicySetting({required this.key, this.description, this.value});

  factory PolicySetting.fromJson(Json json) => PolicySetting(key: json['key']! as String, description: json['description'] as String?, value: json['value']);

  final String key;
  final String? description;
  final Object? value;
}

/// Permission for an action to run without asking each time, until it ends or is revoked.
class StandingRule {
  const StandingRule({required this.id, required this.name, required this.actionType, required this.status, required this.expiresAt});

  factory StandingRule.fromJson(Json json) => StandingRule(
    id: json['id']! as String,
    name: '${json['name']}',
    actionType: '${json['action_type']}',
    status: '${json['status']}',
    expiresAt: '${json['expires_at']}',
  );

  final String id;
  final String name;
  final String actionType;
  final String status;
  final String expiresAt;

  bool get active => status == 'active';
}

/// Something the bots may tell customers. Only approved items reach them.
class KnowledgeItem {
  const KnowledgeItem({required this.key, required this.kind, required this.status, this.title, this.source, this.version = 1});

  factory KnowledgeItem.fromJson(Json json) => KnowledgeItem(
    key: json['key']! as String,
    title: json['title'] as String?,
    kind: '${json['kind']}',
    source: json['source'] as String?,
    version: intOf(json['version'], 1),
    status: '${json['status']}',
  );

  final String key;
  final String? title;
  final String kind;
  final String? source;
  final int version;

  /// `draft`, `approved` or `retired`.
  final String status;
}
