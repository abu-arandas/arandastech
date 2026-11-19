import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/session_controller.dart';
import '../../models/money.dart';
import '../../models/overview.dart';
import '../../widgets/motion.dart';
import '../../widgets/page_list.dart';
import '../sales/goal_card.dart';

/// The month against the revenue goal, what needs the owner today, and the numbers of the last 30 days.
class TodayPage extends StatelessWidget {
  const TodayPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionController>();
    return Obx(() {
      final o = session.overview.value ?? const Overview();
      final tiles = [
        ('Waiting for you', o.openApprovals),
        ('Level 3 requests', o.level3Approvals),
        ('Held by a pause', o.heldActions),
        ('New leads', o.newLeads),
        ('Orders in progress', o.ordersInProgress),
        ('Orders on hold', o.ordersOnHold),
        ('Unread messages', o.unreadMessages),
        ('Flagged messages', o.flaggedMessages),
        ('Open alerts', o.openAlerts),
      ];
      return PageList(
        children: [
          const GoalCard(),
          const SizedBox(height: 16),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              // The tiles come in a step apart and their figures count up once.
              for (final (i, (label, value)) in tiles.indexed)
                SizedBox(
                  width: 168,
                  child: Appear(
                    delay: Motion.stagger * i,
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            CountUp(value, id: label, style: Theme.of(context).textTheme.headlineMedium),
                            const SizedBox(height: 4),
                            Text(label.tr),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 20),
          const _Metrics(),
        ],
      );
    });
  }
}

/// The numbers of blueprint 18 for the last 30 days, with when they were counted.
class _Metrics extends StatelessWidget {
  const _Metrics();

  static String _percent(num? bps) => bps == null ? '–' : '${(bps / 100).toStringAsFixed(0)}%';

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionController>();
    return Obx(() {
      final m = session.metrics.value;
      if (m == null) return const SizedBox.shrink();
      final theme = Theme.of(context);
      final average = m.averageOrderMinor.entries.map((e) => formatMoney(e.value, e.key)).join(', ');
      final rows = [
        ('Qualified leads', '${m.qualifiedLeads} / ${m.leads}'),
        ('Leads won', _percent(m.winRateBps)),
        ('Paid orders', '${m.paidOrders}'),
        ('Average order', average.isEmpty ? '–' : average),
        ('Refund rate', _percent(m.refundRateBps)),
        ('Hours to approve', m.medianHoursToApprove == null ? '–' : '${m.medianHoursToApprove}'),
        ('Done under standing rules', _percent(m.rulesShareBps)),
        ('Failed actions', '${m.actionsFailed}'),
        ('AI cost per task', m.aiCostPerTaskMicros == null ? '–' : dollars(m.aiCostPerTaskMicros!)),
      ];
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Last 30 days'.tr, style: theme.textTheme.titleMedium),
              Text('${'Counted at'.tr} ${m.asOf}', style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
              const SizedBox(height: 8),
              for (final (label, value) in rows)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    children: [
                      Expanded(child: Text(label.tr)),
                      Text(
                        value,
                        textDirection: TextDirection.ltr,
                        style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      );
    });
  }
}
