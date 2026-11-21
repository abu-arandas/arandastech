import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../config/breakpoints.dart';
import '../../controllers/session_controller.dart';
import '../../models/overview.dart';
import '../../widgets/motion.dart';
import '../../widgets/page_list.dart';
import '../dashboard/areas.dart';
import '../dashboard/greeting.dart';
import '../sales/goal_card.dart';
import 'briefing_card.dart';
import 'metrics_card.dart';
import 'needs_you_card.dart';
import 'stat_tile.dart';

/// The goal beside what needs the owner, the same height, on a desktop. On a narrower screen the two stack, and what
/// waits for the owner comes first: it is the thing to do now.
class _Lead extends StatelessWidget {
  const _Lead({required this.overview});

  final Overview overview;

  @override
  Widget build(BuildContext context) {
    const goal = Appear(child: GoalCard());
    final needs = Appear(
      delay: Motion.stagger * 2,
      child: NeedsYouCard(overview: overview, fill: context.isDesktop),
    );
    if (!context.isDesktop) return Column(children: [needs, const SizedBox(height: 16), goal]);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Expanded(flex: 2, child: goal),
          const SizedBox(width: 16),
          Expanded(child: needs),
        ],
      ),
    );
  }
}

/// The dashboard's first screen: a hello, the month against the goal beside what needs the owner, the morning briefing,
/// the day's counts as tiles that open their area, and the numbers of the last 30 days. One column on a phone, a grid
/// on wider screens.
class TodayPage extends StatelessWidget {
  const TodayPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionController>();
    return Obx(() {
      final o = session.overview.value ?? const Overview();
      final tiles = [
        StatTile(label: 'New leads', value: o.newLeads, icon: Icons.person_add_alt, zero: 'Quiet. Sales is writing.', opens: Area.sales),
        StatTile(
          label: 'Orders in progress',
          value: o.ordersInProgress,
          icon: Icons.local_shipping_outlined,
          zero: 'Nothing on the sewing machine.',
          opens: Area.business,
        ),
        StatTile(label: 'Orders on hold', value: o.ordersOnHold, icon: Icons.pan_tool_outlined, zero: 'Nothing stuck. Lovely.', opens: Area.business),
        StatTile(
          label: 'Unread messages',
          value: o.unreadMessages,
          icon: Icons.mark_email_unread_outlined,
          zero: 'Inbox zero. Frame it.',
          opens: Area.business,
        ),
        StatTile(label: 'Flagged messages', value: o.flaggedMessages, icon: Icons.flag_outlined, zero: 'No suspicious mail today.', opens: Area.business),
        StatTile(label: 'Open alerts', value: o.openAlerts, icon: Icons.notifications_none, zero: 'All calm. Suspiciously calm.', opens: Area.systems),
      ];
      return PageList(
        children: [
          const Greeting(),
          const SizedBox(height: 24),
          _Lead(overview: o),
          const SizedBox(height: 16),
          const Appear(child: BriefingCard()),
          const SizedBox(height: 16),
          GridRow(
            children: [
              for (final (i, tile) in tiles.indexed)
                GridCol(
                  xs: 6,
                  md: 4,
                  xxl: 2,
                  child: Appear(delay: Motion.stagger * (i + 3), child: tile),
                ),
            ],
          ),
          const SizedBox(height: 16),
          const MetricsCard(),
        ],
      );
    });
  }
}
