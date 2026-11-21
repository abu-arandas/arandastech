import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../config/breakpoints.dart';

/// An area's tabs as a row of pills, lined up with the page's content under the heading. Labels are English keys,
/// translated here.
class AreaTabs extends StatelessWidget implements PreferredSizeWidget {
  const AreaTabs(this.labels, {super.key});

  final List<String> labels;

  @override
  Size get preferredSize => const Size.fromHeight(52);

  @override
  Widget build(BuildContext context) => GridContainer(
    child: Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: TabBar(
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          padding: EdgeInsets.zero,
          labelPadding: const EdgeInsets.symmetric(horizontal: 18),
          tabs: [for (final label in labels) Tab(height: 40, text: label.tr)],
        ),
      ),
    ),
  );
}
