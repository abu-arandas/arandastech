import '../models/command.dart';
import '../models/json.dart';
import '../models/team.dart';
import 'platform_client.dart';

/// The departments and the command center.
abstract interface class TeamService {
  Future<TeamState> team();
  Future<List<Command>> commands();

  /// Turns an instruction into a plan. Nothing runs until [start].
  Future<Command> plan(String instruction);
  Future<Command> start(String id);
  Future<Command> command(String id);

  /// Runs the work that is due now, instead of waiting for the next visit or the daily schedule.
  Future<void> runDue();
}

class HttpTeamService implements TeamService {
  HttpTeamService(this._client);

  final PlatformClient _client;

  Command _read(Json answer) => Command.fromJson(jsonMap(answer['command']));

  @override
  Future<TeamState> team() async => TeamState.fromJson(await _client.send('GET', '/api/owner/agents'));

  @override
  Future<List<Command>> commands() async => (await _client.list('/api/owner/commands', 'commands')).map(Command.fromJson).toList();

  @override
  Future<Command> plan(String instruction) async => _read(await _client.send('POST', '/api/owner/commands', {'instruction': instruction}));

  @override
  Future<Command> start(String id) async => _read(await _client.send('POST', '/api/owner/commands/$id/start', {}));

  @override
  Future<Command> command(String id) async => _read(await _client.send('GET', '/api/owner/commands/$id'));

  @override
  Future<void> runDue() => _client.send('POST', '/api/owner/agents/run', {});
}
