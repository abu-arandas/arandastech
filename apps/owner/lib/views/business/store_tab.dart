import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/business_controller.dart';
import '../../controllers/session_controller.dart';
import '../../models/json.dart';
import '../../models/money.dart';
import '../../models/order.dart';
import '../../widgets/busy_button.dart';
import '../../widgets/page_list.dart';
import '../../widgets/section_title.dart';

/// The orders (release a held one, prepare a refund that waits in Approvals) and the catalog (put a product on sale).
class StoreTab extends StatelessWidget {
  const StoreTab({super.key});

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

  Future<void> _refund(BuildContext context, BusinessController controller, Order order) async {
    final reason = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Prepare a refund'.tr),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${order.number} · ${formatMoney(order.totalMinor, order.currency)}', textDirection: TextDirection.ltr),
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
    if (ok == true) await controller.proposeRefund(order, reason.text);
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<BusinessController>();
    final session = Get.find<SessionController>();
    return Obx(() {
      final theme = Theme.of(context);
      final scheme = theme.colorScheme;
      final language = session.locale.value.languageCode;
      return PageList(
        children: [
          const SectionTitle('Orders', icon: Icons.local_shipping_outlined),
          if (controller.orders.isEmpty) const EmptyLine('No orders yet.'),
          for (final order in controller.orders)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text('${order.number} · ${order.buyerName}', style: theme.textTheme.titleMedium)),
                        Text(formatMoney(order.totalMinor, order.currency), textDirection: TextDirection.ltr),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      (orderStatuses[order.status] ?? order.status).tr,
                      style: TextStyle(color: order.onHold ? scheme.error : scheme.primary, fontWeight: FontWeight.w600),
                    ),
                    if (order.holdReason != null) Text(order.holdReason!),
                    Wrap(
                      spacing: 8,
                      children: [
                        if (order.onHold) BusyButton(kind: ButtonKind.tonal, onPressed: () => controller.releaseOrder(order), label: 'Release'.tr),
                        if (order.refundable) TextButton(onPressed: () => _refund(context, controller, order), child: Text('Prepare a refund'.tr)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          const SectionTitle('Catalog', icon: Icons.inventory_2_outlined),
          if (controller.products.isEmpty) const EmptyLine('No products yet.'),
          for (final product in controller.products)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(pick(product.name, language, product.slug), style: theme.textTheme.titleMedium)),
                        Chip(label: Text((product.onSale ? 'On sale' : 'Not on sale').tr)),
                      ],
                    ),
                    for (final v in product.variants)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Row(
                          children: [
                            Expanded(child: Text(pick(v.name, language, v.sku))),
                            Text(formatMoney(v.priceMinor, v.currency), textDirection: TextDirection.ltr),
                          ],
                        ),
                      ),
                    if (product.canPublish) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          BusyButton(kind: ButtonKind.tonal, onPressed: () => controller.publishProduct(product), label: 'Put on sale'.tr),
                          Text('You confirm it in Approvals.'.tr, style: theme.textTheme.bodySmall),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
      );
    });
  }
}
