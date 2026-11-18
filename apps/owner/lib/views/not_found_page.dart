import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../config/routes.dart';
import '../widgets/brand_mark.dart';
import '../widgets/language_button.dart';
import '../widgets/motion.dart';

/// Any address the app does not know, and the way back.
class NotFoundPage extends StatelessWidget {
  const NotFoundPage({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const BrandTitle(), actions: const [LanguageButton()]),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Appear(child: BrandMark(size: 56)),
              const SizedBox(height: 16),
              Appear(
                delay: Motion.stagger * 2,
                child: Text('This page lost a button.'.tr, style: theme.textTheme.headlineSmall, textAlign: TextAlign.center),
              ),
              const SizedBox(height: 8),
              Text(
                'The page you asked for is not here.'.tr,
                style: TextStyle(color: theme.colorScheme.outline),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              FilledButton(onPressed: () => Get.offAllNamed<void>(Routes.home), child: Text('Back to the start'.tr)),
            ],
          ),
        ),
      ),
    );
  }
}
