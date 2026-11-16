import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:zirr_owner/views/widgets/motion.dart';

Widget _host(Widget child, {bool reduce = false}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(disableAnimations: reduce),
    child: Scaffold(body: Center(child: child)),
  ),
);

void main() {
  testWidgets('a figure counts up once, then simply changes', (tester) async {
    await tester.pumpWidget(_host(const CountUp(40)));
    expect(find.text('0'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('40'), findsOneWidget);

    await tester.pumpWidget(_host(const CountUp(41)));
    expect(find.text('41'), findsOneWidget, reason: 'a later change shows at once, with no second count');
  });

  testWidgets('with reduce motion the figure is there at once', (tester) async {
    await tester.pumpWidget(_host(const CountUp(7), reduce: true));
    expect(find.text('7'), findsOneWidget);
  });

  testWidgets('the badge pops for the first request too', (tester) async {
    double scale() => tester.widget<Transform>(find.descendant(of: find.byType(PopOnChange), matching: find.byType(Transform)).first).transform.storage[0];

    await tester.pumpWidget(_host(const PopOnChange(value: 0, child: SizedBox.square(dimension: 24))));
    expect(scale(), 1);
    await tester.pumpWidget(_host(const PopOnChange(value: 1, child: SizedBox.square(dimension: 24))));
    await tester.pump(Motion.slow * 0.33);
    expect(scale(), greaterThan(1.2));
    await tester.pumpAndSettle();
    expect(scale(), closeTo(1, 0.001));
  });
}
