import 'json.dart';

/// The departments at work: whether they use the AI model, what each did today, and the morning briefing.
class TeamState {
  const TeamState({
    this.mode = 'manual',
    this.modeReason,
    this.spentTodayMicros = 0,
    this.dailyCapMicros = 0,
    this.queuedJobs = 0,
    this.departments = const [],
    this.briefing,
  });

  factory TeamState.fromJson(Json json) {
    final mode = jsonMap(json['mode']);
    final text = jsonMap(jsonMap(jsonMap(json['briefing'])['output'])['result'])['text'];
    return TeamState(
      mode: '${mode['mode'] ?? 'manual'}',
      modeReason: mode['reason'] as String?,
      spentTodayMicros: (mode['spent_today_micros'] as num?) ?? 0,
      dailyCapMicros: (mode['daily_cap_micros'] as num?) ?? 0,
      queuedJobs: intOf(jsonMap(json['jobs'])['queued']),
      departments: jsonList(json['departments']).map(Department.fromJson).toList(),
      briefing: text == null ? null : localizedOf(text),
    );
  }

  /// `ai` or `manual`.
  final String mode;

  /// Why: `ready`, `no_key`, `switched_off`, `daily_cap` or `monthly_cap`.
  final String? modeReason;
  final num spentTodayMicros;
  final num dailyCapMicros;
  final int queuedJobs;
  final List<Department> departments;
  final Localized? briefing;

  bool get aiOn => mode == 'ai';
}

class Department {
  const Department({required this.id, this.enabled = true, this.runsToday = 0, this.failedToday = 0, this.lastRunAt, this.costTodayMicros = 0});

  factory Department.fromJson(Json json) => Department(
    id: json['id']! as String,
    enabled: json['enabled'] != false,
    runsToday: intOf(json['runs_today']),
    failedToday: intOf(json['failed_today']),
    lastRunAt: json['last_run_at'] as String?,
    costTodayMicros: (json['cost_today_micros'] as num?) ?? 0,
  );

  final String id;
  final bool enabled;
  final int runsToday;
  final int failedToday;
  final String? lastRunAt;
  final num costTodayMicros;
}
