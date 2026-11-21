import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../config/brand.dart';
import '../../config/breakpoints.dart';
import '../../config/theme.dart';
import '../../controllers/session_controller.dart';
import '../../controllers/team_controller.dart';
import '../../models/json.dart';
import '../../models/money.dart';
import '../../models/team.dart';
import '../../widgets/busy_button.dart';
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
      return PageList(
        children: [
          // How the team works right now, and what it has cost: an ink panel like the menu, so it reads as the team's status.
          _StatusPanel(team: team, onRun: controller.runDue),
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
          const SectionTitle('Tell the team', icon: Icons.record_voice_over_outlined),
          TextField(
            key: const Key('instruction'),
            controller: _instruction,
            minLines: 1,
            maxLines: 4,
            decoration: InputDecoration(hintText: 'For example: draft three posts about Zirr POS and reply to the new leads'.tr),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: BusyButton(
              key: const Key('plan'),
              kind: ButtonKind.tonal,
              onPressed: () => _plan(controller),
              icon: Icons.checklist,
              label: 'Make a plan'.tr,
            ),
          ),
          for (final (i, command) in controller.commands.take(5).indexed)
            Appear(
              key: ValueKey(command.id),
              delay: Motion.stagger * i,
              child: CommandCard(command: command),
            ),
          const MarketingCard(),
          const SectionTitle('Departments', icon: Icons.apartment_outlined),
          GridRow(
            children: [
              for (final (i, d) in team.departments.indexed)
                GridCol(
                  md: 6,
                  xl: 4,
                  child: Appear(delay: Motion.stagger * i, child: _DepartmentTile(d)),
                ),
            ],
          ),
        ],
      );
    });
  }
}

class _StatusPanel extends StatelessWidget {
  const _StatusPanel({required this.team, required this.onRun});

  final TeamState team;
  final Future<void> Function() onRun;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const soft = Color(0xBFFFFFFF);
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: ShapeDecoration(
        color: theme.brightness == Brightness.light ? Brand.shell : Brand.shellDark,
        // A faint edge so the panel still stands off the page in the dark theme.
        shape: AppTheme.shape(22, side: BorderSide(color: Colors.white.withValues(alpha: 0.08))),
      ),
      child: Wrap(
        spacing: 24,
        runSpacing: 16,
        crossAxisAlignment: WrapCrossAlignment.center,
        alignment: WrapAlignment.spaceBetween,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(team.aiOn ? Icons.auto_awesome : Icons.settings_suggest_outlined, size: 20, color: Brand.thread),
                    const SizedBox(width: 10),
                    Flexible(
                      child: Text(
                        (TeamWords.modes[team.modeReason] ?? 'The departments use the AI model.').tr,
                        style: theme.textTheme.titleMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text('${'AI spent today'.tr}: ${dollars(team.spentTodayMicros)} / ${dollars(team.dailyCapMicros)}', style: const TextStyle(color: soft)),
                Text('${'Work waiting to run'.tr}: ${team.queuedJobs}', style: const TextStyle(color: soft)),
              ],
            ),
          ),
          BusyButton(
            onPressed: onRun,
            style: FilledButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: Brand.shell,
              // Stays readable on the ink panel while it waits.
              disabledBackgroundColor: Colors.white.withValues(alpha: 0.85),
              disabledForegroundColor: Brand.shell.withValues(alpha: 0.7),
            ),
            icon: Icons.play_arrow_rounded,
            label: 'Run due work now'.tr,
          ),
        ],
      ),
    );
  }
}

/// One department as a small card: a dot that says if it is on, its name, and today's runs.
class _DepartmentTile extends StatelessWidget {
  const _DepartmentTile(this.department);

  final Department department;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final d = department;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: ShapeDecoration(color: !d.enabled ? scheme.error : (d.failedToday > 0 ? Brand.thread : scheme.primary), shape: const CircleBorder()),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text((TeamWords.departments[d.id] ?? d.id).tr, style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(
                    [
                      '${'Runs today'.tr}: ${d.runsToday}',
                      if (d.failedToday > 0) '${'Failed'.tr}: ${d.failedToday}',
                      if (d.lastRunAt == null) 'Not run yet'.tr,
                    ].join(' · '),
                    style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            if (d.costTodayMicros > 0) Text(dollars(d.costTodayMicros), textDirection: TextDirection.ltr),
          ],
        ),
      ),
    );
  }
}
