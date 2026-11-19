import 'dart:math' as math;

import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../config/brand.dart';
import '../../controllers/approvals_controller.dart';
import '../../controllers/session_controller.dart';
import '../../widgets/fun.dart';
import '../../widgets/language_button.dart';
import '../../widgets/motion.dart';
import 'areas.dart';
import 'pause_control.dart';

/// The menu down the side on a tablet or a desktop: the mark (which keeps a secret), the six areas, and the pause,
/// language and sign-out at the foot. [extended] shows the labels and the pause card; a tablet gets icons only.
class SideBar extends StatelessWidget {
  const SideBar({required this.current, required this.onSelect, required this.extended, super.key});

  final Area current;
  final ValueChanged<Area> onSelect;
  final bool extended;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final session = Get.find<SessionController>();
    return Container(
      width: extended ? 256 : 88,
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color,
        border: BorderDirectional(end: BorderSide(color: scheme.outlineVariant)),
      ),
      child: SafeArea(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: extended ? 16 : 12, vertical: 16),
          child: Column(
            crossAxisAlignment: extended ? CrossAxisAlignment.stretch : CrossAxisAlignment.center,
            children: [
              Row(
                mainAxisAlignment: extended ? MainAxisAlignment.start : MainAxisAlignment.center,
                children: [
                  const SecretMark(size: 36),
                  if (extended) ...[
                    const SizedBox(width: 12),
                    Text(Brand.wordmark.tr, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w500)),
                  ],
                ],
              ),
              const SizedBox(height: 28),
              for (final area in Area.values)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: _Item(area: area, selected: area == current, extended: extended, onTap: () => onSelect(area)),
                ),
              const Spacer(),
              if (extended) const PauseCard() else const PauseIconButton(),
              const SizedBox(height: 12),
              if (extended)
                Row(
                  children: [
                    const LanguageButton(),
                    const Spacer(),
                    IconButton(tooltip: 'Refresh'.tr, onPressed: session.reload, icon: const Icon(Icons.refresh)),
                    IconButton(tooltip: 'Sign out'.tr, onPressed: session.signOut, icon: const Icon(Icons.logout)),
                  ],
                )
              else ...[
                IconButton(tooltip: 'Refresh'.tr, onPressed: session.reload, icon: const Icon(Icons.refresh)),
                const LanguageButton(compact: true),
                IconButton(tooltip: 'Sign out'.tr, onPressed: session.signOut, icon: const Icon(Icons.logout)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// One area in the menu: a pill that fills when selected, an icon that hops when chosen, and the approvals count.
class _Item extends StatelessWidget {
  const _Item({required this.area, required this.selected, required this.extended, required this.onTap});

  final Area area;
  final bool selected;
  final bool extended;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colour = selected ? scheme.primary : scheme.onSurfaceVariant;
    final icon = AreaIcon(area: area, selected: selected, colour: colour);
    return Squish(
      tooltip: extended ? null : area.label.tr,
      onTap: onTap,
      child: Semantics(
        selected: selected,
        label: extended ? null : area.label.tr,
        child: AnimatedContainer(
          duration: Motion.medium,
          curve: Motion.ease,
          height: 48,
          padding: EdgeInsets.symmetric(horizontal: extended ? 14 : 0),
          decoration: ShapeDecoration(color: selected ? scheme.primary.withValues(alpha: 0.12) : Colors.transparent, shape: const StadiumBorder()),
          child: extended
              ? Row(
                  children: [
                    icon,
                    const SizedBox(width: 14),
                    Expanded(
                      child: Text(
                        area.label.tr,
                        style: TextStyle(color: colour, fontWeight: selected ? FontWeight.w500 : FontWeight.w400),
                      ),
                    ),
                  ],
                )
              : Center(child: icon),
        ),
      ),
    );
  }
}

/// An area's icon: filled and hopping when it becomes the selected one; the approvals icon carries the count, which
/// pops when a new request lands.
class AreaIcon extends StatelessWidget {
  const AreaIcon({required this.area, required this.selected, this.colour, super.key});

  final Area area;
  final bool selected;
  final Color? colour;

  @override
  Widget build(BuildContext context) {
    final Widget icon = TweenAnimationBuilder<double>(
      key: ValueKey(selected),
      tween: Tween(begin: selected && !reduceMotion(context) ? 0 : 1, end: 1),
      duration: Motion.slow,
      builder: (context, t, child) => Transform.translate(
        // A small hop: up and back down.
        offset: Offset(0, -7 * math.sin(math.pi * t)),
        child: child,
      ),
      child: Icon(selected ? area.selectedIcon : area.icon, color: colour),
    );
    if (area != Area.approvals) return icon;
    final approvals = Get.find<ApprovalsController>();
    return Obx(() {
      final count = approvals.approvals.length;
      // The badge is always there, only hidden at zero, so going from none to one is a change it sees.
      return PopOnChange(
        value: count,
        child: Badge(isLabelVisible: count > 0, label: Text('$count'), child: icon),
      );
    });
  }
}
