import 'json.dart';

/// Where the month stands against the revenue goal, and what it takes to reach it. All amounts are US cents.
class RevenueStatus {
  const RevenueStatus({
    this.month = '',
    this.daysLeft = 0,
    this.goalCents = 0,
    this.collectedCents = 0,
    this.unpaidCents = 0,
    this.openProposalsCents = 0,
    this.shareOfGoalBps = 0,
    this.shareOfMonthBps = 0,
    this.onTrack = false,
    this.averageDealCents = 0,
    this.dealsNeeded = 0,
    this.needed = const {},
    this.ratesMeasured = false,
    this.pipeline = const {},
    this.thisMonth = const {},
    this.followUpsDue = 0,
    this.prospectsWaiting = 0,
    this.autopilotUntil,
  });

  factory RevenueStatus.fromJson(Json json) => RevenueStatus(
    month: '${json['month'] ?? ''}',
    daysLeft: intOf(json['days_left']),
    goalCents: intOf(json['goal_usd_cents']),
    collectedCents: intOf(json['collected_usd_cents']),
    unpaidCents: intOf(json['invoiced_unpaid_usd_cents']),
    openProposalsCents: intOf(json['proposals_open_usd_cents']),
    shareOfGoalBps: intOf(json['share_of_goal_bps']),
    shareOfMonthBps: intOf(json['share_of_month_bps']),
    onTrack: json['on_track'] == true,
    averageDealCents: intOf(json['average_deal_usd_cents']),
    dealsNeeded: intOf(json['deals_needed']),
    needed: _counts(json['needed']),
    ratesMeasured: jsonMap(json['rates'])['measured'] == true,
    pipeline: _counts(json['pipeline']),
    thisMonth: _counts(json['this_month']),
    followUpsDue: intOf(json['follow_ups_due']),
    prospectsWaiting: intOf(json['prospects_waiting']),
    autopilotUntil: jsonMap(json['autopilot'])['expires_at'] as String?,
  );

  static Map<String, int> _counts(Object? value) => {for (final e in jsonMap(value).entries) e.key: intOf(e.value)};

  final String month;
  final int daysLeft;
  final int goalCents;
  final int collectedCents;
  final int unpaidCents;
  final int openProposalsCents;
  final int shareOfGoalBps;
  final int shareOfMonthBps;
  final bool onTrack;
  final int averageDealCents;
  final int dealsNeeded;

  /// Proposals, meetings, replies and first emails it takes to win [dealsNeeded].
  final Map<String, int> needed;
  final bool ratesMeasured;
  final Map<String, int> pipeline;
  final Map<String, int> thisMonth;
  final int followUpsDue;
  final int prospectsWaiting;

  /// When Sales' autopilot ends, or null while it is off.
  final String? autopilotUntil;

  bool get autopilot => autopilotUntil != null;
}

/// Whole US dollars from cents, such as "$1,250".
String usd(int cents) {
  final whole = (cents / 100).round().toString();
  final grouped = whole.replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  return '\$$grouped';
}
