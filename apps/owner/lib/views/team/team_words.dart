/// The English keys for what the platform sends as codes. Each is translated where it is shown.
abstract final class TeamWords {
  /// The department names, keyed by the platform's ids.
  static const departments = {
    'operations': 'Operations',
    'sales': 'Sales',
    'support': 'Support',
    'marketing': 'Marketing',
    'engineering': 'Engineering',
    'commerce': 'Commerce',
    'finance': 'Finance',
    'security': 'Security',
  };

  static const modes = {
    'ready': 'The departments use the AI model.',
    'no_key': 'Manual mode: no AI key is set. The departments follow fixed rules and cost nothing.',
    'switched_off': 'Manual mode: the AI is switched off in the policy sheet.',
    'daily_cap': "Manual mode until tomorrow: today's AI budget is used up.",
    'monthly_cap': "Manual mode until next month: this month's AI budget is used up.",
  };

  static const statuses = {
    'planning': 'Waiting for your go-ahead',
    'queued': 'Queued',
    'running': 'Running',
    'done': 'Done',
    'failed': 'Failed',
    'waiting_approval': 'Waiting in Approvals',
    'skipped': 'Skipped: needs the AI model',
  };
}
