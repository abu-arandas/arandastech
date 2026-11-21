import 'package:material_ui/material_ui.dart';

import '../../widgets/area_tabs.dart';
import 'activity_tab.dart';
import 'health_tab.dart';
import 'settings_tab.dart';

/// Systems and Settings (blueprint 8.2 and 13.4): alerts and the outside accounts, the policy sheet, standing rules,
/// business memory and the audit log.
class SystemsPage extends StatelessWidget {
  const SystemsPage({super.key});

  @override
  Widget build(BuildContext context) => const DefaultTabController(
    length: 3,
    child: Column(
      children: [
        AreaTabs(['Health', 'Settings', 'Activity']),
        Expanded(child: TabBarView(children: [HealthTab(), SettingsTab(), ActivityTab()])),
      ],
    ),
  );
}
