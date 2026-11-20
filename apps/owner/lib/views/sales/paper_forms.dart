import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/sales_controller.dart';
import '../../models/deal.dart';
import '../../models/json.dart';

/// The small forms of Sales: a proposal, an invoice or a sale made elsewhere, and a list of prospects.

Future<void> showProposalForm(BuildContext context, PipelineLead lead) => showDialog<void>(
  context: context,
  builder: (context) => _PaperForm(lead: lead, proposal: true),
);

Future<void> showInvoiceForm(BuildContext context, {PipelineLead? lead}) => showDialog<void>(
  context: context,
  builder: (context) => _PaperForm(lead: lead, proposal: false),
);

Future<void> showProspectsForm(BuildContext context) => showDialog<void>(context: context, builder: (context) => const _ProspectsForm());

class _PaperForm extends StatefulWidget {
  const _PaperForm({required this.lead, required this.proposal});

  final PipelineLead? lead;
  final bool proposal;

  @override
  State<_PaperForm> createState() => _PaperFormState();
}

class _PaperFormState extends State<_PaperForm> {
  final _title = TextEditingController();
  final _amount = TextEditingController();
  final _notes = TextEditingController();
  final _buyer = TextEditingController();
  String _currency = 'USD';
  int _deposit = 50;

  /// For a sale without a lead: how it was already paid. Null sends an invoice instead.
  String? _paidVia;

  bool get _sale => widget.lead == null;

  @override
  void initState() {
    super.initState();
    if (_sale) _paidVia = 'gumroad';
  }

  @override
  void dispose() {
    for (final c in [_title, _amount, _notes, _buyer]) {
      c.dispose();
    }
    super.dispose();
  }

  Json _body() {
    final items = [
      {'description': _title.text.trim(), 'amount': _amount.text.trim()},
    ];
    if (widget.proposal) {
      return {
        'lead_id': widget.lead!.id,
        'title': _title.text.trim(),
        'items': items,
        'currency': _currency,
        'deposit_percent': _deposit,
        'notes': _notes.text.trim(),
      };
    }
    return {
      'lead_id': ?widget.lead?.id,
      'title': _title.text.trim(),
      'items': items,
      'currency': _currency,
      if (_sale) 'buyer_name': _buyer.text.trim().isEmpty ? 'Buyer' : _buyer.text.trim(),
      'paid_via': ?_paidVia,
    };
  }

  Future<void> _save() async {
    final sales = Get.find<SalesController>();
    final ok = widget.proposal ? await sales.createProposal(_body()) : await sales.createInvoice(_body());
    if (ok && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text((widget.proposal ? 'Send a proposal' : (_sale ? 'Record a sale' : 'Send an invoice')).tr),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.lead != null) Align(alignment: AlignmentDirectional.centerStart, child: Text(widget.lead!.title)),
          TextField(
            controller: _title,
            decoration: InputDecoration(labelText: 'What it is for'.tr),
          ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _amount,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(labelText: 'Amount'.tr),
                ),
              ),
              const SizedBox(width: 12),
              DropdownButton<String>(
                value: _currency,
                items: [
                  for (final c in ['USD', 'JOD', 'EUR']) DropdownMenuItem(value: c, child: Text(c)),
                ],
                onChanged: (c) => setState(() => _currency = c ?? 'USD'),
              ),
            ],
          ),
          if (widget.proposal) ...[
            DropdownButtonFormField<int>(
              initialValue: _deposit,
              decoration: InputDecoration(labelText: 'Invoiced on acceptance'.tr),
              items: [
                for (final d in [0, 30, 50, 100]) DropdownMenuItem(value: d, child: Text(d == 0 ? 'Everything'.tr : '$d%')),
              ],
              onChanged: (d) => setState(() => _deposit = d ?? 50),
            ),
            TextField(
              controller: _notes,
              maxLines: 4,
              decoration: InputDecoration(labelText: 'Scope and notes for the client'.tr),
            ),
          ],
          if (_sale) ...[
            TextField(
              controller: _buyer,
              decoration: InputDecoration(labelText: 'Buyer'.tr),
            ),
            DropdownButtonFormField<String>(
              initialValue: _paidVia,
              decoration: InputDecoration(labelText: 'Paid by'.tr),
              items: [
                for (final via in ['gumroad', 'paypal', 'bank', 'cliq', 'cash']) DropdownMenuItem(value: via, child: Text(via)),
              ],
              onChanged: (via) => setState(() => _paidVia = via),
            ),
          ],
        ],
      ),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: Text('Cancel'.tr)),
      FilledButton(onPressed: _save, child: Text((widget.proposal || !_sale ? 'Ask Sales to send it' : 'Record it').tr)),
    ],
  );
}

class _ProspectsForm extends StatefulWidget {
  const _ProspectsForm();

  @override
  State<_ProspectsForm> createState() => _ProspectsFormState();
}

class _ProspectsFormState extends State<_ProspectsForm> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text('Add prospects'.tr),
    content: SizedBox(
      width: 520,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'One a line: name, email, company, country, "shop" or "agency", and for someone already emailed: how many emails and the last date (2026-11-18).'
                .tr,
          ),
          const SizedBox(height: 4),
          Text('Or paste the weekly research file whole, with its header line.'.tr),
          const SizedBox(height: 8),
          TextField(
            controller: _text,
            maxLines: 10,
            textDirection: TextDirection.ltr,
            decoration: const InputDecoration(hintText: 'Lina, lina@agency.com, Agency One, Jordan'),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: Text('Cancel'.tr)),
      FilledButton(
        onPressed: () async {
          if (await Get.find<SalesController>().addProspects(_text.text) && context.mounted) Navigator.of(context).pop();
        },
        child: Text('Add'.tr),
      ),
    ],
  );
}
