import '../models/inbox_message.dart';
import '../models/lead.dart';
import '../models/order.dart';
import '../models/product.dart';
import 'platform_client.dart';

/// Customers and the store: leads, messages, orders and products.
abstract interface class BusinessService {
  Future<List<Lead>> leads();
  Future<List<InboxMessage>> inbox();

  /// Asks the platform to read new mail. It reads at most once a minute.
  Future<void> syncInbox();
  Future<List<Order>> orders();

  /// Every product, drafts included.
  Future<List<Product>> products();

  /// Asks to put a product on sale. It waits in Approvals, where the owner confirms it.
  Future<void> publishProduct(String id);

  /// Lets an order that was held for review go on.
  Future<void> releaseOrder(String id);

  /// Prepares a refund. It still waits in Approvals for the confirmed amount and recipient.
  Future<void> proposeRefund(String orderId, {required String reason, int? amountMinor});
}

class HttpBusinessService implements BusinessService {
  HttpBusinessService(this._client);

  final PlatformClient _client;

  @override
  Future<List<Lead>> leads() async => (await _client.list('/api/owner/leads', 'leads')).map(Lead.fromJson).toList();

  @override
  Future<List<InboxMessage>> inbox() async => (await _client.list('/api/owner/inbox', 'messages')).map(InboxMessage.fromJson).toList();

  @override
  Future<void> syncInbox() => _client.send('POST', '/api/owner/inbox/sync', {});

  @override
  Future<List<Order>> orders() async => (await _client.list('/api/owner/orders', 'orders')).map(Order.fromJson).toList();

  @override
  Future<List<Product>> products() async => (await _client.list('/api/owner/products', 'products')).map(Product.fromJson).toList();

  @override
  Future<void> publishProduct(String id) => _client.send('POST', '/api/owner/products/$id/publish', {});

  @override
  Future<void> releaseOrder(String id) => _client.send('POST', '/api/owner/orders/$id/release', {});

  @override
  Future<void> proposeRefund(String orderId, {required String reason, int? amountMinor}) =>
      _client.send('POST', '/api/owner/orders/$orderId/refund', {'reason': reason, 'amount_minor': ?amountMinor});
}
