import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../controllers/owner_controller.dart';

/// Connects the app to a platform with the owner token, or opens the demo.
class SignInPage extends StatefulWidget {
  const SignInPage({super.key});

  @override
  State<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends State<SignInPage> {
  final _url = TextEditingController();
  final _token = TextEditingController();

  @override
  void dispose() {
    _url.dispose();
    _token.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    return Scaffold(
      appBar: AppBar(
        title: Text('Arandas Tech'.tr),
        actions: [TextButton(onPressed: c.toggleLanguage, child: Obx(() => Text(c.locale.value.languageCode == 'ar' ? 'English' : 'العربية')))],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Owner app'.tr, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 24),
                TextField(
                  controller: _url,
                  decoration: InputDecoration(labelText: 'Platform address'.tr, hintText: 'https://'),
                  keyboardType: TextInputType.url,
                  textDirection: TextDirection.ltr,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _token,
                  decoration: InputDecoration(labelText: 'Owner token'.tr),
                  obscureText: true,
                  textDirection: TextDirection.ltr,
                ),
                const SizedBox(height: 16),
                Obx(() {
                  final error = c.error.value;
                  return error == null
                      ? const SizedBox.shrink()
                      : Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(error.tr, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                        );
                }),
                Obx(
                  () => FilledButton(
                    onPressed: c.busy.value ? null : () => c.connect(baseUrl: _url.text, token: _token.text),
                    child: Text('Connect'.tr),
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: () => c.connect(demo: true), child: Text('Open the demo'.tr)),
                const SizedBox(height: 8),
                Text('The demo uses sample data and changes nothing.'.tr, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
