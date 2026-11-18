import 'package:material_ui/material_ui.dart';

import '../config/breakpoints.dart';

/// A screen's scrolling column, as wide as the breakpoint allows and centred on a wide window.
class PageList extends StatelessWidget {
  const PageList({required this.children, super.key});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => GridContainer(
    child: ListView(padding: const EdgeInsets.symmetric(vertical: 16), children: children),
  );
}
