import 'json.dart';

/// Marketing's weekly posts: whether Buffer is connected, the autopilot, the post templates and the latest posts.
class MarketingState {
  const MarketingState({this.autopilotUntil, this.bufferConnected = false, this.templates = const [], this.posts = const []});

  factory MarketingState.fromJson(Json json) => MarketingState(
    autopilotUntil: jsonMap(json['autopilot'])['expires_at'] as String?,
    bufferConnected: json['buffer_connected'] == true,
    templates: jsonList(json['templates']).map(PostTemplate.fromJson).toList(),
    posts: jsonList(json['posts']).map(PlannedPost.fromJson).toList(),
  );

  /// When Marketing's autopilot ends, or null while it is off.
  final String? autopilotUntil;
  final bool bufferConnected;
  final List<PostTemplate> templates;
  final List<PlannedPost> posts;

  bool get autopilot => autopilotUntil != null;
  int get approvedCount => templates.where((t) => t.approved).length;
}

/// A post wording Marketing may use once the owner approves it.
class PostTemplate {
  const PostTemplate({required this.key, required this.title, required this.channel, required this.approved});

  factory PostTemplate.fromJson(Json json) =>
      PostTemplate(key: '${json['key']}', title: '${json['title']}', channel: '${json['channel']}', approved: json['approved'] == true);

  final String key;
  final String title;

  /// `facebook` or `linkedin`.
  final String channel;
  final bool approved;
}

/// A post Marketing scheduled, and where it stands: waiting for the owner, sent to Buffer, or turned down.
class PlannedPost {
  const PlannedPost({required this.id, required this.status, required this.channel, this.scheduledFor, this.locale});

  factory PlannedPost.fromJson(Json json) => PlannedPost(
    id: '${json['id']}',
    status: '${json['status']}',
    channel: '${json['channel']}',
    scheduledFor: json['scheduled_for'] as String?,
    locale: json['locale'] as String?,
  );

  final String id;
  final String status;
  final String channel;
  final String? scheduledFor;
  final String? locale;
}
