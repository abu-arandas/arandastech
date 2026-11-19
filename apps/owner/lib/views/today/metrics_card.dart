import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../config/breakpoints.dart';
import '../../controllers/session_controller.dart';
import '../../models/money.dart';

/// The numbers of blueprint 18 for the last 30 days, with when they were counted, as a grid of small cells. Plain on
/// purpose: these are money and quality figures, so nothing here jokes or moves.
class MetricsCard extends StatelessWidget {
  const MetricsCard({super.key});

  static String _percent(num? bps) => bps == null ? '–' : '${(bps / 100).toStringAsFixed(0)}%';

  /// The platform's timestamp as the owner reads a date and time on this device, or as sent when it is not one.
  static String _when(BuildContext context, String iso) {
    final at = DateTime.tryParse(iso)?.toLocal();
    if (at == null) return iso;
    final words = MaterialLocalizations.of(context);
    return '${words.formatMediumDate(at)}, ${words.formatTimeOfDay(TimeOfDay.fromDateTime(at))}';
  }

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionController>();
    return Obx(() {
      final m = session.metrics.value;
      if (m == null) return const SizedBox.shrink();
      final theme = Theme.of(context);
      final average = m.averageOrderMinor.entries.map((e) => formatMoney(e.value, e.key)).join(', ');
      final cells = [
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
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Last 30 days'.tr, style: theme.textTheme.titleMedium),
              Text('${'Counted at'.tr} ${_when(context, m.asOf)}', style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
              const SizedBox(height: 16),
              GridRow(
                gutter: 12,
                children: [
                  for (final (label, value) in cells)
                    GridCol(
                      xs: 6,
                      md: 4,
                      xl: 3,
                      child: _Cell(label: label, value: value),
                    ),
                ],
              ),
            ],
          ),
        ),
      );
    });
  }
}

class _Cell extends StatelessWidget {
  const _Cell({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: ShapeDecoration(
        color: theme.colorScheme.surfaceContainerHigh,
        shape: RoundedSuperellipseBorder(borderRadius: BorderRadius.circular(14)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.tr,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            value,
            textDirection: TextDirection.ltr,
            style: theme.textTheme.titleMedium?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
