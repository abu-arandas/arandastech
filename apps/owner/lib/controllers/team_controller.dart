import 'package:get/get.dart';

import '../models/command.dart';
import '../models/marketing.dart';
import '../models/team.dart';
import '../services/platform.dart';
import 'session_controller.dart';

/// The departments at work and the command center.
class TeamController extends GetxController implements PlatformReader {
  TeamController(this._session);

  final SessionController _session;
  final team = Rxn<TeamState>();
  final commands = <Command>[].obs;
  final marketing = Rxn<MarketingState>();

  @override
  Future<void Function()> read(Platform platform) async {
    final teamNow = await platform.team.team();
    final commandsNow = await platform.team.commands();
    final marketingNow = await platform.team.marketing();
    return () {
      team.value = teamNow;
      commands.assignAll(commandsNow);
      marketing.value = marketingNow;
    };
  }

  @override
  void clear() {
    team.value = null;
    commands.clear();
    marketing.value = null;
  }

  /// Asks Operations for a plan. Returns it, or null when the platform refused.
  Future<Command?> plan(String instruction) async {
    if (instruction.trim().length < 3) {
      _session.error.value = 'Write what you want done, in a sentence.';
      return null;
    }
    Command? planned;
    await _session.guard(() async => planned = await _session.platform.value!.team.plan(instruction.trim()));
    if (planned != null) commands.insert(0, planned!);
    return planned;
  }

  /// The owner's go-ahead: the plan's tasks start. Anything that leaves the company still waits in Approvals.
  Future<bool> start(Command command) => _session.act((p) async => _replace(await p.team.start(command.id)));

  Future<bool> refreshCommand(Command command) => _session.guard(() async => _replace(await _session.platform.value!.team.command(command.id)));

  /// Runs the work that is due now, then shows what changed.
  Future<bool> runDue() => _session.act((p) => p.team.runDue());

  /// Lets Marketing post its approved templates by itself, or makes every post wait in Approvals again.
  Future<bool> setMarketingAutopilot({required bool on}) => _session.act((p) => p.team.setMarketingAutopilot(on: on));

  /// The owner approves one post wording; only approved wording is ever posted.
  Future<bool> approvePost(PostTemplate post) => _session.act((p) => p.team.approvePost(post.key));

  void _replace(Command command) {
    final i = commands.indexWhere((c) => c.id == command.id);
    if (i < 0) {
      commands.insert(0, command);
    } else {
      commands[i] = command;
    }
  }
}
