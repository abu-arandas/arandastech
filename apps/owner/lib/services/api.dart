import 'dart:convert';

import 'package:http/http.dart' as http;

typedef Json = Map<String, dynamic>;

/// What the app needs from the platform. One version talks to the real API and one holds sample data.
abstract class PlatformApi {
  bool get isDemo;
  Future<Json> overview();
  Future<List<Json>> approvals();
  Future<void> decide(String requestId, String decision, {Json? confirmation});
  Future<Json> audit();
  Future<void> pause();
  Future<void> resume();

  /// The departments: whether they use the AI model, what each did today and the latest briefing.
  Future<Json> team();
  Future<List<Json>> commands();

  /// Turns an instruction into a plan. Nothing runs until [startCommand].
  Future<Json> planCommand(String instruction);
  Future<Json> startCommand(String id);
  Future<Json> command(String id);

  /// Runs the work that is due now, instead of waiting for the next visit or the daily schedule.
  Future<void> runDue();
}

/// A message from the platform that is safe to show to the owner.
class ApiError implements Exception {
  ApiError(this.message);
  final String message;
  @override
  String toString() => message;
}

/// The platform's HTTP API, with the owner token as a bearer token.
class HttpApi implements PlatformApi {
  HttpApi({required this.baseUrl, required this.token, http.Client? client}) : _client = client ?? http.Client();

  final String baseUrl;
  final String token;
  final http.Client _client;

  @override
  bool get isDemo => false;

  Future<Json> _send(String method, String path, [Json? body]) async {
    final request = http.Request(method, Uri.parse('$baseUrl$path'))..headers['authorization'] = 'Bearer $token';
    if (body != null) {
      request
        ..headers['content-type'] = 'application/json'
        ..body = jsonEncode(body);
    }
    final response = await http.Response.fromStream(await _client.send(request));
    final decoded = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(utf8.decode(response.bodyBytes)) as Json;
    if (response.statusCode >= 400) throw ApiError(((decoded['error'] as Json?)?['message'] as String?) ?? 'Request failed (${response.statusCode}).');
    return decoded;
  }

  @override
  Future<Json> overview() => _send('GET', '/api/owner/overview');

  @override
  Future<List<Json>> approvals() async => ((await _send('GET', '/api/owner/approvals'))['approvals'] as List).cast<Json>();

  @override
  Future<void> decide(String requestId, String decision, {Json? confirmation}) =>
      _send('POST', '/api/owner/approvals/$requestId/decide', {'decision': decision, 'confirmation': ?confirmation});

  @override
  Future<Json> audit() => _send('GET', '/api/owner/audit?limit=100');

  @override
  Future<void> pause() => _send('POST', '/api/owner/pause', {'scope': 'global', 'reason': 'Paused from the owner app.'});

  @override
  Future<void> resume() => _send('POST', '/api/owner/resume', {'scope': 'global'});

  @override
  Future<Json> team() => _send('GET', '/api/owner/agents');

  @override
  Future<List<Json>> commands() async => ((await _send('GET', '/api/owner/commands'))['commands'] as List).cast<Json>();

  @override
  Future<Json> planCommand(String instruction) async => (await _send('POST', '/api/owner/commands', {'instruction': instruction}))['command'] as Json;

  @override
  Future<Json> startCommand(String id) async => (await _send('POST', '/api/owner/commands/$id/start', {}))['command'] as Json;

  @override
  Future<Json> command(String id) async => (await _send('GET', '/api/owner/commands/$id'))['command'] as Json;

  @override
  Future<void> runDue() => _send('POST', '/api/owner/agents/run', {});
}

/// Sample data that behaves like the platform, so every screen can be opened with no backend.
class DemoApi implements PlatformApi {
  bool _paused = false;
  final List<Json> _events = [
    {'seq': 2, 'at': '2026-11-15T09:05:00Z', 'actor_kind': 'agent', 'actor_id': 'sales', 'event_type': 'action.pending'},
    {'seq': 1, 'at': '2026-11-15T09:00:00Z', 'actor_kind': 'system', 'actor_id': null, 'event_type': 'lead.created'},
  ];
  final List<Json> _approvals = [
    {
      'id': 'req-refund',
      'level': 3,
      'expires_at': '2026-11-18T09:00:00Z',
      'action': {
        'action_type': 'payments.refund',
        'summary': 'Refund 59.00 USD to layla@example.com',
        'payload': {'amount_minor': 5900, 'currency': 'USD', 'to': 'layla@example.com', 'reason': 'Requested inside the license terms.'},
        'recipient': 'layla@example.com',
        'cost_minor': 5900,
        'currency': 'USD',
        'risk': 'Money leaves the company and cannot be taken back.',
        'expected_result': 'layla@example.com receives 59.00 USD and the order is marked refunded.',
        'requested_by_kind': 'agent',
        'requested_by_id': 'finance',
        'untrusted_input': false,
      },
    },
    {
      'id': 'req-reply',
      'level': 2,
      'expires_at': '2026-11-18T09:05:00Z',
      'action': {
        'action_type': 'gmail.send_email',
        'summary': 'Send an email to nour@agency.example: "شكراً لتواصلك مع زِرّ"',
        'payload': {
          'to': 'nour@agency.example',
          'subject': 'شكراً لتواصلك مع زِرّ',
          'body': 'مرحباً نور،\n\nشكراً لرسالتك. نرسل لك تقديراً مكتوباً خلال يومَي عمل.\n\nزِرّ',
        },
        'recipient': 'nour@agency.example',
        'cost_minor': 0,
        'currency': null,
        'risk': 'An email cannot be recalled once it is sent.',
        'expected_result': 'nour@agency.example receives the email exactly as shown.',
        'requested_by_kind': 'agent',
        'requested_by_id': 'sales',
        'untrusted_input': true,
      },
    },
  ];

  @override
  bool get isDemo => true;

  @override
  Future<Json> overview() async => {
    'paused': _paused,
    'approvals': {'open': _approvals.length, 'level_3': _approvals.where((a) => a['level'] == 3).length},
    'held_actions': 0,
    'leads': {'new': 1, 'total': 3},
    'orders': {'total': 4, 'on_hold': 0, 'in_progress': 1},
    'inbox': {'unhandled': 2, 'flagged': 1},
    'alerts': {'open': 1},
    'money': [
      {
        'currency': 'USD',
        'status': 'safe_to_consider_upgrade',
        'pending_revenue': 0,
        'waterfall': {
          'settled_balance': 5699,
          'supplier_obligations': 0,
          'taxes': 0,
          'refund_and_dispute_reserve': 590,
          'available_cash': 5109,
          'operating_costs_and_buffer': 0,
          'confirmed_net_profit': 5109,
          'approved_reinvestment_budget': 2555,
        },
      },
      {
        'currency': 'JOD',
        'status': 'not_safe_to_spend',
        'pending_revenue': 5000,
        'waterfall': {
          'settled_balance': -2000,
          'supplier_obligations': 0,
          'taxes': 0,
          'refund_and_dispute_reserve': 0,
          'available_cash': -2000,
          'operating_costs_and_buffer': 0,
          'confirmed_net_profit': -2000,
          'approved_reinvestment_budget': 0,
        },
      },
    ],
  };

  @override
  Future<List<Json>> approvals() async => List.of(_approvals);

  @override
  Future<void> decide(String requestId, String decision, {Json? confirmation}) async {
    final request = _approvals.firstWhere((a) => a['id'] == requestId);
    final action = request['action'] as Json;
    if (decision == 'approve' && request['level'] == 3) {
      final matches = confirmation != null && confirmation['amount_minor'] == action['cost_minor'] && confirmation['recipient'] == action['recipient'];
      if (!matches) throw ApiError('The confirmed amount or recipient does not match the request.');
    }
    if (decision != 'postpone') _approvals.remove(request);
    _events.insert(0, {
      'seq': _events.length + 1,
      'at': '2026-11-15T09:10:00Z',
      'actor_kind': 'person',
      'actor_id': 'owner',
      'event_type':
          'approval.${decision == 'approve'
              ? 'approved'
              : decision == 'reject'
              ? 'rejected'
              : 'postponed'}',
    });
  }

  @override
  Future<Json> audit() async => {'chain_intact': true, 'events': List.of(_events)};

  @override
  Future<void> pause() async => _paused = true;

  @override
  Future<void> resume() async => _paused = false;

  final List<Json> _commands = [];

  static const _departments = ['operations', 'sales', 'support', 'marketing', 'engineering', 'commerce', 'finance', 'security'];

  @override
  Future<Json> team() async => {
    'mode': {
      'mode': 'manual',
      'model': null,
      'reason': 'no_key',
      'spent_today_micros': 0,
      'spent_month_micros': 0,
      'daily_cap_micros': 1000000,
      'monthly_cap_micros': 10000000,
    },
    'departments': [
      for (final (i, id) in _departments.indexed)
        {
          'id': id,
          'enabled': true,
          'runs_today': const [2, 3, 1, 0, 0, 1, 1, 1][i],
          'failed_today': 0,
          'cost_today_micros': 0,
          'last_run_at': i == 3 || i == 4 ? null : '2026-11-15T08:00:00Z',
        },
    ],
    'jobs': {'queued': 0, 'failed': 0},
    'briefing': {
      'started_at': '2026-11-15T08:00:00Z',
      'model': null,
      'output': {
        'result': {
          'text': {
            'en': 'Good morning. 2 requests wait for you, 1 of them Level 3. 1 new lead came in and 1 order is in progress. 2 messages are unread and 1 is flagged.',
            'ar': 'صباح الخير. طلبان بانتظارك، أحدهما من المستوى 3. وصل عميل محتمل جديد وطلب واحد قيد التنفيذ. رسالتان غير مقروءتين وواحدة مشبوهة.',
          },
        },
      },
    },
  };

  @override
  Future<List<Json>> commands() async => List.of(_commands);

  @override
  Future<Json> planCommand(String instruction) async {
    final command = <String, dynamic>{
      'id': 'cmd-${_commands.length + 1}',
      'instruction': instruction,
      'status': 'planning',
      'plan': {
        'objective': instruction,
        'planned_by': 'rules',
        'expected_cost_micros': 0,
        'warnings': <String>[],
        'questions': <String>[],
        'tasks': [
          {
            'kind': 'marketing.draft_posts',
            'department': 'marketing',
            'title': 'Draft 3 social posts',
            'connector': 'buffer',
            'level': 1,
            'approval': 'none',
            'needs_model': false,
          },
          {
            'kind': 'sales.qualify_leads',
            'department': 'sales',
            'title': 'Score the open leads',
            'connector': 'none',
            'level': 0,
            'approval': 'none',
            'needs_model': false,
          },
        ],
      },
      'tasks': <Json>[],
      'report': null,
    };
    _commands.insert(0, command);
    return command;
  }

  @override
  Future<Json> startCommand(String id) async {
    final command = _commands.firstWhere((c) => c['id'] == id);
    if (command['status'] != 'planning') throw ApiError('This plan has already started.');
    final planned = ((command['plan'] as Json)['tasks'] as List).cast<Json>();
    command
      ..['status'] = 'done'
      ..['tasks'] = [
        for (final t in planned) {...t, 'status': 'done'},
      ]
      ..['report'] = {
        'counts': {'done': planned.length},
        'ai_cost_micros': 0,
      };
    return command;
  }

  @override
  Future<Json> command(String id) async => _commands.firstWhere((c) => c['id'] == id);

  @override
  Future<void> runDue() async {}
}
