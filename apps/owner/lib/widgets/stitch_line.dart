import 'package:material_ui/material_ui.dart';

/// The Zirr ornament: a short line of running stitches in the accent colour, like the seam on a pair of jeans. Use
/// it under a page's main heading, and nowhere much else, so that it stays a detail.
class StitchLine extends StatelessWidget {
  const StitchLine({this.width = 44, this.thickness = 1.6, super.key});

  final double width;
  final double thickness;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: SizedBox(
      width: width,
      height: thickness,
      child: CustomPaint(painter: _StitchPainter(Theme.of(context).colorScheme.secondary, thickness)),
    ),
  );
}

class _StitchPainter extends CustomPainter {
  _StitchPainter(this.color, this.thickness);

  final Color color;
  final double thickness;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = thickness
      ..strokeCap = StrokeCap.round;
    // A stitch is a little longer than the gap between two, and the line starts and ends on one.
    final stitch = thickness * 3;
    final gap = thickness * 2.2;
    final length = size.width - thickness;
    final count = ((length + gap) / (stitch + gap)).floor().clamp(1, 1000);
    final step = count == 1 ? 0.0 : (length - stitch) / (count - 1);
    final y = size.height / 2;
    for (var i = 0; i < count; i++) {
      final x = thickness / 2 + i * step;
      canvas.drawLine(Offset(x, y), Offset(x + stitch, y), paint);
    }
  }

  @override
  bool shouldRepaint(_StitchPainter old) => old.color != color || old.thickness != thickness;
}
