import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';

import '../config/routes.dart';
import '../controllers/session_controller.dart';
import '../widgets/fun.dart';
import '../widgets/motion.dart';
import 'auth/sign_in_page.dart';
import 'dashboard/dashboard_page.dart';
import 'not_found_page.dart';

/// Signed-out, the owner sees sign-in; signed in, the dashboard. Signing in and out cross-fades between the two.
class Home extends StatelessWidget {
  const Home({super.key});

  @override
  Widget build(BuildContext context) {
    // GetX opens the nearest known parent for an address it does not know, so `/nowhere` lands here on `/`. Anything
    // but `/` itself is the not-found page.
    final name = ModalRoute.of(context)?.settings.name;
    if (name != null && Uri.parse(name).path != Routes.home) return const NotFoundPage();
    final session = Get.find<SessionController>();
    return Obx(
      () => AnimatedSwitcher(
        duration: Motion.medium,
        switchInCurve: Motion.enter,
        switchOutCurve: Motion.exit,
        child: session.signedIn
            ? const DashboardPage(key: ValueKey('dashboard'))
            // While the token kept on this device is tried, the pressing mark instead of a form that flashes and goes.
            : session.resuming.value
            ? const Scaffold(
                key: ValueKey('resuming'),
                body: Center(child: FunLoader()),
              )
            : const SignInPage(key: ValueKey('sign-in')),
      ),
    );
  }
}
