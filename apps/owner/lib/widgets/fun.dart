import 'dart:async';
import 'dart:math' as math;

import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../config/brand.dart';
import 'brand_mark.dart';
import 'motion.dart';

/// The app's jokes, kept in one place so they rotate and never go stale. Each is an English key with its Arabic in
/// lib/l10n. None of them is about money going wrong: a payment, a refund or a failed action is always said plainly.
abstract final class Jokes {
  static const greetings = [
    'The team is busy. You can have a coffee.',
    'No buttons were harmed in the making of this dashboard.',
    'Your agents write the emails. You do the smiling.',
    'Every big business started with one button.',
    'Sales are like buttons: one at a time, and then it all holds.',
    'Press the logo five times. Just saying.',
  ];

  static const loading = ['Sewing the buttons back on…', 'Waking the team up…', 'Counting the buttons…'];

  /// The first joke of the day, so it changes from day to day but not on every refresh.
  static String ofTheDay(List<String> jokes, DateTime now) => jokes[now.difference(DateTime(now.year)).inDays % jokes.length];
}

/// Shrinks its child a touch while it is pressed and springs it back on release, like a real button. Hovering lifts it
/// on a desktop. Nothing moves with reduce motion on.
class Squish extends StatefulWidget {
  const Squish({required this.child, this.onTap, this.tooltip, super.key});

  final Widget child;
  final VoidCallback? onTap;
  final String? tooltip;

  @override
  State<Squish> createState() => _SquishState();
}

class _SquishState extends State<Squish> {
  var _down = false;
  var _hover = false;

  @override
  Widget build(BuildContext context) {
    final still = reduceMotion(context) || widget.onTap == null;
    final scale = still ? 1.0 : (_down ? 0.96 : (_hover ? 1.015 : 1.0));
    final body = MouseRegion(
      cursor: widget.onTap == null ? MouseCursor.defer : SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => setState(() => _down = true),
        onTapCancel: () => setState(() => _down = false),
        onTapUp: (_) => setState(() => _down = false),
        onTap: widget.onTap,
        child: AnimatedScale(scale: scale, duration: _down ? Motion.fast : Motion.medium, curve: _down ? Motion.ease : Motion.pop, child: widget.child),
      ),
    );
    final labelled = widget.onTap == null ? body : Semantics(button: true, child: body);
    final tip = widget.tooltip;
    return tip == null ? labelled : Tooltip(message: tip, child: labelled);
  }
}

/// The Zirr mark, pressing in and out like a button being done up: the app's loader. Still with reduce motion on.
class PressingMark extends StatefulWidget {
  const PressingMark({this.size = 56, super.key});

  final double size;

  @override
  State<PressingMark> createState() => _PressingMarkState();
}

class _PressingMarkState extends State<PressingMark> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!reduceMotion(context) && !_c.isAnimating) unawaited(_c.repeat());
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    builder: (context, child) {
      // Pressed in for the first third, then out with a little bounce, then a rest.
      final t = _c.value;
      final press = t < 0.25 ? Motion.ease.transform(t / 0.25) : (t < 0.7 ? 1 - Motion.pop.transform((t - 0.25) / 0.45) : 0.0);
      return Transform.rotate(
        angle: press * 0.12,
        child: Transform.scale(scale: 1 - 0.14 * press, child: child),
      );
    },
    child: BrandMark(size: widget.size),
  );
}

/// A loading screen line that changes every couple of seconds, under the pressing mark.
class FunLoader extends StatefulWidget {
  const FunLoader({super.key});

  @override
  State<FunLoader> createState() => _FunLoaderState();
}

class _FunLoaderState extends State<FunLoader> {
  var _line = 0;
  late final Timer _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(milliseconds: 2200), (_) => setState(() => _line = (_line + 1) % Jokes.loading.length));
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      const PressingMark(),
      const SizedBox(height: 20),
      AnimatedSwitcher(
        duration: Motion.medium,
        child: Text(
          Jokes.loading[_line].tr,
          key: ValueKey(_line),
          style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
      ),
    ],
  );
}

/// Throws a handful of little shirt buttons up from [context]'s widget, which fall and fade: the app's confetti, for a
/// found secret or a goal reached. Does nothing with reduce motion on.
void buttonBurst(BuildContext context, {int count = 22}) {
  if (reduceMotion(context)) return;
  final overlay = Overlay.maybeOf(context);
  final box = context.findRenderObject() as RenderBox?;
  if (overlay == null || box == null || !box.attached) return;
  final origin = box.localToGlobal(box.size.center(Offset.zero));
  final dark = Theme.of(context).brightness == Brightness.dark;
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _Burst(origin: origin, count: count, dark: dark, onDone: () => entry.remove()),
  );
  overlay.insert(entry);
}

class _Burst extends StatefulWidget {
  const _Burst({required this.origin, required this.count, required this.dark, required this.onDone});

  final Offset origin;
  final int count;
  final bool dark;
  final VoidCallback onDone;

  @override
  State<_Burst> createState() => _BurstState();
}

class _BurstState extends State<_Burst> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));
  late final List<_Flying> _buttons;

  @override
  void initState() {
    super.initState();
    final random = math.Random();
    _buttons = [
      for (var i = 0; i < widget.count; i++)
        _Flying(
          // Mostly upwards, spread over a wide fan.
          angle: -math.pi / 2 + (random.nextDouble() - 0.5) * math.pi * 1.1,
          speed: 380 + random.nextDouble() * 420,
          spin: (random.nextDouble() - 0.5) * 10,
          size: 12 + random.nextDouble() * 12,
          orange: i % 3 == 0,
        ),
    ];
    unawaited(_c.forward().whenComplete(widget.onDone));
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: AnimatedBuilder(
      animation: _c,
      builder: (context, _) => CustomPaint(
        size: Size.infinite,
        painter: _BurstPainter(origin: widget.origin, buttons: _buttons, t: _c.value, dark: widget.dark),
      ),
    ),
  );
}

class _Flying {
  const _Flying({required this.angle, required this.speed, required this.spin, required this.size, required this.orange});

  final double angle;
  final double speed;
  final double spin;
  final double size;
  final bool orange;
}

class _BurstPainter extends CustomPainter {
  const _BurstPainter({required this.origin, required this.buttons, required this.t, required this.dark});

  final Offset origin;
  final List<_Flying> buttons;
  final double t;
  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    final seconds = t * 1.4;
    final fade = t < 0.7 ? 1.0 : 1 - (t - 0.7) / 0.3;
    for (final b in buttons) {
      final at = origin + Offset(math.cos(b.angle) * b.speed * seconds, math.sin(b.angle) * b.speed * seconds + 0.5 * 900 * seconds * seconds);
      final colour = b.orange ? (dark ? Brand.threadDark : Brand.thread) : (dark ? Brand.denimDark : Brand.denim);
      canvas
        ..save()
        ..translate(at.dx, at.dy)
        ..rotate(b.spin * seconds);
      final r = b.size / 2;
      canvas.drawCircle(Offset.zero, r, Paint()..color = colour.withValues(alpha: fade));
      // The four holes of a shirt button.
      final hole = Paint()..color = (dark ? Brand.pageDark : Brand.page).withValues(alpha: fade);
      for (final (x, y) in const [(-1.0, -1.0), (1.0, -1.0), (-1.0, 1.0), (1.0, 1.0)]) {
        canvas.drawCircle(Offset(x * r * 0.3, y * r * 0.3), r * 0.14, hole);
      }
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_BurstPainter old) => old.t != t;
}

/// The Zirr mark that keeps a secret: press it five times in a row and buttons fly. A button that does nothing would be
/// a let-down, so the first four presses squish it too.
class SecretMark extends StatefulWidget {
  const SecretMark({this.size = 28, super.key});

  final double size;

  @override
  State<SecretMark> createState() => _SecretMarkState();
}

class _SecretMarkState extends State<SecretMark> {
  var _presses = 0;
  DateTime _last = DateTime(2000);

  void _press(BuildContext context) {
    final now = DateTime.now();
    _presses = now.difference(_last) < const Duration(milliseconds: 900) ? _presses + 1 : 1;
    _last = now;
    if (_presses < 5) return;
    _presses = 0;
    buttonBurst(context, count: 30);
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text('You found the secret button!'.tr)));
  }

  @override
  Widget build(BuildContext context) => Squish(
    onTap: () => _press(context),
    child: BrandMark(size: widget.size),
  );
}
