import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/sales_controller.dart';
import '../../models/deal.dart';
import 'paper_forms.dart';
import 'plans.dart';
import 'sales_page.dart';

/// One lead: where they are, their note, and the next moves: a stage, a proposal, an invoice, or no more emails.
Future<void> showLeadSheet(BuildContext context, PipelineLead lead) =>
    showModalBottomSheet<void>(context: context, isScrollControlled: true, showDragHandle: true, builder: (context) => _LeadSheet(lead));

class _LeadSheet extends StatelessWidget {
  const _LeadSheet(this.lead);

  final PipelineLead lead;

  @override
  Widget build(BuildContext context) {
    final sales = Get.find<SalesController>();
    final theme = Theme.of(context);
    void close() => Navigator.of(context).pop();
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(lead.title, style: theme.textTheme.titleLarge),
            SelectableText(lead.email, textDirection: TextDirection.ltr),
            if (lead.message != null && lead.message!.isNotEmpty) ...[const SizedBox(height: 8), SelectableText(lead.message!)],
            if (lead.notes.isNotEmpty) ...[const SizedBox(height: 8), Text(lead.notes, style: TextStyle(color: theme.colorScheme.onSurfaceVariant))],
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: SalesPage.stages.containsKey(lead.stage) ? lead.stage : null,
              decoration: InputDecoration(labelText: 'Stage'.tr),
              items: [for (final e in SalesPage.stages.entries) DropdownMenuItem(value: e.key, child: Text(e.value.tr))],
              onChanged: (stage) async {
                if (stage != null && await sales.changeLead(lead, {'stage': stage}) && context.mounted) close();
              },
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.icon(
                  onPressed: () {
                    close();
                    showProposalForm(context, lead);
                  },
                  icon: const Icon(Icons.description_outlined),
                  label: Text('Send a proposal'.tr),
                ),
                OutlinedButton.icon(
                  onPressed: () {
                    close();
                    showInvoiceForm(context, lead: lead);
                  },
                  icon: const Icon(Icons.receipt_long),
                  label: Text('Send an invoice'.tr),
                ),
                if (sales.openPlanOf(lead) == null)
                  OutlinedButton.icon(
                    onPressed: () {
                      close();
                      showPlanForm(context, lead);
                    },
                    icon: const Icon(Icons.autorenew),
                    label: Text('Start a plan'.tr),
                  ),
                if (lead.sequence != null)
                  TextButton(
                    onPressed: () async {
                      if (await sales.changeLead(lead, {'follow_up': false}) && context.mounted) close();
                    },
                    child: Text('Stop the follow-ups'.tr),
                  ),
                if (!lead.doNotContact)
                  TextButton(
                    onPressed: () async {
                      if (await sales.changeLead(lead, {'do_not_contact': true, 'stage': 'lost'}) && context.mounted) close();
                    },
                    child: Text('Never email again'.tr),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
