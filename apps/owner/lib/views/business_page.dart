import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../config/money.dart';
import '../controllers/owner_controller.dart';
import '../services/api.dart';
import 'home_page.dart';
import 'widgets/motion.dart';

/// Customers, Store and Money (blueprint 8.2): the leads and messages, the catalog and orders, and the books.
class BusinessPage extends StatelessWidget {
  const BusinessPage({super.key});

  static const stages = {
    'new': 'New',
    'qualified': 'Qualified',
    'proposal_sent': 'Proposal sent',
    'won': 'Won',
    'lost': 'Lost',
    'in_delivery': 'In delivery',
    'delivered': 'Delivered',
    'paid': 'Paid',
    'retained': 'Retained',
  };

  static const orderStatuses = {
    'pending_payment': 'Waiting for payment',
    'paid': 'Paid',
    'on_hold': 'On hold',
    'fulfilling': 'Being fulfilled',
    'shipped': 'Shipped',
    'delivered': 'Delivered',
    'completed': 'Completed',
    'return_requested': 'Return requested',
    'canceled': 'Canceled',
    'refunded': 'Refunded',
    'expired': 'Expired',
  };

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 3,
    child: Column(
      children: [
        TabBar(
          tabs: [
            Tab(text: 'Customers'.tr),
            Tab(text: 'Store'.tr),
            Tab(text: 'Money'.tr),
          ],
        ),
        const Expanded(child: TabBarView(children: [_Customers(), _Store(), MoneyView()])),
      ],
    ),
  );
}

class _Customers extends StatelessWidget {
  const _Customers();

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    return Obx(() {
      final theme = Theme.of(context);
      final scheme = theme.colorScheme;
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Lead pipeline'.tr, style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          if (c.leads.isEmpty) Text('No leads yet.'.tr, style: TextStyle(color: scheme.onSurfaceVariant)),
          for (final (i, lead) in c.leads.indexed)
            Appear(
              delay: Motion.stagger * i,
              child: Card(
                child: ListTile(
                  title: Text(lead['name'] as String),
                  subtitle: Text(
                    [
                      lead['email'] as String,
                      (BusinessPage.stages[lead['stage']] ?? lead['stage'] as String).tr,
                      if (lead['package_id'] != null) lead['package_id'] as String,
                    ].join(' · '),
                  ),
                  trailing: lead['score'] == null
                      ? null
                      : CircleAvatar(
                          backgroundColor: (lead['score'] as int) >= 60 ? scheme.primaryContainer : scheme.surfaceContainerHighest,
                          child: Text('${lead['score']}'),
                        ),
                  onTap: () => showDialog<void>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: Text(lead['name'] as String),
                      content: SingleChildScrollView(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            SelectableText(lead['message'] as String? ?? ''),
                            const SizedBox(height: 12),
                            Text('Why this score'.tr, style: const TextStyle(fontWeight: FontWeight.w600)),
                            for (final reason in ((lead['score_reasons'] as List?) ?? const []).cast<String>()) Text(reason),
                          ],
                        ),
                      ),
                      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text('Close'.tr))],
                    ),
                  ),
                ),
              ),
            ),
          const SizedBox(height: 20),
          Text('Messages'.tr, style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          if (c.messages.isEmpty) Text('No messages yet.'.tr, style: TextStyle(color: scheme.onSurfaceVariant)),
          for (final m in c.messages)
            Card(
              child: ListTile(
                leading: Icon(switch (m['channel']) {
                  'whatsapp' => Icons.chat_outlined,
                  'form' => Icons.assignment_outlined,
                  _ => Icons.mail_outline,
                }),
                title: Text((m['subject'] as String?) ?? (m['from_address'] as String? ?? '')),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(m['body'] as String? ?? '', maxLines: 2, overflow: TextOverflow.ellipsis),
                    if (m['flagged'] == true)
                      Text(
                        'Tries to give the bots instructions. Only a draft is allowed.'.tr,
                        style: TextStyle(color: scheme.error, fontWeight: FontWeight.w600),
                      ),
                  ],
                ),
                trailing: m['handled'] == true ? const Icon(Icons.done) : null,
              ),
            ),
        ],
      );
    });
  }
}

class _Store extends StatelessWidget {
  const _Store();

  Future<void> _refund(BuildContext context, OwnerController c, Json order) async {
    final reason = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Prepare a refund'.tr),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${order['number']} · ${formatMoney(order['total_minor'] as int, order['currency'] as String)}', textDirection: TextDirection.ltr),
            const SizedBox(height: 8),
            TextField(
              key: const Key('refund-reason'),
              controller: reason,
              decoration: InputDecoration(labelText: 'Reason'.tr),
            ),
            const SizedBox(height: 8),
            Text('It waits in Approvals, where you confirm the amount and the recipient.'.tr),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text('Cancel'.tr)),
          FilledButton(key: const Key('refund-prepare'), onPressed: () => Navigator.of(context).pop(true), child: Text('Prepare'.tr)),
        ],
      ),
    );
    if (ok == true) await c.proposeRefund(order, reason.text);
  }

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    return Obx(() {
      final theme = Theme.of(context);
      final scheme = theme.colorScheme;
      final language = c.locale.value.languageCode;
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Orders'.tr, style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          if (c.orders.isEmpty) Text('No orders yet.'.tr, style: TextStyle(color: scheme.onSurfaceVariant)),
          for (final order in c.orders)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text('${order['number']} · ${order['buyer_name']}', style: theme.textTheme.titleMedium)),
                        Text(formatMoney(order['total_minor'] as int, order['currency'] as String), textDirection: TextDirection.ltr),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      (BusinessPage.orderStatuses[order['status']] ?? order['status'] as String).tr,
                      style: TextStyle(color: order['status'] == 'on_hold' ? scheme.error : scheme.primary, fontWeight: FontWeight.w600),
                    ),
                    if (order['hold_reason'] != null) Text(order['hold_reason'] as String),
                    Wrap(
                      spacing: 8,
                      children: [
                        if (order['status'] == 'on_hold') FilledButton.tonal(onPressed: () => c.releaseOrder(order), child: Text('Release'.tr)),
                        if (const [
                          'paid',
                          'on_hold',
                          'fulfilling',
                          'shipped',
                          'delivered',
                          'completed',
                          'return_requested',
                          'canceled',
                        ].contains(order['status']))
                          TextButton(onPressed: () => _refund(context, c, order), child: Text('Prepare a refund'.tr)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 20),
          Text('Catalog'.tr, style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          for (final product in c.products)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(((product['name'] as Json?)?[language] ?? product['slug']) as String, style: theme.textTheme.titleMedium),
                    for (final v in ((product['variants'] as List?) ?? const []).cast<Json>())
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Row(
                          children: [
                            Expanded(child: Text(((v['name'] as Json?)?[language] ?? v['sku']) as String)),
                            Text(formatMoney(v['price_minor'] as int, v['currency'] as String), textDirection: TextDirection.ltr),
                          ],
                        ),
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
