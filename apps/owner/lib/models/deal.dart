import 'json.dart';
import 'money.dart';

/// A lead in the sales pipeline: who they are, where they are, and what Sales does next.
class PipelineLead {
  const PipelineLead({
    required this.id,
    required this.name,
    required this.email,
    required this.stage,
    this.kind = 'inbound',
    this.company,
    this.country,
    this.valueMinor,
    this.valueCurrency,
    this.sequence,
    this.nextStepAt,
    this.doNotContact = false,
    this.notes = '',
    this.message,
  });

  factory PipelineLead.fromJson(Json json) => PipelineLead(
    id: '${json['id']}',
    name: '${json['name']}',
    email: '${json['email']}',
    stage: '${json['stage']}',
    kind: '${json['kind'] ?? 'inbound'}',
    company: json['company'] as String?,
    country: json['country'] as String?,
    valueMinor: (json['value_minor'] as num?)?.toInt(),
    valueCurrency: json['value_currency'] as String?,
    sequence: json['sequence'] as String?,
    nextStepAt: json['next_step_at'] as String?,
    doNotContact: json['do_not_contact'] == true,
    notes: '${json['notes'] ?? ''}',
    message: json['message'] as String?,
  );

  final String id;
  final String name;
  final String email;
  final String stage;
  final String kind;
  final String? company;
  final String? country;
  final int? valueMinor;
  final String? valueCurrency;
  final String? sequence;
  final String? nextStepAt;
  final bool doNotContact;
  final String notes;
  final String? message;

  String get title => company == null || company!.isEmpty ? name : '$company · $name';
  String? get value => valueMinor == null ? null : formatMoney(valueMinor!, valueCurrency ?? 'USD');
}

/// A proposal or an invoice: what was offered or billed, and where it stands.
class Paper {
  const Paper({
    required this.id,
    required this.number,
    required this.title,
    required this.totalMinor,
    required this.currency,
    required this.status,
    this.leadId,
    this.date,
  });

  factory Paper.fromJson(Json json, {String dateKey = 'created_at'}) => Paper(
    id: '${json['id']}',
    number: '${json['number']}',
    title: '${json['title']}',
    totalMinor: intOf(json['total_minor']),
    currency: '${json['currency']}',
    status: '${json['status']}',
    leadId: json['lead_id'] as String?,
    date: json[dateKey] as String?,
  );

  final String id;
  final String number;
  final String title;
  final int totalMinor;
  final String currency;
  final String status;
  final String? leadId;

  /// When it is valid until (a proposal) or due (an invoice).
  final String? date;

  String get total => formatMoney(totalMinor, currency);
}

/// A plan: what a client pays every month or year, or once when a free trial ends, and where it stands.
class Plan {
  const Plan({
    required this.id,
    required this.leadId,
    required this.title,
    required this.buyerName,
    required this.amountMinor,
    required this.currency,
    required this.every,
    required this.status,
    this.nextInvoiceOn,
  });

  factory Plan.fromJson(Json json) => Plan(
    id: '${json['id']}',
    leadId: '${json['lead_id']}',
    title: '${json['title']}',
    buyerName: '${json['buyer_name']}',
    amountMinor: intOf(json['amount_minor']),
    currency: '${json['currency']}',
    every: '${json['every']}',
    status: '${json['status']}',
    nextInvoiceOn: json['next_invoice_on'] as String?,
  );

  final String id;
  final String leadId;
  final String title;
  final String buyerName;
  final int amountMinor;
  final String currency;

  /// once, month or year.
  final String every;

  /// trial, active, on_hold, ended or cancelled.
  final String status;

  /// The day of the next invoice; null once nothing more is billed.
  final String? nextInvoiceOn;

  String get amount => formatMoney(amountMinor, currency);
  bool get isOpen => status == 'trial' || status == 'active' || status == 'on_hold';
}
