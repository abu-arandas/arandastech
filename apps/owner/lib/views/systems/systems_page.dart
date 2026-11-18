import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import 'activity_tab.dart';
import 'health_tab.dart';
import 'settings_tab.dart';

/// Systems and Settings (blueprint 8.2 and 13.4): alerts and the outside accounts, the policy sheet, standing rules,
/// business memory and the audit log.
class SystemsPage extends StatelessWidget {
  const SystemsPage({super.key});

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
        const Expanded(child: TabBarView(children: [HealthTab(), SettingsTab(), ActivityTab()])),
      ],
    ),
  );
}
