import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';
import 'package:zirr_owner/app.dart';
import 'package:zirr_owner/controllers/owner_controller.dart';
import 'package:zirr_owner/services/api.dart';

/// Opens every screen at a phone's and a laptop's width, in both languages. Any overflow fails the test.
void main() {
  tearDown(Get.reset);

  for (final size in const [Size(390, 844), Size(1280, 800)]) {
    for (final language in const ['en', 'ar']) {
      testWidgets('every screen fits at ${size.width.toInt()} wide in $language', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final c = OwnerController(connector: (_, _) => DemoApi(), preferred: Locale(language));
        await tester.pumpWidget(OwnerApp(controller: c));
        await tester.pumpAndSettle();
        expect(find.byType(FilledButton), findsOneWidget);
        expect(Directionality.of(tester.element(find.byType(Scaffold))), language == 'ar' ? TextDirection.rtl : TextDirection.ltr);

        await tester.tap(find.byType(OutlinedButton));
        await tester.pumpAndSettle();
        for (final icon in const [Icons.fact_check_outlined, Icons.groups_outlined, Icons.account_balance_wallet_outlined, Icons.history, Icons.today]) {
          await tester.tap(find.byIcon(icon));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }
      });
    }
  }

  testWidgets('a Level 3 approval asks for the amount and the recipient', (tester) async {
    tester.view.physicalSize = const Size(1280, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final c = OwnerController(connector: (_, _) => DemoApi());
    await tester.pumpWidget(OwnerApp(controller: c));
    await c.connect(demo: true);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.fact_check_outlined));
    await tester.pumpAndSettle();
    expect(find.text('Prompted by outside content. Read it carefully.'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Approve').first);
    await tester.pumpAndSettle();
    expect(find.text('Confirm the amount and the recipient'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('confirm-amount')), '5.90');
    await tester.enterText(find.byKey(const Key('confirm-recipient')), 'layla@example.com');
    await tester.tap(find.widgetWithText(FilledButton, 'Approve').last);
    await tester.pumpAndSettle();
    expect(c.approvals, hasLength(2), reason: 'a wrong amount approves nothing');
    expect(find.text('The amount or the recipient does not match.'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Approve').first);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('confirm-amount')), '59.00');
    await tester.enterText(find.byKey(const Key('confirm-recipient')), 'layla@example.com');
    await tester.tap(find.widgetWithText(FilledButton, 'Approve').last);
    await tester.pumpAndSettle();
    expect(c.approvals, hasLength(1));
  });

  testWidgets('the pause control is on every screen and only resume ends it', (tester) async {
    final c = OwnerController(connector: (_, _) => DemoApi());
    await tester.pumpWidget(OwnerApp(controller: c));
    await c.connect(demo: true);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pause everything'));
    await tester.pumpAndSettle();
    expect(find.text('Everything is paused. Held actions are kept, not dropped.'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.history));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Resume'));
    await tester.pumpAndSettle();
    expect(c.paused, isFalse);
  });

  testWidgets('the owner plans an instruction on the Team screen and starts it', (tester) async {
    tester.view.physicalSize = const Size(1280, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final c = OwnerController(connector: (_, _) => DemoApi());
    await tester.pumpWidget(OwnerApp(controller: c));
    await c.connect(demo: true);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.groups_outlined));
    await tester.pumpAndSettle();
    expect(find.text('Manual mode: no AI key is set. The departments follow fixed rules and cost nothing.'), findsOneWidget);
    expect(find.text('Morning briefing'), findsOneWidget);
    expect(find.text('Sales'), findsOneWidget);

    await tester.tap(find.byKey(const Key('plan')));
    await tester.pumpAndSettle();
    expect(find.text('Write what you want done, in a sentence.'), findsOneWidget, reason: 'an empty instruction plans nothing');

    await tester.enterText(find.byKey(const Key('instruction')), 'Draft three posts and score the leads');
    await tester.tap(find.byKey(const Key('plan')));
    await tester.pumpAndSettle();
    expect(find.text('Waiting for your go-ahead'), findsOneWidget);
    expect(find.text('Draft 3 social posts'), findsOneWidget);

    await tester.tap(find.byKey(const Key('go-ahead')));
    await tester.pumpAndSettle();
    expect(c.commands.first['status'], 'done');
    expect(find.byKey(const Key('go-ahead')), findsNothing);
    await tester.tap(find.text('Run due work now'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
