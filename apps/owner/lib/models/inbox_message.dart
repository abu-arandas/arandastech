import 'json.dart';

/// An email, WhatsApp message or form that reached the company.
class InboxMessage {
  const InboxMessage({required this.channel, this.subject, this.fromAddress, this.body, this.flagged = false, this.handled = false});

  factory InboxMessage.fromJson(Json json) => InboxMessage(
    channel: '${json['channel']}',
    subject: json['subject'] as String?,
    fromAddress: json['from_address'] as String?,
    body: json['body'] as String?,
    flagged: json['flagged'] == true,
    handled: json['handled'] == true,
  );

  /// `email`, `whatsapp` or `form`.
  final String channel;
  final String? subject;
  final String? fromAddress;
  final String? body;

  /// It tries to give the bots instructions, so only a draft reply is allowed.
  final bool flagged;
  final bool handled;
}
