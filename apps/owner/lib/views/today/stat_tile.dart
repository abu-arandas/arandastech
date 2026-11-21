import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../config/brand.dart';
import '../../widgets/fun.dart';
import '../../widgets/motion.dart';
import '../dashboard/areas.dart';

/// One of Today's counts: an icon, the figure counting up once, its name, and a line under it. At zero the line is a
/// small joke; otherwise it says a tap opens the area that holds them.
class StatTile extends StatelessWidget {
  const StatTile({required this.label, required this.value, required this.icon, required this.zero, required this.opens, super.key});

  final String label;
  final int value;
  final IconData icon;

  /// What the tile says when there are none: an English key, translated here.
  final String zero;
  final Area opens;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final busy = value > 0;
    return Squish(
      onTap: () => AreaScope.go(context, opens),
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: ShapeDecoration(
                      color: (busy ? scheme.secondary : scheme.primary).withValues(alpha: busy ? 0.18 : 0.1),
                      shape: RoundedSuperellipseBorder(borderRadius: BorderRadius.circular(13)),
                    ),
                    child: Icon(icon, size: 20, color: busy ? scheme.onSurface : scheme.primary),
                  ),
                  const Spacer(),
                  // A small orange knot says there is something here to look at.
                  if (busy) ...[
                    const DecoratedBox(
                      decoration: ShapeDecoration(color: Brand.thread, shape: CircleBorder()),
                      child: SizedBox.square(dimension: 8),
                    ),
                    const SizedBox(width: 8),
                  ],
                  CountUp(
                    value,
                    id: label,
                    style: theme.textTheme.headlineLarge?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -1),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                label.tr,
                style: const TextStyle(fontWeight: FontWeight.w600),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              // Room for two lines whatever the line says, so the tiles in a row stay the same height.
              SizedBox(
                height: 36,
                child: Text(
                  busy ? 'Tap to see them'.tr : zero.tr,
                  style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
