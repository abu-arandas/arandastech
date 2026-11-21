import 'package:material_ui/material_ui.dart';

/// The look of a [BusyButton], one per Material button style the app uses.
enum ButtonKind { filled, tonal, outlined, text }

/// A button for work that goes to the platform. While the work runs it shows a small spinner in place of its icon and
/// cannot be pressed again, so a slow connection never looks like a dead button and nothing is sent twice.
class BusyButton extends StatefulWidget {
  const BusyButton({required this.label, required this.onPressed, this.icon, this.kind = ButtonKind.filled, this.colour, this.style, super.key});

  /// Already translated.
  final String label;

  /// Overrides the kind's look, such as a white button on an ink panel.
  final ButtonStyle? style;

  /// The work. Null disables the button.
  final Future<void> Function()? onPressed;
  final IconData? icon;
  final ButtonKind kind;

  /// A text colour for the label, such as red for Disconnect.
  final Color? colour;

  @override
  State<BusyButton> createState() => _BusyButtonState();
}

class _BusyButtonState extends State<BusyButton> {
  bool _busy = false;

  Future<void> _run() async {
    setState(() => _busy = true);
    try {
      await widget.onPressed!();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final onPressed = widget.onPressed == null || _busy ? null : _run;
    final leading = _busy
        ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2))
        : (widget.icon == null ? null : Icon(widget.icon, size: 18));
    final child = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (leading != null) ...[leading, const SizedBox(width: 8)],
        Flexible(
          child: Text(
            widget.label,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: _busy ? null : widget.colour),
          ),
        ),
      ],
    );
    return switch (widget.kind) {
      ButtonKind.filled => FilledButton(onPressed: onPressed, style: widget.style, child: child),
      ButtonKind.tonal => FilledButton.tonal(onPressed: onPressed, style: widget.style, child: child),
      ButtonKind.outlined => OutlinedButton(onPressed: onPressed, style: widget.style, child: child),
      ButtonKind.text => TextButton(onPressed: onPressed, style: widget.style, child: child),
    };
  }
}

/// An icon button for platform work, such as Refresh: the icon turns into a spinner until the work is done.
class BusyIconButton extends StatefulWidget {
  const BusyIconButton({required this.icon, required this.tooltip, required this.onPressed, this.colour, super.key});

  final IconData icon;

  /// Already translated.
  final String tooltip;
  final Future<void> Function() onPressed;
  final Color? colour;

  @override
  State<BusyIconButton> createState() => _BusyIconButtonState();
}

class _BusyIconButtonState extends State<BusyIconButton> {
  bool _busy = false;

  Future<void> _run() async {
    setState(() => _busy = true);
    try {
      await widget.onPressed();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: widget.tooltip,
    color: widget.colour,
    onPressed: _busy ? null : _run,
    icon: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Icon(widget.icon),
  );
}
