import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import 'motion.dart';
import 'stitch_line.dart';

/// A small spaced label above a heading, in denim. Arabic is not spaced out, so it reads as Arabic.
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final arabic = Get.locale?.languageCode == 'ar';
    return Text(
      arabic ? text.tr : text.tr.toUpperCase(),
      style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.primary, letterSpacing: arabic ? 0 : 1.1, fontWeight: FontWeight.w500),
    );
  }
}

/// A screen's main heading: an eyebrow, the title, and the thread-orange stitch sewing itself in under it. The only
/// place the stitch is used in the app. Both texts are English keys, translated here.
class PageHeading extends StatelessWidget {
  const PageHeading(this.title, {this.eyebrow, super.key});

  final String title;
  final String? eyebrow;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.only(top: 16, bottom: 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (eyebrow != null) ...[Eyebrow(eyebrow!), const SizedBox(height: 8)],
        Text(title.tr, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 12),
        const SewIn(child: StitchLine()),
      ],
    ),
  );
}

/// A heading inside a screen, with an optional line under it. Both are English keys, translated here.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {this.detail, super.key});

  final String title;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 24, bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title.tr, style: theme.textTheme.titleMedium?.copyWith(fontSize: 17, letterSpacing: -0.1)),
          if (detail != null) ...[
            const SizedBox(height: 2),
            Text(detail!.tr, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ],
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
