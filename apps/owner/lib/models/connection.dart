import 'json.dart';

/// An outside account (Gmail, GitHub, PayTabs, ...): a stand-in until its keys are saved, and live after.
class Connection {
  const Connection({
    required this.id,
    required this.name,
    this.live = false,
    this.lastError,
    this.fields = const [],
    this.addresses = const [],
    this.steps = const [],
  });

  factory Connection.fromJson(Json json) => Connection(
    id: json['id']! as String,
    name: '${json['name']}',
    live: json['mode'] == 'live',
    lastError: json['last_error'] as String?,
    fields: jsonList(json['fields']).map(ConnectionField.fromJson).toList(),
    addresses: jsonList(json['addresses']).map(ConnectionAddress.fromJson).toList(),
    steps: ((json['steps'] as List<Object?>?) ?? const <Object?>[]).map((s) => '$s').toList(),
  );

  final String id;
  final String name;
  final bool live;
  final String? lastError;
  final List<ConnectionField> fields;

  /// Addresses to paste into the provider's settings, such as a webhook.
  final List<ConnectionAddress> addresses;

  /// How to get the keys, in order.
  final List<String> steps;

  /// The values the owner types.
  List<ConnectionField> get typed => fields.where((f) => !f.automatic).toList();

  /// The values the platform found by itself, once it has them.
  List<ConnectionField> get found => fields.where((f) => f.automatic && f.value != null).toList();

  bool get anySaved => fields.any((f) => f.set);

  /// For Gmail: the Google client is saved, so the owner can sign in with Google.
  bool get googleClientSaved => id == 'gmail' && fields.where((f) => f.key == 'client_id' || f.key == 'client_secret').every((f) => f.set);
}

class ConnectionField {
  const ConnectionField({required this.key, required this.label, this.help, this.secret = false, this.automatic = false, this.set = false, this.value});

  factory ConnectionField.fromJson(Json json) => ConnectionField(
    key: json['key']! as String,
    label: '${json['label']}',
    help: json['help'] as String?,
    secret: json['secret'] == true,
    automatic: json['automatic'] == true,
    set: json['set'] == true,
    value: json['value'],
  );

  final String key;
  final String label;
  final String? help;

  /// Never shown again once saved.
  final bool secret;

  /// Filled in by the platform, not typed.
  final bool automatic;

  /// Whether a value is saved.
  final bool set;

  /// The value, for one that is not secret.
  final Object? value;
}

class ConnectionAddress {
  const ConnectionAddress({required this.label, required this.value});

  factory ConnectionAddress.fromJson(Json json) => ConnectionAddress(label: '${json['label']}', value: '${json['value']}');

  final String label;
  final String value;
}

/// What an account said when it was saved or checked.
class ConnectionHealth {
  const ConnectionHealth({this.ok, this.note});

  factory ConnectionHealth.fromJson(Json json) => ConnectionHealth(ok: json['ok'] as bool?, note: json['note'] as String?);

  final bool? ok;
  final String? note;
}
