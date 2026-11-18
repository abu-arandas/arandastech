import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import 'customers_tab.dart';
import 'money_tab.dart';
import 'store_tab.dart';

/// Customers, Store and Money (blueprint 8.2): the leads and messages, the catalog and orders, and the books.
class BusinessPage extends StatelessWidget {
  const BusinessPage({super.key});

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 3,
    child: Column(
      children: [
        TabBar(
          tabs: [
            Tab(text: 'Customers'.tr),
            Tab(text: 'Store'.tr),
            Tab(text: 'Money'.tr),
          ],
        ),
        const Expanded(child: TabBarView(children: [CustomersTab(), StoreTab(), MoneyTab()])),
      ],
    ),
  );
}
