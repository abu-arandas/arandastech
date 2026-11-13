import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:get/get.dart';

import 'controllers/owner_controller.dart';
import 'l10n/translations.dart';
import 'views/home_page.dart';
import 'views/sign_in_page.dart';

class OwnerApp extends StatelessWidget {
  const OwnerApp({required this.controller, super.key});

  final OwnerController controller;

  static ThemeData _theme(Brightness brightness) => ThemeData(
    colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1F5EFF), brightness: brightness),
    useMaterial3: true,
  );

  @override
  Widget build(BuildContext context) => GetMaterialApp(
    title: 'Arandas Tech',
    debugShowCheckedModeBanner: false,
    theme: _theme(Brightness.light),
    darkTheme: _theme(Brightness.dark),
    initialBinding: BindingsBuilder(() {
      Get.put(controller);
    }),
    translations: AppTranslations(),
    locale: controller.locale.value,
    fallbackLocale: const Locale('en'),
    supportedLocales: const [Locale('en'), Locale('ar')],
    localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
    home: Obx(() => controller.signedIn ? const HomePage() : const SignInPage()),
  );
}
