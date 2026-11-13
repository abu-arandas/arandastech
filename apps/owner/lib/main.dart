import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/widgets.dart';

import 'app.dart';
import 'controllers/owner_controller.dart';
import 'services/api.dart';

void main() {
  runApp(
    OwnerApp(
      controller: OwnerController(
        connector: (baseUrl, token) => HttpApi(baseUrl: baseUrl, token: token),
        preferred: PlatformDispatcher.instance.locale,
      ),
    ),
  );
}
