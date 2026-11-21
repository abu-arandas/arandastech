import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/team_controller.dart';
import '../../models/command.dart';
import '../../models/money.dart';
import '../../widgets/busy_button.dart';
import 'team_words.dart';

/// One instruction: the plan before the go-ahead, then each task's outcome.
class CommandCard extends StatelessWidget {
  const CommandCard({required this.command, super.key});

  final Command command;

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<TeamController>();
    final status = command.status;
    final shown = command.tasks.isNotEmpty ? command.tasks : command.plannedTasks;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Card(
      margin: const EdgeInsets.only(top: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(command.instruction, style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              (TeamWords.statuses[status] ?? status).tr,
              style: TextStyle(color: status == 'failed' ? scheme.error : scheme.primary, fontWeight: FontWeight.w600),
            ),
            if (command.plannedBy == 'rules')
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('Planned by fixed rules, without the AI model.'.tr, style: TextStyle(color: scheme.onSurfaceVariant)),
              ),
            for (final w in command.warnings)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(w, style: TextStyle(color: scheme.error)),
              ),
            const SizedBox(height: 6),
            for (final t in shown)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(switch (t.status) {
                  'done' => Icons.check_circle_outline,
                  'waiting_approval' => Icons.fact_check_outlined,
                  'failed' => Icons.error_outline,
                  'skipped' => Icons.remove_circle_outline,
                  null => Icons.radio_button_unchecked,
                  _ => Icons.timelapse,
                }),
                title: Text(t.title),
                subtitle: Text(
                  [
                    (TeamWords.departments[t.department] ?? t.department).tr,
                    if (t.status != null) (TeamWords.statuses[t.status] ?? t.status!).tr else ?t.approval,
                  ].join(' · '),
                ),
              ),
            if (status == 'planning') ...[
              if (command.expectedCostMicros > 0)
                Text('${'Most this can cost in AI'.tr}: ${dollars(command.expectedCostMicros)}', textDirection: TextDirection.ltr),
              const SizedBox(height: 8),
              BusyButton(key: const Key('go-ahead'), onPressed: command.plannedTasks.isEmpty ? null : () => controller.start(command), label: 'Go ahead'.tr),
            ] else if (status == 'running')
              BusyButton(kind: ButtonKind.text, onPressed: () => controller.refreshCommand(command), icon: Icons.refresh, label: 'Refresh'.tr),
          ],
        ),
      ),
    );
  }
}
