import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/session_controller.dart';

/// The pause switch as a small card, for the foot of the sidebar: what it does, and the one button.
class PauseCard extends StatelessWidget {
  const PauseCard({super.key});

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionController>();
    return Obx(() {
      final scheme = Theme.of(context).colorScheme;
      final paused = session.paused;
      return AnimatedContainer(
        duration: const Duration(milliseconds: 280),
        padding: const EdgeInsets.all(14),
        decoration: ShapeDecoration(
          color: paused ? scheme.errorContainer : scheme.surfaceContainerHigh,
          shape: RoundedSuperellipseBorder(borderRadius: BorderRadius.circular(18)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              paused ? 'Everything is paused.'.tr : 'Everything is running.'.tr,
              style: TextStyle(fontWeight: FontWeight.w500, color: paused ? scheme.onErrorContainer : scheme.onSurface),
            ),
            const SizedBox(height: 2),
            Text(
              paused ? 'Held actions are kept, not dropped.'.tr : 'One press stops every agent.'.tr,
              style: TextStyle(fontSize: 12.5, color: paused ? scheme.onErrorContainer : scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 10),
            PauseButton(paused: paused),
          ],
        ),
      );
    });
  }
}

/// Pause everything, or resume.
class PauseButton extends StatelessWidget {
  const PauseButton({required this.paused, super.key});

  final bool paused;

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionController>();
    return paused
        ? FilledButton.icon(onPressed: () => session.setPaused(value: false), icon: const Icon(Icons.play_arrow_rounded), label: Text('Resume'.tr))
        : FilledButton.tonalIcon(
            onPressed: () => session.setPaused(value: true),
            icon: const Icon(Icons.pause_circle_outline),
            label: Text('Pause everything'.tr),
          );
  }
}

/// The pause switch as one icon, for a narrow bar. Its tooltip says what a press does.
class PauseIconButton extends StatelessWidget {
  const PauseIconButton({super.key});

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionController>();
    return Obx(() {
      final paused = session.paused;
      return IconButton(
        tooltip: paused ? 'Resume'.tr : 'Pause everything'.tr,
        onPressed: () => session.setPaused(value: !paused),
        icon: Icon(paused ? Icons.play_circle_outline : Icons.pause_circle_outline),
      );
    });
  }
}

/// A band across the top of the content, only while something needs saying: the pause, or the last error.
class StatusBanner extends StatelessWidget {
  const StatusBanner({this.withButton = false, super.key});

  /// Whether the band carries the resume button itself (on a phone, where there is no sidebar card).
  final bool withButton;

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionController>();
    return Obx(() {
      final scheme = Theme.of(context).colorScheme;
      final paused = session.paused;
      final error = session.error.value;
      final show = paused || error != null;
      return AnimatedSize(
        duration: const Duration(milliseconds: 280),
        curve: const Cubic(0.2, 0, 0, 1),
        child: !show
            ? const SizedBox(width: double.infinity)
            : Material(
                color: paused ? scheme.errorContainer : scheme.surfaceContainerHigh,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          paused ? 'Everything is paused. Held actions are kept, not dropped.'.tr : error!.tr,
                          style: TextStyle(color: paused ? scheme.onErrorContainer : scheme.error),
                        ),
                      ),
                      if (paused && withButton) PauseButton(paused: paused),
                    ],
                  ),
                ),
              ),
      );
    });
  }
}
