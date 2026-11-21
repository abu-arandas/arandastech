import 'package:material_ui/material_ui.dart';

import '../../widgets/area_tabs.dart';
import 'customers_tab.dart';
import 'money_tab.dart';
import 'store_tab.dart';

/// Customers, Store and Money (blueprint 8.2): the leads and messages, the catalog and orders, and the books.
class BusinessPage extends StatelessWidget {
  const BusinessPage({super.key});

  @override
  Widget build(BuildContext context) => const DefaultTabController(
    length: 3,
    child: Column(
      children: [
        AreaTabs(['Customers', 'Store', 'Money']),
        Expanded(child: TabBarView(children: [CustomersTab(), StoreTab(), MoneyTab()])),
      ],
    ),
  );
}
