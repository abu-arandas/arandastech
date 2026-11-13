import 'dart:convert';
import 'dart:ui' show Locale;

import 'package:arandas_owner/config/money.dart';
import 'package:arandas_owner/controllers/owner_controller.dart';
import 'package:arandas_owner/services/api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

OwnerController demo() => OwnerController(connector: (_, _) => DemoApi());

void main() {
  test('money keeps each currency in its own decimals', () {
    expect(formatMoney(5900, 'USD'), '59.00 USD');
    expect(formatMoney(5000, 'JOD'), '5.000 JOD');
    expect(formatMoney(-201, 'USD'), '-2.01 USD');
    expect(formatMoney(1, 'JOD'), '0.001 JOD');
  });

  test('starts in Arabic when the device asks for it', () {
    expect(OwnerController(connector: (_, _) => DemoApi(), preferred: const Locale('ar')).locale.value.languageCode, 'ar');
    expect(OwnerController(connector: (_, _) => DemoApi(), preferred: const Locale('fr')).locale.value.languageCode, 'en');
  });

  test('the demo loads the overview, the requests and the log', () async {
    final c = demo();
    expect(await c.connect(demo: true), isTrue);
    expect(c.signedIn, isTrue);
    expect(c.approvals, hasLength(2));
    expect(c.approvals.first['level'], 3);
    expect(c.events, isNotEmpty);
    expect(c.chainIntact.value, isTrue);
  });

  test('a Level 3 approval needs the amount and the recipient to match', () async {
    final c = demo();
    await c.connect(demo: true);
    final refund = c.approvals.first;
    expect(await c.decide(refund, 'approve'), isFalse);
    expect(c.error.value, contains('does not match'));
    expect(await c.decide(refund, 'approve', amountMinor: 59, recipient: 'layla@example.com'), isFalse);
    expect(c.approvals, hasLength(2));
    expect(await c.decide(refund, 'approve', amountMinor: 5900, recipient: 'layla@example.com'), isTrue);
    expect(c.approvals, hasLength(1));
    expect(c.events.first['event_type'], 'approval.approved');
  });

  test('reject removes a request and postpone keeps it', () async {
    final c = demo();
    await c.connect(demo: true);
    await c.decide(c.approvals.last, 'postpone');
    expect(c.approvals, hasLength(2));
    await c.decide(c.approvals.last, 'reject');
    expect(c.approvals, hasLength(1));
  });

  test('pause and resume', () async {
    final c = demo();
    await c.connect(demo: true);
    expect(c.paused, isFalse);
    await c.setPaused(value: true);
    expect(c.paused, isTrue);
    await c.setPaused(value: false);
    expect(c.paused, isFalse);
    c.signOut();
    expect(c.signedIn, isFalse);
  });

  test('the real client sends the owner token and reads the platform', () async {
    final seen = <String>[];
    final client = MockClient((request) async {
      seen.add('${request.method} ${request.url.path} ${request.headers['authorization']} ${request.body}');
      final path = request.url.path;
      if (path.endsWith('/overview')) return http.Response(jsonEncode({'paused': false, 'money': <dynamic>[]}), 200);
      if (path.endsWith('/approvals')) return http.Response(jsonEncode({'approvals': <dynamic>[]}), 200);
      if (path.endsWith('/audit')) return http.Response(jsonEncode({'chain_intact': true, 'events': <dynamic>[]}), 200);
      if (path.endsWith('/decide'))
        return http.Response(
          jsonEncode({
            'error': {'message': 'This request has expired. Nothing was approved.'},
          }),
          409,
        );
      return http.Response('{}', 200);
    });
    final c = OwnerController(
      connector: (url, token) => HttpApi(baseUrl: url, token: token, client: client),
    );
    expect(await c.connect(baseUrl: 'https://platform.example/', token: ' secret '), isTrue);
    expect(seen.first, 'GET /api/owner/overview Bearer secret ');
    expect(await c.decide({'id': 'r1'}, 'approve', amountMinor: 100, recipient: 'a@b.co'), isFalse);
    expect(c.error.value, 'This request has expired. Nothing was approved.');
    expect(seen.any((line) => line.startsWith('POST /api/owner/approvals/r1/decide') && line.contains('"amount_minor":100')), isTrue);
    await c.setPaused(value: true);
    expect(seen.any((line) => line.startsWith('POST /api/owner/pause')), isTrue);
  });

  test('a wrong address does not sign in', () async {
    final c = OwnerController(
      connector: (url, token) =>
          HttpApi(baseUrl: url, token: token, client: MockClient((_) async => http.Response('{"error":{"message":"Sign in to use this."}}', 401))),
    );
    expect(await c.connect(baseUrl: 'https://platform.example', token: 'wrong'), isFalse);
    expect(c.signedIn, isFalse);
    expect(c.error.value, 'Sign in to use this.');
  });
}
