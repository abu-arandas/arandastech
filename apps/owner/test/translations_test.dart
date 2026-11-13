import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:zirr_owner/config/brand.dart';
import 'package:zirr_owner/l10n/ar.dart';

/// Every text passed to `.tr` in lib/ must have Arabic, and no Arabic entry may be left over.
void main() {
  final used = <String>{};
  for (final file in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
    for (final match in RegExp(r"'((?:[^'\\]|\\.)+)'\s*\.tr\b").allMatches(file.readAsStringSync())) {
      used.add(match.group(1)!);
    }
  }
  // Texts chosen at run time, which the scan above cannot see.
  const dynamicTexts = {
    Brand.wordmark,
    'Today',
    'Approvals',
    'Money',
    'Activity',
    'Could not connect. Check the address and the token.',
    'Waiting for you',
    'Level 3 requests',
    'Held by a pause',
    'New leads',
    'Orders in progress',
    'Orders on hold',
    'Unread messages',
    'Flagged messages',
    'Open alerts',
    'Not safe to spend',
    'Limited reinvestment available',
    'Safe to consider an upgrade',
    'Settled balance',
    'Supplier obligations',
    'Taxes',
    'Refund and dispute reserve',
    'Available cash',
    'Operating costs and buffer',
    'Confirmed net profit',
    'Reinvestment budget',
    'The audit chain is intact.',
    'The audit chain is broken. Stop and investigate.',
    'The amount or the recipient does not match.',
    'Requested by',
    'Cost',
    'Risk',
    'Expected result',
    'Expires',
  };

  test('every text has Arabic', () {
    expect(used, isNotEmpty);
    expect({...used, ...dynamicTexts}.difference(ar.keys.toSet()), isEmpty, reason: 'texts with no Arabic');
  });

  test('no Arabic entry is left over', () {
    expect(ar.keys.toSet().difference({...used, ...dynamicTexts}), isEmpty, reason: 'Arabic entries nothing uses');
  });

  test('no Arabic entry is empty', () {
    expect(ar.values.where((v) => v.trim().isEmpty), isEmpty);
  });
}
