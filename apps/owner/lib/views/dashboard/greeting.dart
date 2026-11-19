import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../widgets/fun.dart';
import '../../widgets/motion.dart';
import '../../widgets/section_title.dart';
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
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.only(top: 8, bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Eyebrow(MaterialLocalizations.of(context).formatFullDate(now)),
          const SizedBox(height: 6),
          Appear(child: Text(hello(now.hour).tr, style: theme.textTheme.headlineSmall)),
          const SizedBox(height: 4),
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
                style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ),
          ),
          const SizedBox(height: 12),
          const SewIn(child: StitchLine()),
        ],
      ),
    );
  }
}
