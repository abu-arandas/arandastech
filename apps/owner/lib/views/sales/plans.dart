import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/sales_controller.dart';
import '../../models/deal.dart';
import '../../widgets/busy_button.dart';

/// Plans: what a client pays every month or year, or once after a free trial. Sales raises each invoice on its day.

const _howOften = {'once': 'Once', 'month': 'Every month', 'year': 'Every year'};

const _status = {'trial': 'Free trial', 'active': 'Active', 'on_hold': 'On hold: an invoice is late', 'ended': 'Ended', 'cancelled': 'Cancelled'};

/// One plan: who pays, how much and how often, and when the next invoice goes. Open plans can be cancelled or resumed.
class PlanTile extends StatelessWidget {
  const PlanTile(this.plan, {super.key});

  final Plan plan;

  @override
  Widget build(BuildContext context) {
    final sales = Get.find<SalesController>();
    final next = plan.nextInvoiceOn == null ? '' : ' · ${'Next invoice'.tr} ${plan.nextInvoiceOn}';
    return Card(
      child: ListTile(
        leading: Icon(plan.status == 'on_hold' ? Icons.pause_circle_outline : Icons.autorenew),
        title: Text('${plan.buyerName} · ${plan.amount} · ${(_howOften[plan.every] ?? plan.every).tr}'),
        subtitle: Text('${(_status[plan.status] ?? plan.status).tr}$next'),
        trailing: plan.isOpen
            ? PopupMenuButton<String>(
                onSelected: (choice) => choice == 'resume' ? sales.resumePlan(plan) : sales.cancelPlan(plan),
                itemBuilder: (context) => [
                  if (plan.status == 'on_hold') PopupMenuItem(value: 'resume', child: Text('Resume the plan'.tr)),
                  PopupMenuItem(value: 'cancel', child: Text('Cancel the plan'.tr)),
                ],
              )
            : null,
      ),
    );
  }
}

/// Starts a plan for a lead: the amount, how often, and how many free days come first.
Future<void> showPlanForm(BuildContext context, PipelineLead lead) => showDialog<void>(context: context, builder: (context) => _PlanForm(lead));

class _PlanForm extends StatefulWidget {
  const _PlanForm(this.lead);

  final PipelineLead lead;

  @override
  State<_PlanForm> createState() => _PlanFormState();
}

class _PlanFormState extends State<_PlanForm> {
  final _amount = TextEditingController();
  String _currency = 'JOD';
  String _every = 'month';
  int _trialDays = 0;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final ok = await Get.find<SalesController>().startPlan({
      'lead_id': widget.lead.id,
      'amount': _amount.text.trim(),
      'currency': _currency,
      'every': _every,
      'trial_days': _trialDays,
    });
    if (ok && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text('Start a plan'.tr),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.lead.title),
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
                  for (final c in ['JOD', 'USD', 'EUR']) DropdownMenuItem(value: c, child: Text(c)),
                ],
                onChanged: (c) => setState(() => _currency = c ?? 'JOD'),
              ),
            ],
          ),
          DropdownButtonFormField<String>(
            initialValue: _every,
            decoration: InputDecoration(labelText: 'How often'.tr),
            items: [for (final e in _howOften.entries) DropdownMenuItem(value: e.key, child: Text(e.value.tr))],
            onChanged: (every) => setState(() => _every = every ?? 'month'),
          ),
          DropdownButtonFormField<int>(
            initialValue: _trialDays,
            decoration: InputDecoration(labelText: 'Free days first'.tr),
            items: [
              for (final d in [0, 7, 14, 30]) DropdownMenuItem(value: d, child: Text(d == 0 ? 'None: bill today'.tr : '$d')),
            ],
            onChanged: (d) => setState(() => _trialDays = d ?? 0),
          ),
          const SizedBox(height: 8),
          Text('Sales emails each invoice on its day, reminds twice, and puts the plan on hold if an invoice is 14 days late.'.tr),
        ],
      ),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: Text('Cancel'.tr)),
      BusyButton(onPressed: _save, label: 'Start the plan'.tr),
    ],
  );
}
