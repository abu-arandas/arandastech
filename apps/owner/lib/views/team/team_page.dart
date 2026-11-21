import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/session_controller.dart';
import '../../controllers/team_controller.dart';
import '../../models/json.dart';
import '../../models/money.dart';
import '../../models/team.dart';
import '../../widgets/motion.dart';
import '../../widgets/page_list.dart';
import '../../widgets/section_title.dart';
import 'command_card.dart';
import 'marketing_card.dart';
import 'team_words.dart';

/// The departments at work (blueprint 7) and the command center (8.3): the owner says what they want, reads the plan,
/// and only then says go. Anything that leaves the company still waits in Approvals.
class TeamPage extends StatefulWidget {
  const TeamPage({super.key});

  @override
  State<TeamPage> createState() => _TeamPageState();
}

class _TeamPageState extends State<TeamPage> {
  final _instruction = TextEditingController();

  @override
  void dispose() {
    _instruction.dispose();
    super.dispose();
  }

  Future<void> _plan(TeamController controller) async {
    if (await controller.plan(_instruction.text) != null) _instruction.clear();
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<TeamController>();
    final session = Get.find<SessionController>();
    return Obx(() {
      final team = controller.team.value ?? const TeamState();
      final briefing = team.briefing;
      final theme = Theme.of(context);
      final scheme = theme.colorScheme;
      return PageList(
        children: [
          // How the team works right now, and what it has cost.
          Card(
            color: team.aiOn ? scheme.primaryContainer : scheme.surfaceContainerHighest,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text((TeamWords.modes[team.modeReason] ?? 'The departments use the AI model.').tr, style: theme.textTheme.titleMedium),
                  const SizedBox(height: 6),
                  Text('${'AI spent today'.tr}: ${dollars(team.spentTodayMicros)} / ${dollars(team.dailyCapMicros)}', textDirection: TextDirection.ltr),
                  Text('${'Work waiting to run'.tr}: ${team.queuedJobs}'),
                  const SizedBox(height: 8),
                  Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: TextButton.icon(onPressed: controller.runDue, icon: const Icon(Icons.play_arrow), label: Text('Run due work now'.tr)),
                  ),
                ],
              ),
            ),
          ),
          if (briefing != null) ...[
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Morning briefing'.tr, style: theme.textTheme.titleMedium),
                    const SizedBox(height: 6),
                    Text(pick(briefing, session.locale.value.languageCode)),
                  ],
                ),
              ),
            ),
          ],
          const SectionTitle('Tell the team'),
          TextField(
            key: const Key('instruction'),
            controller: _instruction,
            minLines: 1,
            maxLines: 4,
            decoration: InputDecoration(
              hintText: 'For example: draft three posts about Zirr POS and reply to the new leads'.tr,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: FilledButton.tonalIcon(
              key: const Key('plan'),
              onPressed: () => _plan(controller),
              icon: const Icon(Icons.checklist),
              label: Text('Make a plan'.tr),
            ),
          ),
          for (final (i, command) in controller.commands.take(5).indexed)
            Appear(
              key: ValueKey(command.id),
              delay: Motion.stagger * i,
              child: CommandCard(command: command),
            ),
          const MarketingCard(),
          const SectionTitle('Departments'),
          for (final d in team.departments)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(d.enabled ? Icons.circle : Icons.pause_circle_outline, size: 14, color: d.enabled ? scheme.primary : scheme.error),
              title: Text((TeamWords.departments[d.id] ?? d.id).tr),
              subtitle: Text(
                [
                  '${'Runs today'.tr}: ${d.runsToday}',
                  if (d.failedToday > 0) '${'Failed'.tr}: ${d.failedToday}',
                  if (d.lastRunAt == null) 'Not run yet'.tr,
                ].join(' · '),
              ),
              trailing: d.costTodayMicros > 0 ? Text(dollars(d.costTodayMicros), textDirection: TextDirection.ltr) : null,
            ),
        ],
      );
    });
  }
}
