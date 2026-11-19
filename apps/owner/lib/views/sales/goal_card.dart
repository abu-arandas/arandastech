import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/sales_controller.dart';
import '../../models/revenue.dart';
import '../../widgets/motion.dart';

/// The month against the revenue goal: what is in, what is owed, and what it still takes, in plain numbers.
class GoalCard extends StatelessWidget {
  const GoalCard({super.key});

  @override
  Widget build(BuildContext context) {
    final sales = Get.find<SalesController>();
    return Obx(() {
      final r = sales.revenue.value;
      if (r == null) return const SizedBox.shrink();
      final theme = Theme.of(context);
      final scheme = theme.colorScheme;
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${'Monthly goal'.tr} · ${r.month}', style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              Text(
                '${usd(r.collectedCents)} / ${usd(r.goalCents)}',
                textDirection: TextDirection.ltr,
                style: theme.textTheme.headlineMedium?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
              ),
              const SizedBox(height: 8),
              _Progress(goal: r.shareOfGoalBps / 10000, month: r.shareOfMonthBps / 10000),
              const SizedBox(height: 8),
              Text(
                r.onTrack ? 'On track for the month.'.tr : 'Behind the pace of the month.'.tr,
                style: TextStyle(color: r.onTrack ? scheme.primary : scheme.error, fontWeight: FontWeight.w600),
              ),
              Text('${r.daysLeft} ${'days left'.tr}', style: TextStyle(color: scheme.onSurfaceVariant)),
              const Divider(height: 24),
              _Row('Invoiced, not paid yet', usd(r.unpaidCents)),
              _Row('Proposals waiting for an answer', usd(r.openProposalsCents)),
              _Row('Usual deal', usd(r.averageDealCents)),
              const SizedBox(height: 8),
              _Needs(r),
            ],
          ),
        ),
      );
    });
  }
}

/// The share of the goal reached, with a mark where the month is, so being behind or ahead shows at a glance.
class _Progress extends StatelessWidget {
  const _Progress({required this.goal, required this.month});

  final double goal;
  final double month;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, box) => Stack(
        children: [
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: goal.clamp(0, 1)),
            duration: Motion.slow,
            curve: Motion.enter,
            builder: (context, value, _) => LinearProgressIndicator(value: value, minHeight: 10, borderRadius: BorderRadius.circular(5)),
          ),
          PositionedDirectional(
            start: (box.maxWidth * month.clamp(0, 1)) - 1,
            top: 0,
            bottom: 0,
            child: Container(width: 2, color: scheme.tertiary),
          ),
        ],
      ),
    );
  }
}

/// What it takes to reach the goal this month, at the funnel rates, measured or the starting ones.
class _Needs extends StatelessWidget {
  const _Needs(this.r);

  final RevenueStatus r;

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant);
    if (r.dealsNeeded == 0) return Text('The goal is covered. Keep the clients happy.'.tr);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('${'Deals still needed'.tr}: ${r.dealsNeeded}', style: const TextStyle(fontWeight: FontWeight.w600)),
        _Row('Proposals to send', '${r.needed['proposals'] ?? 0}'),
        _Row('Calls to hold', '${r.needed['meetings'] ?? 0}'),
        _Row('Replies to get', '${r.needed['replies'] ?? 0}'),
        _Row('First emails to send', '${r.needed['first_emails'] ?? 0}'),
        Text(r.ratesMeasured ? 'At the rates measured in the last 90 days.'.tr : 'At starting rates, until there is enough of your own data.'.tr, style: muted),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
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
  );
}
