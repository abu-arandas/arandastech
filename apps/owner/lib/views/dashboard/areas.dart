import 'package:material_ui/material_ui.dart';

import '../approvals/approvals_page.dart';
import '../business/business_page.dart';
import '../sales/sales_page.dart';
import '../systems/systems_page.dart';
import '../team/team_page.dart';
import '../today/today_page.dart';

/// The owner's six areas (blueprint 8.2), in the order the menu shows them. Each label is an English key.
enum Area {
  today('Today', Icons.today_outlined, Icons.today),
  sales('Sales', Icons.trending_up, Icons.trending_up),
  approvals('Approvals', Icons.fact_check_outlined, Icons.fact_check),
  team('Team', Icons.groups_outlined, Icons.groups),
  business('Business', Icons.storefront_outlined, Icons.storefront),
  systems('Systems', Icons.tune_outlined, Icons.tune);

  const Area(this.label, this.icon, this.selectedIcon);

  final String label;
  final IconData icon;
  final IconData selectedIcon;

  Widget get page => switch (this) {
    Area.today => const TodayPage(),
    Area.sales => const SalesPage(),
    Area.approvals => const ApprovalsPage(),
    Area.team => const TeamPage(),
    Area.business => const BusinessPage(),
    Area.systems => const SystemsPage(),
  };
}

/// Lets a card deep in a screen open another area, such as Today's "Review approvals".
class AreaScope extends InheritedWidget {
  const AreaScope({required this.current, required this.open, required super.child, super.key});

  final Area current;
  final ValueChanged<Area> open;

  /// Opens [area], when there is a dashboard around [context] to open it in.
  static void go(BuildContext context, Area area) => context.getInheritedWidgetOfExactType<AreaScope>()?.open(area);

  @override
  bool updateShouldNotify(AreaScope old) => old.current != current;
}
