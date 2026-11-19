import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../models/overview.dart';
import '../../widgets/motion.dart';
import '../dashboard/areas.dart';

/// What waits on the owner: the requests to answer, how many are level 3, and what a pause holds, with the way to
/// them. With nothing waiting, a tick draws itself and the card suggests a coffee.
class NeedsYouCard extends StatelessWidget {
  const NeedsYouCard({required this.overview, this.fill = false, super.key});

  final Overview overview;

  /// Whether the card fills a given height (beside the goal on a desktop), with its button at the foot.
  final bool fill;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final waiting = overview.openApprovals;
    return Card(
      margin: EdgeInsets.zero,
      color: waiting > 0 ? scheme.primary : null,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: waiting == 0
            ? Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const DrawnTick(size: 56),
                  const SizedBox(height: 12),
                  Text('Nothing is waiting for you.'.tr, style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
                  const SizedBox(height: 4),
                  Text(
                    'Go get a coffee. The team has this.'.tr,
                    style: TextStyle(color: scheme.onSurfaceVariant),
                    textAlign: TextAlign.center,
                  ),
                ],
              )
            : DefaultTextStyle.merge(
                style: TextStyle(color: scheme.onPrimary),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Waiting for you'.tr, style: theme.textTheme.titleMedium?.copyWith(color: scheme.onPrimary)),
                    const SizedBox(height: 8),
                    CountUp(
                      waiting,
                      id: 'needs-you',
                      style: theme.textTheme.displayMedium?.copyWith(color: scheme.onPrimary, fontWeight: FontWeight.w500),
                    ),
                    Text(waiting == 1 ? 'request needs a yes or a no.'.tr : 'requests need a yes or a no.'.tr),
                    const SizedBox(height: 12),
                    _Line('Level 3 requests', overview.level3Approvals),
                    _Line('Held by a pause', overview.heldActions),
                    if (fill) const Spacer() else const SizedBox(height: 16),
                    FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: scheme.secondary, foregroundColor: scheme.onSecondary),
                      onPressed: () => AreaScope.go(context, Area.approvals),
                      icon: const Icon(Icons.fact_check_outlined),
                      label: Text('Review approvals'.tr),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value);

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Row(
      children: [
        Expanded(child: Text(label.tr)),
        Text(
          '$value',
          style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()], fontWeight: FontWeight.w500),
        ),
      ],
    ),
  );
}
