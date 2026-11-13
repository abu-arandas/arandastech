import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../config/brand.dart';

/// The Zirr mark: a shirt button whose four holes are app tiles, with the top-right hole lit in thread orange. The lit
/// hole stays top right in Arabic too.
class BrandMark extends StatelessWidget {
  const BrandMark({this.size = 28, super.key});

  final double size;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(
        painter: _MarkPainter(
          disc: dark ? Brand.denimDark : Brand.denim,
          hole: dark ? Brand.pageDark : Brand.page,
          lit: dark ? Brand.threadDark : Brand.thread,
        ),
      ),
    );
  }
}

class _MarkPainter extends CustomPainter {
  const _MarkPainter({required this.disc, required this.hole, required this.lit});

  final Color disc;
  final Color hole;
  final Color lit;

  @override
  void paint(Canvas canvas, Size size) {
    // Drawn on the brand kit's 120-unit grid.
    canvas.scale(size.width / 120);
    const centre = Offset(60, 60);
    canvas.drawCircle(centre, 52, Paint()..color = disc);
    canvas.drawCircle(
      centre,
      43,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = hole.withValues(alpha: 0.25),
    );
    for (final (x, y) in const [(38.0, 38.0), (63.0, 38.0), (38.0, 63.0), (63.0, 63.0)]) {
      final paint = Paint()..color = x == 63 && y == 38 ? lit : hole;
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x, y, 19, 19), const Radius.circular(6)), paint);
    }
  }

  @override
  bool shouldRepaint(_MarkPainter old) => old.disc != disc || old.hole != hole || old.lit != lit;
}

/// The mark and the company's name, for the top bar.
class BrandTitle extends StatelessWidget {
  const BrandTitle({this.suffix, super.key});

  /// Shown after the name, such as "Demo".
  final String? suffix;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      const BrandMark(),
      const SizedBox(width: 10),
      Flexible(child: Text(suffix == null ? Brand.wordmark.tr : '${Brand.wordmark.tr} · $suffix', overflow: TextOverflow.ellipsis)),
    ],
  );
}

/// The house ornament: a thread-orange running stitch, like the seam on a pair of jeans. Used sparingly.
class StitchLine extends StatelessWidget {
  const StitchLine({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return SizedBox(
      height: 6,
      width: double.infinity,
      child: CustomPaint(painter: _StitchPainter(dark ? Brand.threadDark : Brand.thread)),
    );
  }
}

class _StitchPainter extends CustomPainter {
  const _StitchPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: 0.8)
      ..strokeWidth = 1.5
      ..strokeCap = StrokeCap.round;
    final y = size.height / 2;
    for (var x = 0.0; x < size.width; x += 12) {
      canvas.drawLine(Offset(x, y), Offset((x + 7).clamp(0, size.width), y), paint);
    }
  }

  @override
  bool shouldRepaint(_StitchPainter old) => old.color != color;
}
