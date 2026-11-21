import 'dart:convert';

import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/systems_controller.dart';
import '../../models/settings.dart';
import '../../widgets/busy_button.dart';
import '../../widgets/page_list.dart';
import '../../widgets/section_title.dart';

/// The policy sheet, the standing rules to revoke, and the business memory to approve.
class SettingsTab extends StatelessWidget {
  const SettingsTab({super.key});

  Future<void> _edit(BuildContext context, SystemsController controller, PolicySetting setting) async {
    final value = setting.value;
    final field = TextEditingController(text: value == null ? '' : (value is Map ? jsonEncode(value) : '$value'));
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(setting.key, textDirection: TextDirection.ltr),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(setting.description ?? ''),
            const SizedBox(height: 8),
            TextField(
              key: const Key('policy-value'),
              controller: field,
              keyboardType: value is Map ? TextInputType.text : TextInputType.number,
              textDirection: TextDirection.ltr,
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text('Cancel'.tr)),
          FilledButton(key: const Key('policy-save'), onPressed: () => Navigator.of(context).pop(true), child: Text('Save'.tr)),
        ],
      ),
    );
    if (ok == true) await controller.setPolicy(setting, field.text);
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<SystemsController>();
    return Obx(
      () => PageList(
        children: [
          const SectionTitle('Policy sheet', icon: Icons.gavel_outlined, detail: 'Only you can change these. Every change is in the audit log.'),
          // The whole sheet on one card, one row per setting.
          Card(
            child: Column(
              children: [
                for (final (i, setting) in controller.policy.indexed) ...[
                  if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
                  ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    title: Text(setting.key, textDirection: TextDirection.ltr),
                    subtitle: Text(setting.description ?? '', maxLines: 2, overflow: TextOverflow.ellipsis),
                    trailing: switch (setting.value) {
                      final bool on => Switch(value: on, onChanged: (_) => controller.togglePolicy(setting)),
                      num() || null => TextButton(
                        onPressed: () => _edit(context, controller, setting),
                        child: Text(setting.value == null ? 'Not set'.tr : '${setting.value}', textDirection: TextDirection.ltr),
                      ),
                      // A per-currency value opens as text, one amount per currency in minor units.
                      _ => ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 160),
                        child: TextButton(
                          onPressed: () => _edit(context, controller, setting),
                          child: Text(jsonEncode(setting.value), textDirection: TextDirection.ltr, overflow: TextOverflow.ellipsis),
                        ),
                      ),
                    },
                  ),
                ],
              ],
            ),
          ),
          const SectionTitle('Standing rules', icon: Icons.rule_outlined),
          if (controller.rules.isEmpty) const EmptyLine('No standing rules.'),
          for (final rule in controller.rules)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(rule.name),
              subtitle: Text('${rule.actionType} · ${rule.status} · ${'Ends'.tr} ${rule.expiresAt}'),
              trailing: rule.active ? BusyButton(kind: ButtonKind.text, onPressed: () => controller.revokeRule(rule), label: 'Revoke'.tr) : null,
            ),
          const SectionTitle('Business memory', icon: Icons.psychology_outlined, detail: 'Only approved items reach customers.'),
          for (final item in controller.memory)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(item.title ?? item.key),
              subtitle: Text('${item.kind} · ${item.source ?? ''} · v${item.version}'),
              trailing: item.status == 'draft'
                  ? BusyButton(kind: ButtonKind.tonal, onPressed: () => controller.approveMemory(item), label: 'Approve'.tr)
                  : Text((item.status == 'approved' ? 'Approved' : 'Retired').tr),
            ),
        ],
      ),
    );
  }
}
