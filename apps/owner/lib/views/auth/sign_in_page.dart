import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../../controllers/session_controller.dart';
import '../../widgets/brand_mark.dart';
import '../../widgets/language_button.dart';
import '../../widgets/motion.dart';
import '../../widgets/section_title.dart';

/// Signs in to this build's platform with the owner token. The address comes with the build.
class SignInPage extends StatefulWidget {
  const SignInPage({super.key});

  @override
  State<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends State<SignInPage> {
  final _token = TextEditingController();

  @override
  void dispose() {
    _token.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionController>();
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const BrandTitle(), actions: const [LanguageButton()]),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            // The form comes in calmly, top to bottom.
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Appear(
                  child: Align(alignment: AlignmentDirectional.centerStart, child: BrandMark(size: 56)),
                ),
                const SizedBox(height: 16),
                const Appear(
                  delay: Motion.stagger,
                  child: PageHeading('Sign in', eyebrow: 'Owner app'),
                ),
                const SizedBox(height: 8),
                Text(
                  session.baseUrl,
                  textDirection: TextDirection.ltr,
                  style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 24),
                TextField(
                  key: const Key('owner-token'),
                  controller: _token,
                  decoration: InputDecoration(labelText: 'Owner token'.tr),
                  obscureText: true,
                  autocorrect: false,
                  enableSuggestions: false,
                  textDirection: TextDirection.ltr,
                  onSubmitted: (_) => session.signIn(_token.text),
                ),
                const SizedBox(height: 16),
                Obx(() {
                  final error = session.error.value;
                  return error == null
                      ? const SizedBox.shrink()
                      : Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(error.tr, style: TextStyle(color: theme.colorScheme.error)),
                        );
                }),
                Obx(() => FilledButton(onPressed: session.busy.value ? null : () => session.signIn(_token.text), child: Text('Connect'.tr))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
