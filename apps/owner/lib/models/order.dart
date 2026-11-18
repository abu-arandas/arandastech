import 'json.dart';

class Order {
  const Order({
    required this.id,
    required this.number,
    required this.buyerName,
    required this.totalMinor,
    required this.currency,
    required this.status,
    this.holdReason,
  });

  factory Order.fromJson(Json json) => Order(
    id: json['id']! as String,
    number: '${json['number']}',
    buyerName: '${json['buyer_name'] ?? ''}',
    totalMinor: intOf(json['total_minor']),
    currency: '${json['currency']}',
    status: '${json['status']}',
    holdReason: json['hold_reason'] as String?,
  );

  final String id;
  final String number;
  final String buyerName;
  final int totalMinor;
  final String currency;

  /// `pending_payment`, `paid`, `on_hold`, `fulfilling`, ...
  final String status;
  final String? holdReason;

  bool get onHold => status == 'on_hold';

  /// Paid at some point, so a refund can be prepared.
  bool get refundable => const ['paid', 'on_hold', 'fulfilling', 'shipped', 'delivered', 'completed', 'return_requested', 'canceled'].contains(status);
}
