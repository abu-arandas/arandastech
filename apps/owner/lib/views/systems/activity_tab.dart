import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../config/breakpoints.dart';
import '../../controllers/systems_controller.dart';

/// The audit log, newest first, and whether its chain is intact.
class ActivityTab extends StatelessWidget {
  const ActivityTab({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<SystemsController>();
    return Obx(() {
      final log = controller.audit.value;
      final scheme = Theme.of(context).colorScheme;
      return GridContainer(
        // The log can be long, so its rows are built as they scroll in.
        child: ListView.builder(
          padding: const EdgeInsets.symmetric(vertical: 16),
          itemCount: log.events.length + 1,
          itemBuilder: (context, i) {
            if (i == 0) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  (log.chainIntact ? 'The audit chain is intact.' : 'The audit chain is broken. Stop and investigate.').tr,
                  style: TextStyle(fontWeight: FontWeight.w600, color: log.chainIntact ? scheme.primary : scheme.error),
                ),
              );
            }
            final e = log.events[i - 1];
            return ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text(e.eventType),
              subtitle: Text('${e.at} · ${e.actorKind} ${e.actorId ?? ''}'),
              leading: Text('#${e.seq}'),
            );
          },
        ),
      );
    });
  }
}
