import 'package:get/get.dart';

import '../views/home.dart';

/// Every page the app can open by name.
class Routes {
  static const home = '/';
}

final appPages = [GetPage<void>(name: Routes.home, page: () => const Home())];
