import 'dart:async';

import 'package:material_ui/material_ui.dart';

/// The owner app is a work tool, so it moves calmly and quickly: screens fade through, cards come in a step apart,
/// the Today figures count up once, the approvals badge pops when a request lands, and one small moment (a tick that
/// draws itself) when the inbox is cleared. Nothing moves on money, and with reduce motion on nothing moves at all.
abstract final class Motion {
  static const fast = Duration(milliseconds: 160);
  static const medium = Duration(milliseconds: 280);
  static const slow = Duration(milliseconds: 420);
  static const stagger = Duration(milliseconds: 40);

  /// The house curve for things already on screen.
  static const ease = Cubic(0.2, 0, 0, 1);

  /// Quick out of the gate, gentle at the end: for things arriving.
  static const enter = Cubic(0.05, 0.7, 0.1, 1);

  /// For things leaving.
  static const exit = Cubic(0.3, 0, 0.8, 0.15);

  /// A little overshoot, for a pop.
  static const pop = Cubic(0.34, 1.56, 0.64, 1);
}

/// Whether the person asked their device for less motion.
bool reduceMotion(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;

/// Fades its child in while it rises a few pixels, after [delay]. Shown at once with reduce motion on.
class Appear extends StatefulWidget {
  const Appear({required this.child, this.delay = Duration.zero, this.rise = 8, super.key});

  final Widget child;
  final Duration delay;
  final double rise;

  @override
  State<Appear> createState() => _AppearState();
}

class _AppearState extends State<Appear> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: Motion.slow);
  Timer? _wait;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (reduceMotion(context)) {
      _c.value = 1;
    } else if (_c.isDismissed && _wait == null) {
      _wait = Timer(widget.delay, () {
        if (mounted) unawaited(_c.forward());
      });
    }
  }

  @override
  void dispose() {
    _wait?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    builder: (context, child) {
      final t = Motion.enter.transform(_c.value);
      return Opacity(
        opacity: t,
        child: Transform.translate(offset: Offset(0, widget.rise * (1 - t)), child: child),
      );
    },
    child: widget.child,
  );
}

/// A whole number that counts up to [value] the first time it shows, then simply changes.
class CountUp extends StatefulWidget {
  const CountUp(this.value, {this.id, this.style, super.key});

  final int value;

  /// Names the figure, so it counts up once per app run, not again each time its tab comes back.
  final Object? id;
  final TextStyle? style;

  static final _seen = <Object>{};

  @override
  State<CountUp> createState() => _CountUpState();
}

class _CountUpState extends State<CountUp> {
  late var _counted = widget.id != null && CountUp._seen.contains(widget.id);

  @override
  Widget build(BuildContext context) {
    final shown = widget.style?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
    if (_counted || reduceMotion(context)) return Text('${widget.value}', style: shown);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: widget.value.toDouble()),
      duration: Motion.slow + Motion.medium,
      curve: Curves.easeOutCubic,
      onEnd: () {
        if (widget.id case final id?) CountUp._seen.add(id);
        setState(() => _counted = true);
      },
      builder: (context, v, _) => Text('${v.round()}', style: shown, semanticsLabel: '${widget.value}'),
    );
  }
}

/// Grows its child past its size and settles it back whenever [value] goes up (a new request in the badge).
class PopOnChange extends StatefulWidget {
  const PopOnChange({required this.value, required this.child, super.key});

  final int value;
  final Widget child;

  @override
  State<PopOnChange> createState() => _PopOnChangeState();
}

class _PopOnChangeState extends State<PopOnChange> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: Motion.slow);

  @override
  void didUpdateWidget(PopOnChange old) {
    super.didUpdateWidget(old);
    if (widget.value > old.value && !reduceMotion(context)) unawaited(_c.forward(from: 0));
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
      final t = _c.value;
      // Up to 1.3 at a third of the way, then back to 1 with a small overshoot.
      final scale = t < 0.33 ? 1 + 0.3 * Motion.ease.transform(t / 0.33) : 1 + 0.3 * (1 - Motion.pop.transform((t - 0.33) / 0.67));
      return Transform.scale(scale: scale, child: child);
    },
    child: widget.child,
  );
}

/// A circled tick that draws itself once: the inbox is clear.
class DrawnTick extends StatefulWidget {
  const DrawnTick({this.size = 64, super.key});

  final double size;

  @override
  State<DrawnTick> createState() => _DrawnTickState();
}

class _DrawnTickState extends State<DrawnTick> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (reduceMotion(context)) {
      _c.value = 1;
    } else if (_c.isDismissed) {
      unawaited(_c.forward());
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colour = Theme.of(context).colorScheme.primary;
    return ExcludeSemantics(
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) => CustomPaint(
          size: Size.square(widget.size),
          painter: _TickPainter(progress: Motion.enter.transform(_c.value), colour: colour),
        ),
      ),
    );
  }
}

class _TickPainter extends CustomPainter {
  const _TickPainter({required this.progress, required this.colour});

  final double progress;
  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide;
    final ring = Paint()
      ..color = colour.withValues(alpha: 0.25)
      ..style = PaintingStyle.stroke
      ..strokeWidth = s * 0.05;
    canvas.drawCircle(size.center(Offset.zero), s * 0.45, ring);
    final tick = Path()
      ..moveTo(s * 0.3, s * 0.52)
      ..lineTo(s * 0.44, s * 0.66)
      ..lineTo(s * 0.71, s * 0.37);
    final pen = Paint()
      ..color = colour
      ..style = PaintingStyle.stroke
      ..strokeWidth = s * 0.07
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (final metric in tick.computeMetrics()) {
      canvas.drawPath(metric.extractPath(0, metric.length * progress), pen);
    }
  }

  @override
  bool shouldRepaint(_TickPainter old) => old.progress != progress || old.colour != colour;
}

/// The stitch sewing itself in from the start edge, once. Shown whole at once with reduce motion on.
class SewIn extends StatelessWidget {
  const SewIn({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (reduceMotion(context)) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 700),
      curve: Motion.enter,
      child: child,
      builder: (context, t, child) => ClipRect(
        child: Align(alignment: AlignmentDirectional.centerStart, widthFactor: t.clamp(0.0, 1.0), child: child),
      ),
    );
  }
}
