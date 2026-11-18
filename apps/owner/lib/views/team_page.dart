import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../controllers/owner_controller.dart';
import '../services/api.dart';
import 'widgets/motion.dart';

/// The departments at work (blueprint 7) and the command center (8.3): the owner says what they want, reads the plan,
/// and only then says go. Anything that leaves the company still waits in Approvals.
class TeamPage extends StatefulWidget {
  const TeamPage({super.key});

  /// The department names, keyed by the platform's ids.
  static const departments = {
    'operations': 'Operations',
    'sales': 'Sales',
    'support': 'Support',
    'marketing': 'Marketing',
    'engineering': 'Engineering',
    'commerce': 'Commerce',
    'finance': 'Finance',
    'security': 'Security',
  };

  static const modes = {
    'ready': 'The departments use the AI model.',
    'no_key': 'Manual mode: no AI key is set. The departments follow fixed rules and cost nothing.',
    'switched_off': 'Manual mode: the AI is switched off in the policy sheet.',
    'daily_cap': "Manual mode until tomorrow: today's AI budget is used up.",
    'monthly_cap': "Manual mode until next month: this month's AI budget is used up.",
  };

  static const statuses = {
    'planning': 'Waiting for your go-ahead',
    'queued': 'Queued',
    'running': 'Running',
    'done': 'Done',
    'failed': 'Failed',
    'waiting_approval': 'Waiting in Approvals',
    'skipped': 'Skipped: needs the AI model',
  };

  @override
  State<TeamPage> createState() => _TeamPageState();
}

/// Millionths of a US dollar, as dollars and cents.
String dollars(num micros) => '${(micros / 1000000).toStringAsFixed(2)} USD';

class _TeamPageState extends State<TeamPage> {
  final _instruction = TextEditingController();

  @override
  void dispose() {
    _instruction.dispose();
    super.dispose();
  }

  Future<void> _plan(OwnerController c) async {
    if (await c.plan(_instruction.text) != null) _instruction.clear();
  }

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    return Obx(() {
      final team = c.team.value ?? const <String, dynamic>{};
      final mode = (team['mode'] as Json?) ?? const <String, dynamic>{};
      final departments = ((team['departments'] as List?) ?? const []).cast<Json>();
      final jobs = (team['jobs'] as Json?) ?? const <String, dynamic>{};
      final briefing = team['briefing'] as Json?;
      final text = ((briefing?['output'] as Json?)?['result'] as Json?)?['text'] as Json?;
      final theme = Theme.of(context);
      final scheme = theme.colorScheme;
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // How the team works right now, and what it has cost.
          Card(
            color: c.aiOn ? scheme.primaryContainer : scheme.surfaceContainerHighest,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text((TeamPage.modes[mode['reason']] ?? 'The departments use the AI model.').tr, style: theme.textTheme.titleMedium),
                  const SizedBox(height: 6),
                  Text(
                    '${'AI spent today'.tr}: ${dollars((mode['spent_today_micros'] as num?) ?? 0)} / ${dollars((mode['daily_cap_micros'] as num?) ?? 0)}',
                    textDirection: TextDirection.ltr,
                  ),
                  Text('${'Work waiting to run'.tr}: ${jobs['queued'] ?? 0}'),
                  const SizedBox(height: 8),
                  Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: TextButton.icon(onPressed: c.runDue, icon: const Icon(Icons.play_arrow), label: Text('Run due work now'.tr)),
                  ),
                ],
              ),
            ),
          ),
          if (text != null) ...[
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Morning briefing'.tr, style: theme.textTheme.titleMedium),
                    const SizedBox(height: 6),
                    Text((text[c.locale.value.languageCode] ?? text['en'] ?? '') as String),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 20),
          Text('Tell the team'.tr, style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
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
              onPressed: () => _plan(c),
              icon: const Icon(Icons.checklist),
              label: Text('Make a plan'.tr),
            ),
          ),
          for (final (i, command) in c.commands.take(5).indexed)
            Appear(
              key: ValueKey(command['id']),
              delay: Motion.stagger * i,
              child: _CommandCard(command: command),
            ),
          const SizedBox(height: 20),
          Text('Departments'.tr, style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          for (final d in departments)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                d['enabled'] == false ? Icons.pause_circle_outline : Icons.circle,
                size: 14,
                color: d['enabled'] == false ? scheme.error : scheme.primary,
              ),
              title: Text((TeamPage.departments[d['id']] ?? d['id'] as String).tr),
              subtitle: Text(
                [
                  '${'Runs today'.tr}: ${d['runs_today'] ?? 0}',
                  if (((d['failed_today'] as num?) ?? 0) > 0) '${'Failed'.tr}: ${d['failed_today']}',
                  if (d['last_run_at'] == null) 'Not run yet'.tr,
                ].join(' · '),
              ),
              trailing: ((d['cost_today_micros'] as num?) ?? 0) > 0
                  ? Text(dollars(d['cost_today_micros'] as num), textDirection: TextDirection.ltr)
                  : null,
            ),
        ],
      );
    });
  }
}

/// One instruction: the plan before the go-ahead, then each task's outcome.
class _CommandCard extends StatelessWidget {
  const _CommandCard({required this.command});

  final Json command;

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    final plan = (command['plan'] as Json?) ?? const <String, dynamic>{};
    final status = command['status'] as String;
    final started = ((command['tasks'] as List?) ?? const []).cast<Json>();
    final planned = ((plan['tasks'] as List?) ?? const []).cast<Json>();
    final warnings = ((plan['warnings'] as List?) ?? const []).cast<String>();
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Card(
      margin: const EdgeInsets.only(top: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(command['instruction'] as String, style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              (TeamPage.statuses[status] ?? status).tr,
              style: TextStyle(color: status == 'failed' ? scheme.error : scheme.primary, fontWeight: FontWeight.w600),
            ),
            if (plan['planned_by'] == 'rules')
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('Planned by fixed rules, without the AI model.'.tr, style: TextStyle(color: scheme.onSurfaceVariant)),
              ),
            for (final w in warnings)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(w, style: TextStyle(color: scheme.error)),
              ),
            const SizedBox(height: 6),
            for (final t in started.isNotEmpty ? started : planned)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(switch (t['status']) {
                  'done' => Icons.check_circle_outline,
                  'waiting_approval' => Icons.fact_check_outlined,
                  'failed' => Icons.error_outline,
                  'skipped' => Icons.remove_circle_outline,
                  null => Icons.radio_button_unchecked,
                  _ => Icons.timelapse,
                }),
                title: Text(t['title'] as String),
                subtitle: Text(
                  [
                    (TeamPage.departments[t['department']] ?? t['department'] as String).tr,
                    if (t['status'] != null)
                      (TeamPage.statuses[t['status']] ?? t['status'] as String).tr
                    else if (t['approval'] != null)
                      t['approval'] as String,
                  ].join(' · '),
                ),
              ),
            if (status == 'planning') ...[
              if (((plan['expected_cost_micros'] as num?) ?? 0) > 0)
                Text('${'Most this can cost in AI'.tr}: ${dollars(plan['expected_cost_micros'] as num)}', textDirection: TextDirection.ltr),
              const SizedBox(height: 8),
              FilledButton(
                key: const Key('go-ahead'),
                onPressed: planned.isEmpty ? null : () => c.start(command),
                child: Text('Go ahead'.tr),
              ),
            ] else if (status == 'running')
              TextButton.icon(onPressed: () => c.refreshCommand(command), icon: const Icon(Icons.refresh), label: Text('Refresh'.tr)),
          ],
        ),
      ),
    );
  }
}
