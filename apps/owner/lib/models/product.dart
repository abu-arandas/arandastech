import 'json.dart';

/// A product in the store, drafts included, with its prices.
class Product {
  const Product({
    required this.id,
    required this.slug,
    required this.kind,
    required this.name,
    required this.status,
    this.isTest = false,
    this.variants = const [],
  });

  factory Product.fromJson(Json json) => Product(
    id: json['id']! as String,
    slug: '${json['slug']}',
    kind: '${json['kind']}',
    name: localizedOf(json['name']),
    status: '${json['status']}',
    isTest: json['is_test'] == true,
    variants: jsonList(json['variants']).map(ProductVariant.fromJson).toList(),
  );

  final String id;
  final String slug;

  /// `digital` or `physical`.
  final String kind;
  final Localized name;

  /// `draft`, `pending_approval`, `published` or `paused`.
  final String status;
  final bool isTest;
  final List<ProductVariant> variants;

  bool get onSale => status == 'published';

  /// Whether the owner can ask to put it on sale.
  bool get canPublish => status == 'draft' || status == 'paused';
}

class ProductVariant {
  const ProductVariant({required this.sku, required this.name, required this.priceMinor, required this.currency});

  factory ProductVariant.fromJson(Json json) =>
      ProductVariant(sku: '${json['sku']}', name: localizedOf(json['name']), priceMinor: intOf(json['price_minor']), currency: '${json['currency']}');

  final String sku;
  final Localized name;
  final int priceMinor;
  final String currency;
}
