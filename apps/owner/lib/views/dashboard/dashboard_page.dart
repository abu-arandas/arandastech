import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../config/breakpoints.dart';
import '../../controllers/approvals_controller.dart';
import '../../controllers/session_controller.dart';
import '../../widgets/brand_mark.dart';
import '../../widgets/language_button.dart';
import '../../widgets/motion.dart';
import '../../widgets/section_title.dart';
import '../approvals/approvals_page.dart';
import '../business/business_page.dart';
import '../sales/sales_page.dart';
import '../systems/systems_page.dart';
import '../team/team_page.dart';
import '../today/today_page.dart';

/// The owner's six screens, which hold the six areas of blueprint 8.2. The pause control is on every one of them.
class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  int _tab = 0;

  static const _tabs = ['Today', 'Sales', 'Approvals', 'Team', 'Business', 'Systems'];
  static const _icons = [Icons.today, Icons.trending_up, Icons.fact_check_outlined, Icons.groups_outlined, Icons.storefront_outlined, Icons.tune];

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionController>();
    final approvals = Get.find<ApprovalsController>();
    return Obx(() {
      final scheme = Theme.of(context).colorScheme;
      final paused = session.paused;
      return Scaffold(
        appBar: AppBar(
          title: const BrandTitle(),
          actions: [
            IconButton(tooltip: 'Refresh'.tr, onPressed: session.reload, icon: const Icon(Icons.refresh)),
            const LanguageButton(),
            IconButton(tooltip: 'Sign out'.tr, onPressed: session.signOut, icon: const Icon(Icons.logout)),
          ],
        ),
        body: Column(
          children: [
            Material(
              color: paused ? scheme.errorContainer : scheme.surfaceContainerHigh,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        paused ? 'Everything is paused. Held actions are kept, not dropped.'.tr : session.error.value?.tr ?? '',
                        style: TextStyle(color: paused ? scheme.onErrorContainer : scheme.error),
                      ),
                    ),
                    if (paused)
                      FilledButton(onPressed: () => session.setPaused(value: false), child: Text('Resume'.tr))
                    else
                      FilledButton.tonalIcon(
                        onPressed: () => session.setPaused(value: true),
                        icon: const Icon(Icons.pause_circle_outline),
                        label: Text('Pause everything'.tr),
                      ),
                  ],
                ),
              ),
            ),
            // Tabs fade through, quickly: this is a tool, not a show.
            Expanded(
              child: AnimatedSwitcher(
                duration: Motion.medium,
                switchInCurve: Motion.enter,
                switchOutCurve: Motion.exit,
                child: KeyedSubtree(
                  key: ValueKey(_tab),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      GridContainer(
                        child: Padding(
                          padding: const EdgeInsets.only(top: 16),
                          child: PageHeading(_tabs[_tab], eyebrow: 'Owner app'),
                        ),
                      ),
                      Expanded(child: const [TodayPage(), SalesPage(), ApprovalsPage(), TeamPage(), BusinessPage(), SystemsPage()][_tab]),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: [
            for (var i = 0; i < _tabs.length; i++)
              NavigationDestination(
                // The count pops when a new request lands, the first one included (the badge is always there, only
                // hidden at zero, so going from none to one is a change it sees).
                icon: i == 2
                    ? PopOnChange(
                        value: approvals.approvals.length,
                        child: Badge(isLabelVisible: approvals.approvals.isNotEmpty, label: Text('${approvals.approvals.length}'), child: Icon(_icons[i])),
                      )
                    : Icon(_icons[i]),
                label: _tabs[i].tr,
              ),
          ],
        ),
      );
    });
  }
}
