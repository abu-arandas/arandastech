import 'json.dart';

/// One instruction from the owner: the plan before the go-ahead, then each task's outcome.
class Command {
  const Command({
    required this.id,
    required this.instruction,
    required this.status,
    this.plannedBy,
    this.warnings = const [],
    this.expectedCostMicros = 0,
    this.plannedTasks = const [],
    this.tasks = const [],
  });

  factory Command.fromJson(Json json) {
    final plan = jsonMap(json['plan']);
    return Command(
      id: json['id']! as String,
      instruction: '${json['instruction']}',
      status: '${json['status']}',
      plannedBy: plan['planned_by'] as String?,
      warnings: ((plan['warnings'] as List<Object?>?) ?? const <Object?>[]).map((w) => '$w').toList(),
      expectedCostMicros: (plan['expected_cost_micros'] as num?) ?? 0,
      plannedTasks: jsonList(plan['tasks']).map(CommandTask.fromJson).toList(),
      tasks: jsonList(json['tasks']).map(CommandTask.fromJson).toList(),
    );
  }

  final String id;
  final String instruction;

  /// `planning`, `queued`, `running`, `done`, `failed`, ...
  final String status;

  /// `rules` when the plan was made without the AI model.
  final String? plannedBy;
  final List<String> warnings;
  final num expectedCostMicros;
  final List<CommandTask> plannedTasks;

  /// The tasks once they have started.
  final List<CommandTask> tasks;
}

class CommandTask {
  const CommandTask({required this.title, required this.department, this.status, this.approval});

  factory CommandTask.fromJson(Json json) =>
      CommandTask(title: '${json['title']}', department: '${json['department']}', status: json['status'] as String?, approval: json['approval'] as String?);

  final String title;
  final String department;
  final String? status;

  /// What the task will need approved, in the plan.
  final String? approval;
}
