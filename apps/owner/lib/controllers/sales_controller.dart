import 'package:get/get.dart';

import '../models/deal.dart';
import '../models/json.dart';
import '../models/prospect_list.dart';
import '../models/revenue.dart';
import '../services/platform.dart';
import 'session_controller.dart';

/// The revenue engine: the goal, the pipeline, proposals and invoices, and Sales' autopilot.
class SalesController extends GetxController implements PlatformReader {
  SalesController(this._session);

  final SessionController _session;
  final revenue = Rxn<RevenueStatus>();
  final leads = <PipelineLead>[].obs;
  final proposals = <Paper>[].obs;
  final invoices = <Paper>[].obs;
  final plans = <Plan>[].obs;

  /// What the last prospect import said, ready to show.
  final importNote = RxnString();

  @override
  Future<void Function()> read(Platform platform) async {
    final revenueNow = await platform.sales.revenue();
    final pipelineNow = await platform.sales.pipeline();
    return () {
      revenue.value = revenueNow;
      leads.assignAll(pipelineNow.leads);
      proposals.assignAll(pipelineNow.proposals);
      invoices.assignAll(pipelineNow.invoices);
      plans.assignAll(pipelineNow.plans);
    };
  }

  @override
  void clear() {
    revenue.value = null;
    leads.clear();
    proposals.clear();
    invoices.clear();
    plans.clear();
    importNote.value = null;
  }

  /// Leads still being won, in pipeline order, then the rest.
  List<PipelineLead> inStage(String stage) => leads.where((l) => l.stage == stage).toList();

  Future<bool> setAutopilot({required bool on}) => _session.act((p) => p.sales.setAutopilot(on: on));

  Future<bool> changeLead(PipelineLead lead, Json change) => _session.act((p) => p.sales.changeLead(lead.id, change));

  /// Adds the prospects in [text]: the weekly research file pasted whole, or one prospect a line (see parseProspects).
  Future<bool> addProspects(String text) async {
    final prospects = parseProspects(text);
    if (prospects.isEmpty) {
      _session.error.value = 'Write one prospect a line: name, email, company.';
      return false;
    }
    Json? answer;
    final ok = await _session.act((p) async => answer = await p.sales.addProspects(prospects));
    if (ok) {
      final skipped = jsonList(answer?['skipped']).length;
      importNote.value = '${'Added'.tr} ${intOf(answer?['added'])} · ${'Skipped'.tr} $skipped';
    }
    return ok;
  }

  Future<bool> createProposal(Json proposal) => _session.act((p) => p.sales.createProposal(proposal));

  Future<bool> createInvoice(Json invoice) => _session.act((p) => p.sales.createInvoice(invoice));

  Future<bool> markPaid(Paper invoice, String via) => _session.act((p) => p.sales.markPaid(invoice.id, via));

  Future<bool> voidInvoice(Paper invoice) => _session.act((p) => p.sales.voidInvoice(invoice.id));

  /// The lead's plan that still bills, if any.
  Plan? openPlanOf(PipelineLead lead) {
    for (final plan in plans) {
      if (plan.leadId == lead.id && plan.isOpen) return plan;
    }
    return null;
  }

  Future<bool> startPlan(Json plan) => _session.act((p) => p.sales.startPlan(plan));

  Future<bool> cancelPlan(Plan plan) => _session.act((p) => p.sales.cancelPlan(plan.id));

  Future<bool> resumePlan(Plan plan) => _session.act((p) => p.sales.resumePlan(plan.id));
}
