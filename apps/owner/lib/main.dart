import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/widgets.dart';

import 'app.dart';
import 'bindings/app_binding.dart';
import 'config/env.dart';
import 'services/platform.dart';

/// Reads the build's platform address and starts the app on it. A build without one shows why instead. Routes,
/// themes and text live in lib/config and lib/l10n, not here.
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  const env = Env.current;
  final problem = env.problem;
  if (problem != null) return runApp(StartupProblem(problem));
  runApp(
    OwnerApp(
      binding: AppBinding(
        connect: Platform.http,
        baseUrl: env.baseUrl,
        preferred: PlatformDispatcher.instance.locale,
        refreshEvery: const Duration(minutes: 1),
      ),
    ),
  );
}
