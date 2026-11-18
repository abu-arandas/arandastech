import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/session_controller.dart';
import '../../models/money.dart';
import '../../models/overview.dart';
import '../../widgets/page_list.dart';

/// The cash waterfall per currency. Money never moves on screen: the cards are simply there.
class MoneyTab extends StatelessWidget {
  const MoneyTab({super.key});

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
    final session = Get.find<SessionController>();
    return Obx(() {
      final scheme = Theme.of(context).colorScheme;
      return PageList(
        children: [
          for (final s in session.overview.value?.money ?? const <MoneySummary>[])
            Card(
              margin: const EdgeInsets.only(bottom: 16),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.currency, style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 4),
                    Text(
                      (_status[s.status] ?? s.status).tr,
                      style: TextStyle(fontWeight: FontWeight.w700, color: s.status == 'not_safe_to_spend' ? scheme.error : scheme.primary),
                    ),
                    const Divider(height: 24),
                    // Pending money is shown apart from the waterfall: it is not the company's yet.
                    _Line(label: 'Pending'.tr, minor: s.pendingRevenue, currency: s.currency, muted: true),
                    for (final (key, label) in _lines)
                      _Line(
                        label: label.tr,
                        minor: s.waterfall[key] ?? 0,
                        currency: s.currency,
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
}

class _Line extends StatelessWidget {
  const _Line({required this.label, required this.minor, required this.currency, this.strong = false, this.muted = false});

  final String label;
  final int minor;
  final String currency;
  final bool strong;
  final bool muted;

  @override
  Widget build(BuildContext context) => Padding(
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
          style: TextStyle(fontWeight: strong ? FontWeight.w700 : FontWeight.w400, fontFeatures: const [FontFeature.tabularFigures()]),
        ),
      ],
    ),
  );
}
