import 'json.dart';

/// The numbers of the last 30 days (blueprint 18), with when they were counted.
class Metrics {
  const Metrics({
    required this.asOf,
    this.qualifiedLeads = 0,
    this.leads = 0,
    this.winRateBps,
    this.paidOrders = 0,
    this.averageOrderMinor = const {},
    this.refundRateBps,
    this.medianHoursToApprove,
    this.rulesShareBps,
    this.actionsFailed = 0,
    this.aiCostPerTaskMicros,
  });

  factory Metrics.fromJson(Json json) {
    final services = jsonMap(json['services']);
    final commerce = jsonMap(json['commerce']);
    final platform = jsonMap(json['platform']);
    return Metrics(
      asOf: '${json['as_of']}',
      qualifiedLeads: intOf(services['qualified_leads']),
      leads: intOf(services['leads']),
      winRateBps: services['win_rate_bps'] as num?,
      paidOrders: intOf(commerce['paid_orders']),
      averageOrderMinor: {for (final e in jsonMap(commerce['average_order_minor']).entries) e.key: intOf(e.value)},
      refundRateBps: commerce['refund_rate_bps'] as num?,
      medianHoursToApprove: platform['median_hours_to_approve'] as num?,
      rulesShareBps: platform['rules_share_bps'] as num?,
      actionsFailed: intOf(platform['actions_failed']),
      aiCostPerTaskMicros: platform['ai_cost_per_task_micros'] as num?,
    );
  }

  final String asOf;
  final int qualifiedLeads;
  final int leads;
  final num? winRateBps;
  final int paidOrders;

  /// The average paid order per currency, in minor units.
  final Map<String, int> averageOrderMinor;
  final num? refundRateBps;
  final num? medianHoursToApprove;

  /// The share of actions done under a standing rule, in basis points.
  final num? rulesShareBps;
  final int actionsFailed;

  /// Millionths of a US dollar.
  final num? aiCostPerTaskMicros;
}
