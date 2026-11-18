import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

/// A heading inside a screen, with an optional line under it. Both are English keys, translated here.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {this.detail, super.key});

  final String title;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title.tr, style: theme.textTheme.titleLarge),
          if (detail != null) Text(detail!.tr, style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

/// What an empty list says, in a quiet colour.
class EmptyLine extends StatelessWidget {
  const EmptyLine(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Text(text.tr, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant));
}
