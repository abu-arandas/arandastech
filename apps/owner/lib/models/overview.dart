import 'json.dart';

/// The counts on the Today screen, whether everything is paused, and the money summary per currency.
class Overview {
  const Overview({
    this.paused = false,
    this.openApprovals = 0,
    this.level3Approvals = 0,
    this.heldActions = 0,
    this.newLeads = 0,
    this.ordersInProgress = 0,
    this.ordersOnHold = 0,
    this.unreadMessages = 0,
    this.flaggedMessages = 0,
    this.openAlerts = 0,
    this.money = const [],
  });

  factory Overview.fromJson(Json json) {
    int at(String group, String key) => intOf(jsonMap(json[group])[key]);
    return Overview(
      paused: json['paused'] == true,
      openApprovals: at('approvals', 'open'),
      level3Approvals: at('approvals', 'level_3'),
      heldActions: intOf(json['held_actions']),
      newLeads: at('leads', 'new'),
      ordersInProgress: at('orders', 'in_progress'),
      ordersOnHold: at('orders', 'on_hold'),
      unreadMessages: at('inbox', 'unhandled'),
      flaggedMessages: at('inbox', 'flagged'),
      openAlerts: at('alerts', 'open'),
      money: jsonList(json['money']).map(MoneySummary.fromJson).toList(),
    );
  }

  final bool paused;
  final int openApprovals;
  final int level3Approvals;
  final int heldActions;
  final int newLeads;
  final int ordersInProgress;
  final int ordersOnHold;
  final int unreadMessages;
  final int flaggedMessages;
  final int openAlerts;
  final List<MoneySummary> money;
}

/// One currency's books: money not yet the company's, then the waterfall from the settled balance down.
class MoneySummary {
  const MoneySummary({required this.currency, required this.status, required this.pendingRevenue, required this.waterfall});

  factory MoneySummary.fromJson(Json json) => MoneySummary(
    currency: json['currency']! as String,
    status: json['status']! as String,
    pendingRevenue: intOf(json['pending_revenue']),
    waterfall: {for (final e in jsonMap(json['waterfall']).entries) e.key: intOf(e.value)},
  );

  final String currency;

  /// `not_safe_to_spend`, `limited_reinvestment_available` or `safe_to_consider_upgrade`.
  final String status;
  final int pendingRevenue;

  /// Each line of the waterfall in minor units, such as `settled_balance` and `available_cash`.
  final Map<String, int> waterfall;
}
