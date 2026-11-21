import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../config/brand.dart';
import '../../widgets/brand_mark.dart';
import '../../widgets/motion.dart';
import '../../widgets/stitch_line.dart';

/// The ink half of the sign-in page on wide screens: the mark, one line on what the app is for, and three things it
/// does. Phones skip it and show the form alone.
class SignInPanel extends StatelessWidget {
  const SignInPanel({super.key});

  static const _points = ['Approve what the team wants to send', 'See money, orders and leads at a glance', 'Pause everything with one press'];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const soft = Color(0xBFFFFFFF);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(
        gradient: RadialGradient(center: AlignmentDirectional(-0.9, -0.9), radius: 1.4, colors: [Color(0xFF243453), Brand.shell]),
      ),
      child: Stack(
        children: [
          // A big shirt button, half off the bottom corner.
          const PositionedDirectional(end: -90, bottom: -90, child: Opacity(opacity: 0.12, child: BrandMark(size: 360))),
          Padding(
            padding: const EdgeInsets.all(48),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const BrandMark(size: 36),
                    const SizedBox(width: 12),
                    Text(
                      'zirr'.tr,
                      style: theme.textTheme.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
                const Spacer(),
                Appear(
                  child: Text(
                    'Your business, sewn together.'.tr,
                    style: theme.textTheme.displaySmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w600, letterSpacing: -1),
                  ),
                ),
                const SizedBox(height: 20),
                const SewIn(child: StitchLine(width: 64, thickness: 2)),
                const SizedBox(height: 28),
                for (final (i, point) in _points.indexed)
                  Appear(
                    delay: Motion.stagger * (i + 1),
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Row(
                        children: [
                          const Icon(Icons.check_rounded, size: 20, color: Brand.thread),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(point.tr, style: theme.textTheme.bodyLarge?.copyWith(color: soft)),
                          ),
                        ],
                      ),
                    ),
                  ),
                const Spacer(),
                Text('Made in Amman.'.tr, style: theme.textTheme.bodySmall?.copyWith(color: soft)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
