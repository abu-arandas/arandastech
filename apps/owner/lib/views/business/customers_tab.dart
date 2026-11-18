import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/business_controller.dart';
import '../../models/lead.dart';
import '../../widgets/motion.dart';
import '../../widgets/page_list.dart';
import '../../widgets/section_title.dart';

/// The lead pipeline with scores, and the messages, flagged ones marked.
class CustomersTab extends StatelessWidget {
  const CustomersTab({super.key});

  static const stages = {
    'new': 'New',
    'qualified': 'Qualified',
    'proposal_sent': 'Proposal sent',
    'won': 'Won',
    'lost': 'Lost',
    'in_delivery': 'In delivery',
    'delivered': 'Delivered',
    'paid': 'Paid',
    'retained': 'Retained',
  };

  void _open(BuildContext context, Lead lead) => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(lead.name),
      content: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            SelectableText(lead.message ?? ''),
            const SizedBox(height: 12),
            Text('Why this score'.tr, style: const TextStyle(fontWeight: FontWeight.w600)),
            for (final reason in lead.scoreReasons) Text(reason),
          ],
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text('Close'.tr))],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<BusinessController>();
    return Obx(() {
      final scheme = Theme.of(context).colorScheme;
      return PageList(
        children: [
          const SectionTitle('Lead pipeline'),
          if (controller.leads.isEmpty) const EmptyLine('No leads yet.'),
          for (final (i, lead) in controller.leads.indexed)
            Appear(
              delay: Motion.stagger * i,
              child: Card(
                child: ListTile(
                  title: Text(lead.name),
                  subtitle: Text([lead.email, (stages[lead.stage] ?? lead.stage).tr, ?lead.packageId].join(' · ')),
                  trailing: lead.score == null
                      ? null
                      : CircleAvatar(
                          backgroundColor: lead.score! >= 60 ? scheme.primaryContainer : scheme.surfaceContainerHighest,
                          child: Text('${lead.score}'),
                        ),
                  onTap: () => _open(context, lead),
                ),
              ),
            ),
          const SectionTitle('Messages'),
          if (controller.messages.isEmpty) const EmptyLine('No messages yet.'),
          for (final m in controller.messages)
            Card(
              child: ListTile(
                leading: Icon(switch (m.channel) {
                  'whatsapp' => Icons.chat_outlined,
                  'form' => Icons.assignment_outlined,
                  _ => Icons.mail_outline,
                }),
                title: Text(m.subject ?? m.fromAddress ?? ''),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(m.body ?? '', maxLines: 2, overflow: TextOverflow.ellipsis),
                    if (m.flagged)
                      Text(
                        'Tries to give the bots instructions. Only a draft is allowed.'.tr,
                        style: TextStyle(color: scheme.error, fontWeight: FontWeight.w600),
                      ),
                  ],
                ),
                trailing: m.handled ? const Icon(Icons.done) : null,
              ),
            ),
        ],
      );
    });
  }
}
