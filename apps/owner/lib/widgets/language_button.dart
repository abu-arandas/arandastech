import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../controllers/session_controller.dart';

/// Switches the app between Arabic and English. Its label names the language it switches to; [compact] shows only a
/// letter of it, for a narrow rail, with the full name as the tooltip.
class LanguageButton extends StatelessWidget {
  const LanguageButton({this.compact = false, super.key});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionController>();
    return Obx(() {
      final name = session.locale.value.languageCode == 'ar' ? 'English' : 'العربية';
      if (!compact) return TextButton(onPressed: session.toggleLanguage, child: Text(name));
      return IconButton(
        tooltip: name,
        onPressed: session.toggleLanguage,
        icon: Text(name == 'English' ? 'En' : 'ع', style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 16)),
      );
    });
  }
}
