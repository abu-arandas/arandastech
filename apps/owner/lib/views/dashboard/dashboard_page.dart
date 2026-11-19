import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../config/brand.dart';
import '../../config/breakpoints.dart';
import '../../controllers/session_controller.dart';
import '../../widgets/fun.dart';
import '../../widgets/language_button.dart';
import '../../widgets/motion.dart';
import '../../widgets/section_title.dart';
import 'areas.dart';
import 'pause_control.dart';
import 'side_bar.dart';

/// The owner's dashboard, shaped by the window: a bottom bar on a phone, a slim icon rail on a tablet, and a full
/// sidebar with the pause card on a desktop. The pause control is on every screen in every shape.
class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  var _area = Area.today;

  void _open(Area area) => setState(() => _area = area);

  @override
  Widget build(BuildContext context) {
    final screen = context.screen;
    final content = AreaScope(
      current: _area,
      open: _open,
      child: _AreaView(area: _area),
    );
    if (screen.index < Screen.md.index) return _PhoneShell(area: _area, onSelect: _open, child: content);
    return Scaffold(
      body: Row(
        children: [
          SideBar(current: _area, onSelect: _open, extended: screen.index >= Screen.xl.index),
          Expanded(
            child: SafeArea(
              left: false,
              right: false,
              child: Column(
                children: [
                  const StatusBanner(),
                  Expanded(child: content),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A phone: the brand and a few icons on top, the six areas along the bottom.
class _PhoneShell extends StatelessWidget {
  const _PhoneShell({required this.area, required this.onSelect, required this.child});

  final Area area;
  final ValueChanged<Area> onSelect;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionController>();
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SecretMark(),
            const SizedBox(width: 10),
            Flexible(child: Text(Brand.wordmark.tr, overflow: TextOverflow.ellipsis)),
          ],
        ),
        actions: [
          const PauseIconButton(),
          IconButton(tooltip: 'Refresh'.tr, onPressed: session.reload, icon: const Icon(Icons.refresh)),
          const LanguageButton(),
          IconButton(tooltip: 'Sign out'.tr, onPressed: session.signOut, icon: const Icon(Icons.logout)),
        ],
      ),
      body: Column(
        children: [
          const StatusBanner(withButton: true),
          Expanded(child: child),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: area.index,
        // Six areas on a narrow phone: only the chosen one keeps its label, so none is cut short.
        labelBehavior: MediaQuery.sizeOf(context).width < 400
            ? NavigationDestinationLabelBehavior.onlyShowSelected
            : NavigationDestinationLabelBehavior.alwaysShow,
        onDestinationSelected: (i) => onSelect(Area.values[i]),
        destinations: [
          for (final a in Area.values)
            NavigationDestination(
              icon: AreaIcon(area: a, selected: false),
              selectedIcon: AreaIcon(area: a, selected: true),
              label: a.label.tr,
            ),
        ],
      ),
    );
  }
}

/// The chosen area under its heading. Areas fade through quickly; Today has no fixed heading, as its hello scrolls
/// with the cards.
class _AreaView extends StatelessWidget {
  const _AreaView({required this.area});

  final Area area;

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
    duration: Motion.medium,
    switchInCurve: Motion.enter,
    switchOutCurve: Motion.exit,
    child: KeyedSubtree(
      key: ValueKey(area),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (area != Area.today)
            GridContainer(
              child: Padding(
                padding: const EdgeInsets.only(top: 16),
                child: PageHeading(area.label, eyebrow: 'Owner app'),
              ),
            ),
          Expanded(child: area.page),
        ],
      ),
    ),
  );
}
