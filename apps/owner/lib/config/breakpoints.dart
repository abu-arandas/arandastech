import 'dart:math' as math;

import 'package:flutter/widgets.dart';

/// Bootstrap's breakpoints, by the width of the window in logical pixels. This file replaces flutter_bootstrap5:
/// the same mental model (`col-12 col-md-6 col-lg-4`), with no dependency.
enum Screen {
  xs(0),
  sm(576),
  md(768),
  lg(992),
  xl(1200),
  xxl(1400);

  const Screen(this.minWidth);

  /// The narrowest window this breakpoint covers.
  final double minWidth;

  /// The breakpoint a window [width] falls in.
  static Screen of(double width) => Screen.values.lastWhere((s) => width >= s.minWidth);
}

extension ResponsiveContext on BuildContext {
  Screen get screen => Screen.of(MediaQuery.sizeOf(this).width);

  bool get isMobile => screen.index < Screen.md.index;
  bool get isDesktop => screen.index >= Screen.lg.index;

  /// The value for the current breakpoint: the one given for it, or for the nearest smaller breakpoint.
  T responsive<T>(T xs, {T? sm, T? md, T? lg, T? xl, T? xxl}) {
    final byScreen = [xs, sm, md, lg, xl, xxl];
    for (var i = screen.index; i > 0; i--) {
      final value = byScreen[i];
      if (value != null) return value;
    }
    return xs;
  }
}

/// Bootstrap's `.container`: centred, as wide as the breakpoint allows, with side padding.
class GridContainer extends StatelessWidget {
  const GridContainer({required this.child, this.fluid = false, super.key});

  final Widget child;

  /// Full width at every breakpoint, like `.container-fluid`.
  final bool fluid;

  static const _maxWidths = {Screen.sm: 540.0, Screen.md: 720.0, Screen.lg: 960.0, Screen.xl: 1140.0, Screen.xxl: 1320.0};

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.topCenter,
    child: ConstrainedBox(
      constraints: BoxConstraints(maxWidth: fluid ? double.infinity : _maxWidths[context.screen] ?? double.infinity),
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: context.isMobile ? 16 : 24),
        child: child,
      ),
    ),
  );
}

/// One cell of a [GridRow]: how many of the 12 columns it spans at each breakpoint. A breakpoint left out takes
/// the span of the nearest smaller one, as in Bootstrap.
class GridCol extends StatelessWidget {
  const GridCol({required this.child, this.xs = 12, this.sm, this.md, this.lg, this.xl, this.xxl, super.key});

  final Widget child;
  final int xs;
  final int? sm;
  final int? md;
  final int? lg;
  final int? xl;
  final int? xxl;

  int spanAt(Screen screen) {
    final byScreen = [xs, sm, md, lg, xl, xxl];
    for (var i = screen.index; i > 0; i--) {
      final span = byScreen[i];
      if (span != null) return span;
    }
    return xs;
  }

  @override
  Widget build(BuildContext context) => child;
}

/// Bootstrap's `.row`: cells wrap onto the next line when their spans pass 12. Follows the reading direction, so
/// the first cell is on the right in Arabic.
class GridRow extends StatelessWidget {
  const GridRow({required this.children, this.gutter = 16, super.key});

  final List<GridCol> children;

  /// Space between cells, across and down.
  final double gutter;

  @override
  Widget build(BuildContext context) {
    final screen = context.screen;
    return LayoutBuilder(
      builder: (context, constraints) {
        final column = (constraints.maxWidth + gutter) / 12;
        // Wrap is only as wide as its cells, so a row that spans less than 12 would shrink and be centred by its
        // parent. Giving it the full width keeps a short row at the start, as in Bootstrap.
        return SizedBox(
          width: constraints.maxWidth,
          child: Wrap(
            spacing: gutter,
            runSpacing: gutter,
            children: [for (final cell in children) SizedBox(width: math.max(0, column * cell.spanAt(screen).clamp(1, 12) - gutter), child: cell)],
          ),
        );
      },
    );
  }
}
