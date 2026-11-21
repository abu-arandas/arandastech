import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../config/breakpoints.dart';
import '../../controllers/sales_controller.dart';
import '../../models/deal.dart';
import '../../widgets/motion.dart';
import '../../widgets/page_list.dart';
import '../../widgets/section_title.dart';
import 'goal_card.dart';
import 'lead_sheet.dart';
import 'paper_forms.dart';
import 'plans.dart';

/// Sales: the goal, the autopilot, the pipeline stage by stage, and the proposals and invoices.
class SalesPage extends StatelessWidget {
  const SalesPage({super.key});

  /// The stages in the order a deal moves through them, with what each means to the owner.
  static const stages = {
    'new': 'To contact',
    'contacted': 'Contacted',
    'replied': 'Replied',
    'meeting': 'Call booked',
    'qualified': 'Qualified',
    'proposal_sent': 'Proposal sent',
    'won': 'Won',
    'in_delivery': 'In delivery',
    'delivered': 'Delivered',
    'paid': 'Paid',
    'retained': 'Retained',
    'lost': 'Lost',
  };

  @override
  Widget build(BuildContext context) {
    final sales = Get.find<SalesController>();
    return Obx(
      () => PageList(
        children: [
          const GoalCard(),
          const SizedBox(height: 12),
          const _Autopilot(),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.tonalIcon(onPressed: () => showProspectsForm(context), icon: const Icon(Icons.person_add_alt), label: Text('Add prospects'.tr)),
              OutlinedButton.icon(onPressed: () => showInvoiceForm(context), icon: const Icon(Icons.receipt_long), label: Text('Record a sale'.tr)),
            ],
          ),
          if (sales.importNote.value != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(sales.importNote.value!)),
          for (final entry in stages.entries)
            if (sales.inStage(entry.key).isNotEmpty) ...[
              SectionTitle('${entry.value.tr} (${sales.inStage(entry.key).length})'),
              for (final (i, lead) in sales.inStage(entry.key).take(30).indexed) Appear(delay: Motion.stagger * i, child: _LeadTile(lead)),
            ],
          if (sales.leads.isEmpty) ...[
            const SizedBox(height: 16),
            const EmptyLine('No leads yet. Add prospects, and Sales writes to them each morning.', icon: Icons.person_search_outlined),
          ],
          if (sales.plans.isNotEmpty) ...[const SectionTitle('Plans', icon: Icons.event_repeat), for (final plan in sales.plans) PlanTile(plan)],
          // Proposals and invoices side by side on wide screens.
          GridRow(
            children: [
              GridCol(
                lg: 6,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SectionTitle('Proposals', icon: Icons.description_outlined),
                    if (sales.proposals.isEmpty) const EmptyLine('No proposals yet.'),
                    for (final p in sales.proposals) _PaperTile(p, kind: 'proposal'),
                  ],
                ),
              ),
              GridCol(
                lg: 6,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SectionTitle('Invoices', icon: Icons.receipt_long_outlined),
                    if (sales.invoices.isEmpty) const EmptyLine('No invoices yet.'),
                    for (final i in sales.invoices) _PaperTile(i, kind: 'invoice'),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The one switch that lets Sales send its approved template emails by itself, with what it does and does not cover.
class _Autopilot extends StatelessWidget {
  const _Autopilot();

  @override
  Widget build(BuildContext context) {
    final sales = Get.find<SalesController>();
    return Obx(() {
      final r = sales.revenue.value;
      final on = r?.autopilot ?? false;
      return Card(
        child: SwitchListTile(
          value: on,
          onChanged: (value) => sales.setAutopilot(on: value),
          title: Text('Sales autopilot'.tr),
          subtitle: Text(
            on
                ? '${'Sends the approved template emails by itself, up to the daily limit, until'.tr} ${r!.autopilotUntil!.substring(0, 10)}. ${'Answers to replies still wait for you.'.tr}'
                : 'Off: every sales email waits for you in Approvals.'.tr,
          ),
        ),
      );
    });
  }
}

class _LeadTile extends StatelessWidget {
  const _LeadTile(this.lead);

  final PipelineLead lead;

  @override
  Widget build(BuildContext context) {
    final details = [lead.email, ?lead.country, ?lead.value, if (lead.doNotContact) 'Do not contact'.tr];
    return Card(
      child: ListTile(
        leading: Icon(lead.kind == 'prospect' ? Icons.outbound_outlined : Icons.move_to_inbox_outlined),
        title: Text(lead.title),
        subtitle: Text(details.join(' · ')),
        trailing: lead.nextStepAt == null ? null : Text(lead.nextStepAt!.substring(5, 10), textDirection: TextDirection.ltr),
        onTap: () => showLeadSheet(context, lead),
      ),
    );
  }
}

class _PaperTile extends StatelessWidget {
  const _PaperTile(this.paper, {required this.kind});

  final Paper paper;
  final String kind;

  static const _status = {
    'draft': 'Draft',
    'sent': 'Sent',
    'accepted': 'Accepted',
    'declined': 'Declined',
    'expired': 'Expired',
    'paid': 'Paid',
    'void': 'Void',
  };

  @override
  Widget build(BuildContext context) {
    final sales = Get.find<SalesController>();
    final open = kind == 'invoice' && paper.status == 'sent';
    return Card(
      child: ListTile(
        title: Text('${paper.number} · ${paper.title}'),
        subtitle: Text('${paper.total} · ${(_status[paper.status] ?? paper.status).tr}${paper.date == null ? '' : ' · ${paper.date}'}'),
        trailing: open
            ? PopupMenuButton<String>(
                onSelected: (choice) => choice == 'void' ? sales.voidInvoice(paper) : sales.markPaid(paper, choice),
                itemBuilder: (context) => [
                  PopupMenuItem(value: 'bank', child: Text('Paid by bank transfer'.tr)),
                  PopupMenuItem(value: 'cliq', child: Text('Paid by CliQ'.tr)),
                  PopupMenuItem(value: 'paypal', child: Text('Paid by PayPal'.tr)),
                  PopupMenuItem(value: 'cash', child: Text('Paid in cash'.tr)),
                  PopupMenuItem(value: 'void', child: Text('Cancel the invoice'.tr)),
                ],
              )
            : null,
      ),
    );
  }
}
