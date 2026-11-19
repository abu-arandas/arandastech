import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/session_controller.dart';
import '../../controllers/team_controller.dart';
import '../../models/json.dart';
import '../../widgets/motion.dart';
import '../dashboard/areas.dart';

/// This morning's briefing from Operations, on Today so it is read: the first lines, and the rest a tap away. Its
/// figures come from the books, so it is shown as written, with no joke.
class BriefingCard extends StatefulWidget {
  const BriefingCard({super.key});

  @override
  State<BriefingCard> createState() => _BriefingCardState();
}

class _BriefingCardState extends State<BriefingCard> {
  static const _shown = 3;
  var _open = false;

  @override
  Widget build(BuildContext context) {
    final team = Get.find<TeamController>();
    final session = Get.find<SessionController>();
    return Obx(() {
      final briefing = team.team.value?.briefing;
      if (briefing == null) return const SizedBox.shrink();
      final theme = Theme.of(context);
      final lines = pick(briefing, session.locale.value.languageCode).split('\n').where((line) => line.trim().isNotEmpty).toList();
      final title = lines.isNotEmpty && !lines.first.startsWith('-') ? lines.removeAt(0) : null;
      final shown = _open ? lines : lines.take(_shown).toList();
      return Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.wb_sunny_outlined, color: theme.colorScheme.secondary),
                  const SizedBox(width: 10),
                  Expanded(child: Text('Morning briefing'.tr, style: theme.textTheme.titleMedium)),
                  TextButton(onPressed: () => AreaScope.go(context, Area.team), child: Text('Team'.tr)),
                ],
              ),
              if (title != null) Text(title, style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
              const SizedBox(height: 8),
              AnimatedSize(
                duration: Motion.medium,
                curve: Motion.ease,
                alignment: AlignmentDirectional.topStart,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [for (final line in shown) _Line(line)]),
              ),
              if (lines.length > _shown)
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton.icon(
                    onPressed: () => setState(() => _open = !_open),
                    icon: Icon(_open ? Icons.expand_less : Icons.expand_more),
                    label: Text(_open ? 'Show less'.tr : 'Read all'.tr),
                  ),
                ),
            ],
          ),
        ),
      );
    });
  }
}

/// One line of the briefing, its dash drawn as a dot so it reads as a list.
class _Line extends StatelessWidget {
  const _Line(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final bullet = text.startsWith('- ');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (bullet)
            Padding(
              padding: const EdgeInsetsDirectional.only(top: 8, end: 10),
              child: Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(color: Theme.of(context).colorScheme.primary, shape: BoxShape.circle),
              ),
            ),
          Expanded(child: Text(bullet ? text.substring(2) : text)),
        ],
      ),
    );
  }
}
