import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../config/money.dart';
import '../controllers/owner_controller.dart';
import '../services/api.dart';
import 'widgets/brand_mark.dart';

/// The owner's four screens. The pause control is on every one of them (blueprint 8.2).
class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    final tabs = ['Today', 'Approvals', 'Money', 'Activity'];
    const icons = [Icons.today, Icons.fact_check_outlined, Icons.account_balance_wallet_outlined, Icons.history];
    return Obx(() {
      final scheme = Theme.of(context).colorScheme;
      return Scaffold(
        appBar: AppBar(
          title: BrandTitle(suffix: c.api.value?.isDemo ?? false ? 'Demo'.tr : null),
          bottom: const PreferredSize(preferredSize: Size.fromHeight(6), child: StitchLine()),
          actions: [
            IconButton(tooltip: 'Refresh'.tr, onPressed: c.reload, icon: const Icon(Icons.refresh)),
            TextButton(onPressed: c.toggleLanguage, child: Text(c.locale.value.languageCode == 'ar' ? 'English' : 'العربية')),
            IconButton(tooltip: 'Sign out'.tr, onPressed: c.signOut, icon: const Icon(Icons.logout)),
          ],
        ),
        body: Column(
          children: [
            Material(
              color: c.paused ? scheme.errorContainer : scheme.surfaceContainerHighest,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        c.paused ? 'Everything is paused. Held actions are kept, not dropped.'.tr : c.error.value?.tr ?? '',
                        style: TextStyle(color: c.paused ? scheme.onErrorContainer : scheme.error),
                      ),
                    ),
                    if (c.paused)
                      FilledButton(onPressed: () => c.setPaused(value: false), child: Text('Resume'.tr))
                    else
                      FilledButton.tonalIcon(
                        onPressed: () => c.setPaused(value: true),
                        icon: const Icon(Icons.pause_circle_outline),
                        label: Text('Pause everything'.tr),
                      ),
                  ],
                ),
              ),
            ),
            Expanded(child: [const _Today(), const _Approvals(), const _Money(), const _Activity()][_tab]),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: [
            for (var i = 0; i < tabs.length; i++)
              NavigationDestination(
                icon: i == 1 && c.approvals.isNotEmpty ? Badge(label: Text('${c.approvals.length}'), child: Icon(icons[i])) : Icon(icons[i]),
                label: tabs[i].tr,
              ),
          ],
        ),
      );
    });
  }
}

class _Today extends StatelessWidget {
  const _Today();

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    return Obx(() {
      final o = c.overview.value ?? const <String, dynamic>{};
      int at(String group, String key) => ((o[group] as Json?)?[key] as int?) ?? 0;
      final tiles = [
        ('Waiting for you', at('approvals', 'open')),
        ('Level 3 requests', at('approvals', 'level_3')),
        ('Held by a pause', (o['held_actions'] as int?) ?? 0),
        ('New leads', at('leads', 'new')),
        ('Orders in progress', at('orders', 'in_progress')),
        ('Orders on hold', at('orders', 'on_hold')),
        ('Unread messages', at('inbox', 'unhandled')),
        ('Flagged messages', at('inbox', 'flagged')),
        ('Open alerts', at('alerts', 'open')),
      ];
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              for (final (label, value) in tiles)
                SizedBox(
                  width: 168,
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('$value', style: Theme.of(context).textTheme.headlineMedium),
                          const SizedBox(height: 4),
                          Text(label.tr),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      );
    });
  }
}

class _Approvals extends StatelessWidget {
  const _Approvals();

  /// Level 3: the owner types the amount and the recipient. One tap is never enough (blueprint 2.4).
  Future<void> _confirm(BuildContext context, OwnerController c, Json request) async {
    final action = request['action'] as Json;
    final amount = TextEditingController();
    final recipient = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Confirm the amount and the recipient'.tr),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(action['summary'] as String),
            const SizedBox(height: 12),
            TextField(
              key: const Key('confirm-amount'),
              controller: amount,
              decoration: InputDecoration(labelText: '${'Amount'.tr} (${action['currency']})'),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              textDirection: TextDirection.ltr,
            ),
            TextField(
              key: const Key('confirm-recipient'),
              controller: recipient,
              decoration: InputDecoration(labelText: 'Recipient'.tr),
              textDirection: TextDirection.ltr,
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text('Cancel'.tr)),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text('Approve'.tr)),
        ],
      ),
    );
    if (confirmed != true) return;
    final typed = amount.text.trim();
    final expected = formatMoney(action['cost_minor'] as int, action['currency'] as String).split(' ').first;
    if (typed != expected || recipient.text.trim() != action['recipient']) {
      c.error.value = 'The amount or the recipient does not match.';
      return;
    }
    await c.decide(request, 'approve', amountMinor: action['cost_minor'] as int, recipient: recipient.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    return Obx(() {
      if (c.approvals.isEmpty) return Center(child: Text('Nothing is waiting for you.'.tr));
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          for (final request in c.approvals)
            Builder(
              builder: (context) {
                final action = request['action'] as Json;
                final level = request['level'] as int;
                final cost = action['cost_minor'] as int? ?? 0;
                final scheme = Theme.of(context).colorScheme;
                Widget row(String label, String value) => Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: '${label.tr}: ',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        TextSpan(text: value),
                      ],
                    ),
                  ),
                );
                return Card(
                  margin: const EdgeInsets.only(bottom: 16),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Chip(label: Text('${'Level'.tr} $level'), backgroundColor: level == 3 ? scheme.errorContainer : scheme.secondaryContainer),
                            const SizedBox(width: 8),
                            Expanded(child: Text(action['action_type'] as String, style: Theme.of(context).textTheme.labelMedium)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(action['summary'] as String, style: Theme.of(context).textTheme.titleMedium),
                        if (action['untrusted_input'] == true)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              'Prompted by outside content. Read it carefully.'.tr,
                              style: TextStyle(color: scheme.error, fontWeight: FontWeight.w600),
                            ),
                          ),
                        row('Requested by', '${action['requested_by_kind']} ${action['requested_by_id'] ?? ''}'),
                        if (action['recipient'] != null) row('Recipient', action['recipient'] as String),
                        if (cost > 0) row('Cost', formatMoney(cost, action['currency'] as String)),
                        row('Risk', action['risk'] as String),
                        row('Expected result', action['expected_result'] as String),
                        row('Expires', request['expires_at'] as String),
                        const SizedBox(height: 12),
                        Text('Exactly what will be sent'.tr, style: const TextStyle(fontWeight: FontWeight.w600)),
                        Container(
                          width: double.infinity,
                          margin: const EdgeInsets.only(top: 6),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(color: scheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(8)),
                          child: SelectableText(const JsonEncoder.withIndent('  ').convert(action['payload'])),
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          children: [
                            FilledButton(onPressed: () => level == 3 ? _confirm(context, c, request) : c.decide(request, 'approve'), child: Text('Approve'.tr)),
                            OutlinedButton(onPressed: () => c.decide(request, 'reject'), child: Text('Reject'.tr)),
                            TextButton(onPressed: () => c.decide(request, 'postpone'), child: Text('Postpone'.tr)),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
        ],
      );
    });
  }
}

class _Money extends StatelessWidget {
  const _Money();

  static const _status = {
    'not_safe_to_spend': 'Not safe to spend',
    'limited_reinvestment_available': 'Limited reinvestment available',
    'safe_to_consider_upgrade': 'Safe to consider an upgrade',
  };
  static const _lines = [
    ('settled_balance', 'Settled balance'),
    ('supplier_obligations', 'Supplier obligations'),
    ('taxes', 'Taxes'),
    ('refund_and_dispute_reserve', 'Refund and dispute reserve'),
    ('available_cash', 'Available cash'),
    ('operating_costs_and_buffer', 'Operating costs and buffer'),
    ('confirmed_net_profit', 'Confirmed net profit'),
    ('approved_reinvestment_budget', 'Reinvestment budget'),
  ];

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    return Obx(() {
      final summaries = ((c.overview.value?['money'] as List?) ?? const []).cast<Json>();
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          for (final s in summaries)
            Card(
              margin: const EdgeInsets.only(bottom: 16),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s['currency'] as String, style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 4),
                    Text(
                      (_status[s['status']] ?? s['status'] as String).tr,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: s['status'] == 'not_safe_to_spend' ? Theme.of(context).colorScheme.error : Theme.of(context).colorScheme.primary,
                      ),
                    ),
                    const Divider(height: 24),
                    // Pending money is shown apart from the waterfall: it is not the company's yet.
                    _line(context, 'Pending'.tr, s['pending_revenue'] as int, s['currency'] as String, muted: true),
                    for (final (key, label) in _lines)
                      _line(
                        context,
                        label.tr,
                        (s['waterfall'] as Json)[key] as int,
                        s['currency'] as String,
                        strong: key == 'available_cash' || key == 'confirmed_net_profit',
                      ),
                  ],
                ),
              ),
            ),
        ],
      );
    });
  }

  Widget _line(BuildContext context, String label, int minor, String currency, {bool strong = false, bool muted = false}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: TextStyle(fontWeight: strong ? FontWeight.w700 : FontWeight.w400, fontStyle: muted ? FontStyle.italic : FontStyle.normal),
          ),
        ),
        Text(
          formatMoney(minor, currency),
          textDirection: TextDirection.ltr,
          style: TextStyle(fontWeight: strong ? FontWeight.w700 : FontWeight.w400),
        ),
      ],
    ),
  );
}

class _Activity extends StatelessWidget {
  const _Activity();

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    return Obx(
      () => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            (c.chainIntact.value ? 'The audit chain is intact.' : 'The audit chain is broken. Stop and investigate.').tr,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: c.chainIntact.value ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.error,
            ),
          ),
          const SizedBox(height: 8),
          for (final e in c.events)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              title: Text(e['event_type'] as String),
              subtitle: Text('${e['at']} · ${e['actor_kind']} ${e['actor_id'] ?? ''}'),
              leading: Text('#${e['seq']}'),
            ),
        ],
      ),
    );
  }
}
