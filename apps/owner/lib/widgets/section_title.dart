import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../config/theme.dart';
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
  const PageHeading(this.title, {this.eyebrow, this.detail, super.key});

  final String title;
  final String? eyebrow;

  /// One line under the title on what the screen is for.
  final String? detail;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.only(top: 16, bottom: 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (eyebrow != null) ...[Eyebrow(eyebrow!), const SizedBox(height: 8)],
        Text(title.tr, style: Theme.of(context).textTheme.headlineMedium),
        if (detail != null) ...[
          const SizedBox(height: 6),
          Text(detail!.tr, style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ],
        const SizedBox(height: 12),
        const SewIn(child: StitchLine()),
      ],
    ),
  );
}

/// A heading inside a screen: an optional icon in a soft denim tile, the title, and an optional line under it. Both
/// texts are English keys, translated here.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {this.detail, this.icon, super.key});

  final String title;
  final String? detail;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 28, bottom: 12),
      child: Row(
        children: [
          if (icon != null) ...[
            Container(
              width: 36,
              height: 36,
              decoration: ShapeDecoration(color: scheme.primary.withValues(alpha: 0.1), shape: AppTheme.shape(11)),
              child: Icon(icon, size: 19, color: scheme.primary),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title.tr, style: theme.textTheme.titleMedium?.copyWith(fontSize: 18, fontWeight: FontWeight.w600, letterSpacing: -0.2)),
                if (detail != null) ...[
                  const SizedBox(height: 2),
                  Text(detail!.tr, style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// What an empty list says: a quiet panel with a small icon, so an empty screen still looks looked after.
class EmptyLine extends StatelessWidget {
  const EmptyLine(this.text, {this.icon = Icons.inbox_outlined, super.key});

  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      decoration: ShapeDecoration(
        color: scheme.primary.withValues(alpha: 0.04),
        shape: AppTheme.shape(16, side: BorderSide(color: scheme.primary.withValues(alpha: 0.12))),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: scheme.primary.withValues(alpha: 0.7)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(text.tr, style: TextStyle(color: scheme.onSurfaceVariant)),
          ),
        ],
      ),
    );
  }
}
