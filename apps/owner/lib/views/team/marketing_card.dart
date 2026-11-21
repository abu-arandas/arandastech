import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/team_controller.dart';
import '../../models/marketing.dart';
import '../../widgets/section_title.dart';

/// Marketing's weekly posts: the autopilot switch, the post wordings to approve, and the posts it planned lately.
class MarketingCard extends StatelessWidget {
  const MarketingCard({super.key});

  /// What a planned post's action status means to the owner.
  static const statuses = {
    'pending': 'Waiting for you in Approvals',
    'approved': 'Going out',
    'auto_approved': 'Going out',
    'executed': 'Sent to Buffer',
    'rejected': 'Turned down',
    'expired': 'Lapsed',
    'blocked': 'Blocked',
  };

  static const _channels = {'linkedin': 'LinkedIn', 'facebook': 'Facebook'};

  /// Each language named in itself, as a language menu does.
  static const _languages = {'en': 'English', 'ar': 'العربية'};

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<TeamController>();
    return Obx(() {
      final m = controller.marketing.value ?? const MarketingState();
      final scheme = Theme.of(context).colorScheme;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionTitle('Weekly posts', icon: Icons.campaign_outlined, detail: 'Each Sunday Marketing plans Monday, Wednesday and Friday.'),
          Card(
            child: SwitchListTile(
              value: m.autopilot,
              onChanged: (value) => controller.setMarketingAutopilot(on: value),
              title: Text('Marketing autopilot'.tr),
              subtitle: Text(
                m.autopilot
                    ? '${'Posts the approved post wordings by itself, one a day at most, until'.tr} ${m.autopilotUntil!.substring(0, 10)}.'
                    : 'Off: every post waits for you in Approvals.'.tr,
              ),
            ),
          ),
          if (!m.bufferConnected)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.link_off, color: scheme.error),
              title: Text('Buffer is not connected, so no posts go out. Connect it in Systems, Connections.'.tr),
            ),
          Card(
            child: ExpansionTile(
              title: Text('${'Post wordings approved'.tr}: ${m.approvedCount} / ${m.templates.length}'),
              subtitle: Text('Only approved wording is ever posted.'.tr),
              children: [for (final post in m.templates) _TemplateTile(post)],
            ),
          ),
          for (final post in m.posts.take(5))
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(post.channel == 'linkedin' ? Icons.work_outline : Icons.storefront_outlined),
              title: Text((statuses[post.status] ?? post.status).tr),
              subtitle: Text('${_channels[post.channel] ?? post.channel} · ${_languages[post.locale] ?? ''}'),
              trailing: post.scheduledFor == null ? null : Text(post.scheduledFor!.substring(0, 10), textDirection: TextDirection.ltr),
            ),
        ],
      );
    });
  }
}

class _TemplateTile extends StatelessWidget {
  const _TemplateTile(this.post);

  final PostTemplate post;

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<TeamController>();
    final theme = Theme.of(context);
    // Approving covers both languages, so both wordings are shown in full, each in its own direction.
    return ListTile(
      title: Text('${post.title} · ${MarketingCard._channels[post.channel] ?? post.channel}'),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (language, direction) in const [('en', TextDirection.ltr), ('ar', TextDirection.rtl)])
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(post.text[language] ?? '', textDirection: direction, style: theme.textTheme.bodySmall),
            ),
        ],
      ),
      isThreeLine: true,
      trailing: post.approved ? Text('Approved'.tr) : FilledButton.tonal(onPressed: () => controller.approvePost(post), child: Text('Approve'.tr)),
    );
  }
}
