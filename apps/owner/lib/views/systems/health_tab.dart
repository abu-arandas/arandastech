import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/systems_controller.dart';
import '../../widgets/busy_button.dart';
import '../../widgets/page_list.dart';
import '../../widgets/section_title.dart';
import 'connections_section.dart';

/// Alerts to mark as seen or resolve, and the outside accounts.
class HealthTab extends StatelessWidget {
  const HealthTab({super.key});

  static const alertStatuses = {'open': 'Open', 'acknowledged': 'Seen', 'resolved': 'Resolved'};

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<SystemsController>();
    return Obx(() {
      final theme = Theme.of(context);
      final scheme = theme.colorScheme;
      final open = controller.alerts.where((a) => a.status != 'resolved').toList();
      return PageList(
        children: [
          const SectionTitle('Alerts', icon: Icons.notifications_none),
          if (open.isEmpty) const EmptyLine('No open alerts.', icon: Icons.verified_outlined),
          for (final alert in open)
            Card(
              color: alert.critical ? scheme.errorContainer : null,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(alert.summary, style: theme.textTheme.titleMedium),
                    Text('${alert.kind} · ${(alertStatuses[alert.status] ?? alert.status).tr} · ${alert.createdAt}'),
                    Wrap(
                      spacing: 8,
                      children: [
                        if (alert.status == 'open')
                          BusyButton(kind: ButtonKind.text, onPressed: () => controller.resolveAlert(alert, acknowledgeOnly: true), label: 'Mark as seen'.tr),
                        BusyButton(kind: ButtonKind.tonal, onPressed: () => controller.resolveAlert(alert), label: 'Resolve'.tr),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          const ConnectionsSection(),
        ],
      );
    });
  }
}
