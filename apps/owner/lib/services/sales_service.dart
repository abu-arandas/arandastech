import '../models/deal.dart';
import '../models/json.dart';
import '../models/revenue.dart';
import 'platform_client.dart';

/// The revenue engine: the monthly goal, the pipeline, prospects, proposals, invoices and Sales' autopilot.
abstract interface class SalesService {
  Future<RevenueStatus> revenue();
  Future<({List<PipelineLead> leads, List<Paper> proposals, List<Paper> invoices})> pipeline();

  /// Adds businesses to contact. Returns how many were added, and why the others were not.
  Future<Json> addProspects(List<Json> prospects);

  /// Moves a lead: a stage, its value, a note, or stops its emails.
  Future<void> changeLead(String id, Json change);

  /// Makes a proposal and asks Sales to email it.
  Future<void> createProposal(Json proposal);

  /// Makes an invoice and asks Sales to email it, or records a sale already paid elsewhere.
  Future<void> createInvoice(Json invoice);
  Future<void> markPaid(String invoiceId, String via);
  Future<void> voidInvoice(String invoiceId);

  /// Lets Sales send its approved template emails without asking each time, or stops that.
  Future<void> setAutopilot({required bool on});
}

class HttpSalesService implements SalesService {
  HttpSalesService(this._client);

  final PlatformClient _client;

  @override
  Future<RevenueStatus> revenue() async => RevenueStatus.fromJson(await _client.send('GET', '/api/owner/revenue'));

  @override
  Future<({List<PipelineLead> leads, List<Paper> proposals, List<Paper> invoices})> pipeline() async {
    final json = await _client.send('GET', '/api/owner/pipeline');
    return (
      leads: jsonList(json['leads']).map(PipelineLead.fromJson).toList(),
      proposals: jsonList(json['proposals']).map((p) => Paper.fromJson(p, dateKey: 'valid_until')).toList(),
      invoices: jsonList(json['invoices']).map((i) => Paper.fromJson(i, dateKey: 'due_on')).toList(),
    );
  }

  @override
  Future<Json> addProspects(List<Json> prospects) => _client.send('POST', '/api/owner/prospects', {'prospects': prospects});

  @override
  Future<void> changeLead(String id, Json change) => _client.send('POST', '/api/owner/leads/$id', change);

  @override
  Future<void> createProposal(Json proposal) => _client.send('POST', '/api/owner/proposals', {...proposal, 'send': true});

  @override
  Future<void> createInvoice(Json invoice) => _client.send('POST', '/api/owner/invoices', {...invoice, 'send': invoice['paid_via'] == null});

  @override
  Future<void> markPaid(String invoiceId, String via) => _client.send('POST', '/api/owner/invoices/$invoiceId/paid', {'via': via});

  @override
  Future<void> voidInvoice(String invoiceId) => _client.send('POST', '/api/owner/invoices/$invoiceId/void', {});

  @override
  Future<void> setAutopilot({required bool on}) => _client.send('POST', '/api/owner/sales/autopilot', {'on': on});
}
