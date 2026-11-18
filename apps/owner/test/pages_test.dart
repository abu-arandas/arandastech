import 'dart:convert';

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
        for (final icon in const [Icons.fact_check_outlined, Icons.groups_outlined, Icons.storefront_outlined, Icons.tune, Icons.today]) {
          await tester.tap(find.byIcon(icon));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          // The inner tabs of Business and Systems.
          final inner = find.byType(Tab);
          for (var i = 0; i < inner.evaluate().length; i++) {
            await tester.tap(inner.at(i));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
          }
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
    await tester.tap(find.byIcon(Icons.tune));
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

  testWidgets('the owner releases a held order and prepares a refund that waits in Approvals', (tester) async {
    tester.view.physicalSize = const Size(1280, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final c = OwnerController(connector: (_, _) => DemoApi());
    await tester.pumpWidget(OwnerApp(controller: c));
    await c.connect(demo: true);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.storefront_outlined));
    await tester.pumpAndSettle();
    expect(find.text('Lead pipeline'), findsOneWidget);
    expect(find.text('Tries to give the bots instructions. Only a draft is allowed.'), findsOneWidget);

    await tester.tap(find.text('Store'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Release'));
    await tester.pumpAndSettle();
    expect(c.orders.firstWhere((o) => o['number'] == 'Z-1002')['status'], 'fulfilling');

    final approvalsBefore = c.approvals.length;
    await tester.tap(find.text('Prepare a refund').first);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('refund-reason')), 'Asked inside the license terms.');
    await tester.tap(find.byKey(const Key('refund-prepare')));
    await tester.pumpAndSettle();
    expect(c.approvals, hasLength(approvalsBefore + 1));
    expect(c.approvals.last['level'], 3);
  });

  testWidgets('the owner changes the policy sheet, resolves an alert, approves memory and revokes a rule', (tester) async {
    tester.view.physicalSize = const Size(1280, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final c = OwnerController(connector: (_, _) => DemoApi());
    await tester.pumpWidget(OwnerApp(controller: c));
    await c.connect(demo: true);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.tune));
    await tester.pumpAndSettle();
    expect(find.text('Connections'), findsOneWidget);
    expect(find.textContaining('Not connected, works as a stand-in'), findsWidgets);
    await tester.tap(find.text('Resolve'));
    await tester.pumpAndSettle();
    expect(find.text('No open alerts.'), findsOneWidget);

    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('1000000'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('policy-value')), 'lots');
    await tester.tap(find.byKey(const Key('policy-save')));
    await tester.pumpAndSettle();
    expect(c.error.value, 'Write a number.');
    await tester.tap(find.text('1000000'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('policy-value')), '500000');
    await tester.tap(find.byKey(const Key('policy-save')));
    await tester.pumpAndSettle();
    expect(c.policy.firstWhere((p) => p['key'] == 'ai.daily_cap_micros')['value'], 500000);
    await tester.tap(find.text('500000'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('policy-value')), '12.5');
    await tester.tap(find.byKey(const Key('policy-save')));
    await tester.pumpAndSettle();
    expect(c.error.value, 'Write a whole number, 0 or more.');

    // A per-currency limit is edited as text: each currency with its amount.
    final limits = c.policy.firstWhere((p) => p['value'] is Map);
    await tester.tap(find.text(jsonEncode(limits['value'])));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('policy-value')), '{"USD": "lots"}');
    await tester.tap(find.byKey(const Key('policy-save')));
    await tester.pumpAndSettle();
    expect(c.error.value, startsWith('Write each currency'));
    await tester.tap(find.text(jsonEncode(limits['value'])));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('policy-value')), '{"USD": 90000, "JOD": null}');
    await tester.tap(find.byKey(const Key('policy-save')));
    await tester.pumpAndSettle();
    expect(c.policy.firstWhere((p) => p['key'] == limits['key'])['value'], {'USD': 90000, 'JOD': null});

    await tester.tap(find.byType(Switch).first);
    await tester.pumpAndSettle();
    expect(c.policy.firstWhere((p) => p['key'] == 'ai.enabled')['value'], isFalse);

    await tester.tap(find.widgetWithText(FilledButton, 'Approve'));
    await tester.pumpAndSettle();
    expect(c.memory.every((m) => m['status'] == 'approved'), isTrue);

    await tester.tap(find.text('Revoke'));
    await tester.pumpAndSettle();
    expect(c.rules.first['status'], 'revoked');
  });

  testWidgets('the owner connects an account with a key the app never shows again', (tester) async {
    tester.view.physicalSize = const Size(1280, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final c = OwnerController(connector: (_, _) => DemoApi());
    await tester.pumpWidget(OwnerApp(controller: c));
    await c.connect(demo: true);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.tune));
    await tester.pumpAndSettle();

    await tester.tap(find.text('GitHub'));
    await tester.pumpAndSettle();
    expect(find.textContaining('fine-grained token'), findsOneWidget);
    final box = find.byKey(const Key('connection-github-token'));
    expect(tester.widget<TextField>(box).obscureText, isTrue);

    await tester.enterText(box, 'github pat');
    await tester.tap(find.byKey(const Key('connection-github-save')));
    await tester.pumpAndSettle();
    expect(c.error.value, 'The value has a space in it. Copy it again without spaces.');

    await tester.enterText(box, 'github_pat_123');
    await tester.tap(find.byKey(const Key('connection-github-save')));
    await tester.pumpAndSettle();
    expect(c.connections.firstWhere((x) => x['id'] == 'github')['mode'], 'live');
    expect(tester.widget<TextField>(find.byKey(const Key('connection-github-token'))).controller!.text, isEmpty);
    expect(find.textContaining('Sample data: nothing was sent.'), findsOneWidget);

    // Gmail offers Google sign-in only after its client is saved, and the redirect address can be copied.
    await tester.tap(find.text('Gmail'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('connection-gmail-sign-in')), findsNothing);
    expect(find.text('https://example.test/api/connect/gmail/callback'), findsOneWidget);

    await tester.tap(find.byKey(const Key('connection-github-disconnect')));
    await tester.pumpAndSettle();
    expect(c.connections.firstWhere((x) => x['id'] == 'github')['mode'], 'mock');
  });
}
