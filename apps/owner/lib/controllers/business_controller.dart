import 'package:get/get.dart';

import '../models/inbox_message.dart';
import '../models/lead.dart';
import '../models/order.dart';
import '../models/product.dart';
import '../services/platform.dart';
import 'session_controller.dart';

/// Customers and the store.
class BusinessController extends GetxController implements PlatformReader {
  BusinessController(this._session);

  final SessionController _session;
  final leads = <Lead>[].obs;
  final messages = <InboxMessage>[].obs;
  final orders = <Order>[].obs;
  final products = <Product>[].obs;

  @override
  Future<void Function()> read(Platform platform) async {
    // New mail first, so it is in the inbox read below. A mailbox that is not connected, or slow, never stops the rest.
    try {
      await platform.business.syncInbox();
    } on Object {
      // Read what is there.
    }
    final leadsNow = await platform.business.leads();
    final messagesNow = await platform.business.inbox();
    final ordersNow = await platform.business.orders();
    final productsNow = await platform.business.products();
    return () {
      leads.assignAll(leadsNow);
      messages.assignAll(messagesNow);
      orders.assignAll(ordersNow);
      products.assignAll(productsNow);
    };
  }

  @override
  void clear() {
    leads.clear();
    messages.clear();
    orders.clear();
    products.clear();
  }

  /// Only asks: the product goes on sale when the owner confirms it in Approvals, where the margin checks show.
  Future<bool> publishProduct(Product product) => _session.act((p) => p.business.publishProduct(product.id));

  Future<bool> releaseOrder(Order order) => _session.act((p) => p.business.releaseOrder(order.id));

  /// The refund is only prepared here. It appears in Approvals, where the owner confirms the amount and the recipient.
  Future<bool> proposeRefund(Order order, String reason, {int? amountMinor}) {
    if (reason.trim().length < 3) {
      _session.error.value = 'Write the reason for the refund.';
      return Future.value(false);
    }
    return _session.act((p) => p.business.proposeRefund(order.id, reason: reason.trim(), amountMinor: amountMinor));
  }
}
