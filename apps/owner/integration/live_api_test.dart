// Runs the app's real client against a running platform in demo mode. Not part of `flutter test`:
//   API_URL=http://localhost:3100 OWNER_TOKEN=... flutter test integration/live_api_test.dart
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:zirr_owner/controllers/owner_controller.dart';
import 'package:zirr_owner/services/api.dart';

void main() {
  final url = Platform.environment['API_URL'];
  final token = Platform.environment['OWNER_TOKEN'];

  test('signs in, reads the platform, pauses and resumes', () async {
    final c = OwnerController(
      connector: (baseUrl, t) => HttpApi(baseUrl: baseUrl, token: t),
    );
    expect(await c.connect(baseUrl: url!, token: 'wrong-token'), isFalse);
    expect(c.signedIn, isFalse);

    expect(
      await c.connect(baseUrl: url, token: token!),
      isTrue,
      reason: c.error.value,
    );
    expect(c.overview.value!['money'], isA<List<dynamic>>());
    expect(c.chainIntact.value, isTrue);
    expect(c.events, isNotEmpty);

    await c.setPaused(value: true);
    expect(c.paused, isTrue);
    await c.setPaused(value: false);
    expect(c.paused, isFalse);
  }, skip: url == null || token == null ? 'set API_URL and OWNER_TOKEN' : false);
}
