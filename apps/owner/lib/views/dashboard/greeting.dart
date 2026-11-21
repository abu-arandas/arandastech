import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../config/brand.dart';
import '../../config/breakpoints.dart';
import '../../config/theme.dart';
import '../../widgets/brand_mark.dart';
import '../../widgets/fun.dart';
import '../../widgets/motion.dart';
import '../../widgets/stitch_line.dart';

/// Today's heading: the date, a hello for the time of day, and a joke that changes when it is tapped.
class Greeting extends StatefulWidget {
  const Greeting({super.key});

  @override
  State<Greeting> createState() => _GreetingState();
}

class _GreetingState extends State<Greeting> {
  late var _joke = Jokes.greetings.indexOf(Jokes.ofTheDay(Jokes.greetings, DateTime.now()));

  static String hello(int hour) => switch (hour) {
    >= 5 && < 12 => 'Good morning',
    >= 12 && < 17 => 'Good afternoon',
    >= 17 && < 22 => 'Good evening',
    _ => 'Still up?',
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final now = DateTime.now();
    const soft = Color(0xD9FFFFFF);
    return Container(
      width: double.infinity,
      clipBehavior: Clip.antiAlias,
      decoration: ShapeDecoration(
        // Denim in both themes, as on the website's closing panel, with a soft light from the top.
        gradient: const RadialGradient(center: AlignmentDirectional(-0.6, -1.4), radius: 1.6, colors: [Color(0xFF3A5E9F), Brand.denim]),
        shape: AppTheme.shape(28),
        shadows: [BoxShadow(color: Brand.denim.withValues(alpha: 0.2), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Stack(
        children: [
          // A big shirt button resting in the corner, half off the panel.
          const PositionedDirectional(end: -36, top: -30, child: Opacity(opacity: 0.16, child: BrandMark(size: 190))),
          Padding(
            padding: EdgeInsets.all(context.isMobile ? 20 : 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(MaterialLocalizations.of(context).formatFullDate(now), style: theme.textTheme.labelLarge?.copyWith(color: soft, letterSpacing: 0.3)),
                const SizedBox(height: 8),
                Appear(
                  child: Text(hello(now.hour).tr, style: theme.textTheme.headlineLarge?.copyWith(color: Colors.white)),
                ),
                const SizedBox(height: 6),
                Squish(
                  tooltip: 'Another one'.tr,
                  onTap: () => setState(() => _joke = (_joke + 1) % Jokes.greetings.length),
                  child: AnimatedSwitcher(
                    duration: Motion.medium,
                    switchInCurve: Motion.enter,
                    transitionBuilder: (child, animation) => FadeTransition(
                      opacity: animation,
                      child: SlideTransition(
                        position: Tween(begin: const Offset(0, 0.3), end: Offset.zero).animate(animation),
                        child: child,
                      ),
                    ),
                    layoutBuilder: (current, previous) => Stack(alignment: AlignmentDirectional.centerStart, children: [...previous, ?current]),
                    child: Text(
                      Jokes.greetings[_joke].tr,
                      key: ValueKey(_joke),
                      style: theme.textTheme.bodyLarge?.copyWith(color: soft, fontSize: 17),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const SewIn(child: StitchLine()),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
