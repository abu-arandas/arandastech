import 'dart:convert';

import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../controllers/owner_controller.dart';
import '../services/api.dart';
import 'home_page.dart';

/// Systems and Settings (blueprint 8.2 and 13.4): honest connector status, alerts, the policy sheet, standing rules,
/// business memory and the audit log.
class SystemsPage extends StatelessWidget {
  const SystemsPage({super.key});

  /// The capability statuses of blueprint 13.4. Nothing is shown as live unless it is.
  static const capability = {
    'planned': 'Planned',
    'in_development': 'In development',
    'built': 'Built, not connected',
    'awaiting_authorization': 'Waiting for you to connect it',
    'connected': 'Connected',
    'approval_required': 'Works, each use needs approval',
    'provider_limited': 'Limited by the provider',
    'live': 'Live',
    'paused': 'Paused',
    'failed': 'Failed',
  };

  static const alertStatuses = {'open': 'Open', 'acknowledged': 'Seen', 'resolved': 'Resolved'};

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 3,
    child: Column(
      children: [
        TabBar(
          tabs: [
            Tab(text: 'Health'.tr),
            Tab(text: 'Settings'.tr),
            Tab(text: 'Activity'.tr),
          ],
        ),
        const Expanded(child: TabBarView(children: [_Health(), _Settings(), ActivityView()])),
      ],
    ),
  );
}

class _Health extends StatelessWidget {
  const _Health();

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    return Obx(() {
      final theme = Theme.of(context);
      final scheme = theme.colorScheme;
      final open = c.alerts.where((a) => a['status'] != 'resolved').toList();
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Alerts'.tr, style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          if (open.isEmpty) Text('No open alerts.'.tr, style: TextStyle(color: scheme.onSurfaceVariant)),
          for (final alert in open)
            Card(
              color: alert['severity'] == 'critical' ? scheme.errorContainer : null,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(alert['summary'] as String, style: theme.textTheme.titleMedium),
                    Text(
                      '${alert['kind']} · ${(SystemsPage.alertStatuses[alert['status']] ?? alert['status'] as String).tr} · ${alert['created_at']}',
                    ),
                    Wrap(
                      spacing: 8,
                      children: [
                        if (alert['status'] == 'open')
                          TextButton(onPressed: () => c.resolveAlert(alert, acknowledgeOnly: true), child: Text('Mark as seen'.tr)),
                        FilledButton.tonal(onPressed: () => c.resolveAlert(alert), child: Text('Resolve'.tr)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 20),
          Text('Connectors'.tr, style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          for (final connector in c.connectors)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(switch (connector['status']) {
                'live' || 'connected' => Icons.check_circle_outline,
                'failed' => Icons.error_outline,
                'paused' => Icons.pause_circle_outline,
                _ => Icons.radio_button_unchecked,
              }, color: connector['status'] == 'failed' ? scheme.error : scheme.primary),
              title: Text(connector['name'] as String),
              subtitle: Text(
                [
                  (SystemsPage.capability[connector['status']] ?? connector['status'] as String).tr,
                  if (connector['last_error'] != null) connector['last_error'] as String,
                  '${'Last worked'.tr}: ${connector['last_ok_at'] ?? 'never'.tr}',
                ].join(' · '),
              ),
            ),
        ],
      );
    });
  }
}

class _Settings extends StatelessWidget {
  const _Settings();

  Future<void> _edit(BuildContext context, OwnerController c, Json setting) async {
    final value = setting['value'];
    final field = TextEditingController(text: value == null ? '' : '$value');
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(setting['key'] as String, textDirection: TextDirection.ltr),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(setting['description'] as String? ?? ''),
            const SizedBox(height: 8),
            TextField(
              key: const Key('policy-value'),
              controller: field,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
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
    if (ok == true) await c.setPolicy(setting, field.text);
  }

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    return Obx(() {
      final theme = Theme.of(context);
      final scheme = theme.colorScheme;
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Policy sheet'.tr, style: theme.textTheme.titleLarge),
          Text('Only you can change these. Every change is in the audit log.'.tr, style: TextStyle(color: scheme.onSurfaceVariant)),
          const SizedBox(height: 8),
          for (final setting in c.policy)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(setting['key'] as String, textDirection: TextDirection.ltr),
              subtitle: Text(setting['description'] as String? ?? '', maxLines: 2, overflow: TextOverflow.ellipsis),
              trailing: switch (setting['value']) {
                final bool on => Switch(value: on, onChanged: (_) => c.togglePolicy(setting)),
                num() || null => TextButton(
                  onPressed: () => _edit(context, c, setting),
                  child: Text(setting['value'] == null ? 'Not set'.tr : '${setting['value']}', textDirection: TextDirection.ltr),
                ),
                // Per-currency values are shown as they are; they are changed through the API for now.
                _ => ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 140),
                  child: Text(jsonEncode(setting['value']), textDirection: TextDirection.ltr, overflow: TextOverflow.ellipsis),
                ),
              },
            ),
          const SizedBox(height: 20),
          Text('Standing rules'.tr, style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          if (c.rules.isEmpty) Text('No standing rules.'.tr, style: TextStyle(color: scheme.onSurfaceVariant)),
          for (final rule in c.rules)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(rule['name'] as String),
              subtitle: Text('${rule['action_type']} · ${rule['status']} · ${'Ends'.tr} ${rule['expires_at']}'),
              trailing: rule['status'] == 'active' ? TextButton(onPressed: () => c.revokeRule(rule), child: Text('Revoke'.tr)) : null,
            ),
          const SizedBox(height: 20),
          Text('Business memory'.tr, style: theme.textTheme.titleLarge),
          Text('Only approved items reach customers.'.tr, style: TextStyle(color: scheme.onSurfaceVariant)),
          const SizedBox(height: 8),
          for (final item in c.memory)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(item['title'] as String? ?? item['key'] as String),
              subtitle: Text('${item['kind']} · ${item['source'] ?? ''} · v${item['version']}'),
              trailing: item['status'] == 'draft'
                  ? FilledButton.tonal(onPressed: () => c.approveMemory(item), child: Text('Approve'.tr))
                  : Text((item['status'] == 'approved' ? 'Approved' : 'Retired').tr),
            ),
        ],
      );
    });
  }
}
