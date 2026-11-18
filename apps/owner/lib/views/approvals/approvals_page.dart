import 'dart:convert';

import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/approvals_controller.dart';
import '../../models/approval.dart';
import '../../models/money.dart';
import '../../widgets/motion.dart';
import '../../widgets/page_list.dart';

/// Each waiting action with its level, exactly what will be sent, and a warning when outside content prompted it.
class ApprovalsPage extends StatelessWidget {
  const ApprovalsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<ApprovalsController>();
    return Obx(() {
      // The one small celebration: a cleared inbox gets a tick that draws itself.
      if (controller.approvals.isEmpty) {
        return Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const DrawnTick(),
              const SizedBox(height: 16),
              Text('Nothing is waiting for you.'.tr, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Appear(
                delay: Motion.slow,
                child: Text('Inbox clear. Enjoy the quiet.'.tr, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
              ),
            ],
          ),
        );
      }
      return PageList(
        children: [
          for (final (i, request) in controller.approvals.indexed)
            Appear(
              key: ValueKey(request.id),
              delay: Motion.stagger * i,
              child: _RequestCard(request: request),
            ),
        ],
      );
    });
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.request});

  final ApprovalRequest request;

  /// Level 3: the owner types the amount and the recipient. One tap is never enough (blueprint 2.4).
  Future<void> _confirm(BuildContext context, ApprovalsController controller) async {
    final action = request.action;
    final amount = TextEditingController();
    final recipient = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Confirm the amount and the recipient'.tr),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(action.summary),
            const SizedBox(height: 12),
            TextField(
              key: const Key('confirm-amount'),
              controller: amount,
              decoration: InputDecoration(labelText: '${'Amount'.tr} (${action.currency ?? ''})'),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              textDirection: TextDirection.ltr,
            ),
            TextField(
              key: const Key('confirm-recipient'),
              controller: recipient,
              decoration: InputDecoration(labelText: 'Recipient'.tr),
              textDirection: TextDirection.ltr,
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text('Cancel'.tr)),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text('Approve'.tr)),
        ],
      ),
    );
    final typedAmount = amount.text.trim();
    final typedRecipient = recipient.text.trim();
    if (confirmed != true) return;
    final expected = formatMoney(action.costMinor, action.currency ?? '').split(' ').first;
    if (typedAmount != expected || typedRecipient != action.recipient) {
      controller.mismatch();
      return;
    }
    await controller.decide(request, 'approve', amountMinor: action.costMinor, recipient: typedRecipient);
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<ApprovalsController>();
    final action = request.action;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    Widget row(String label, String value) => Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: '${label.tr}: ',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            TextSpan(text: value),
          ],
        ),
      ),
    );
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Chip(label: Text('${'Level'.tr} ${request.level}'), backgroundColor: request.level == 3 ? scheme.errorContainer : scheme.secondaryContainer),
                const SizedBox(width: 8),
                Expanded(child: Text(action.type, style: theme.textTheme.labelMedium)),
              ],
            ),
            const SizedBox(height: 8),
            Text(action.summary, style: theme.textTheme.titleMedium),
            if (action.untrustedInput)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Prompted by outside content. Read it carefully.'.tr,
                  style: TextStyle(color: scheme.error, fontWeight: FontWeight.w600),
                ),
              ),
            row('Requested by', '${action.requestedByKind} ${action.requestedById ?? ''}'),
            if (action.recipient != null) row('Recipient', action.recipient!),
            if (action.costMinor > 0) row('Cost', formatMoney(action.costMinor, action.currency ?? '')),
            row('Risk', action.risk),
            row('Expected result', action.expectedResult),
            row('Expires', request.expiresAt),
            const SizedBox(height: 12),
            Text('Exactly what will be sent'.tr, style: const TextStyle(fontWeight: FontWeight.w600)),
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 6),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: scheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(8)),
              child: SelectableText(const JsonEncoder.withIndent('  ').convert(action.payload)),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: [
                FilledButton(
                  onPressed: () => request.level == 3 ? _confirm(context, controller) : controller.decide(request, 'approve'),
                  child: Text('Approve'.tr),
                ),
                OutlinedButton(onPressed: () => controller.decide(request, 'reject'), child: Text('Reject'.tr)),
                TextButton(onPressed: () => controller.decide(request, 'postpone'), child: Text('Postpone'.tr)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
