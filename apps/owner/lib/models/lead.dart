import 'json.dart';

/// Someone who wrote in, with where they are in the pipeline and how the score was reached.
class Lead {
  const Lead({required this.name, required this.email, required this.stage, this.packageId, this.score, this.message, this.scoreReasons = const []});

  factory Lead.fromJson(Json json) => Lead(
    name: '${json['name']}',
    email: '${json['email']}',
    stage: '${json['stage']}',
    packageId: json['package_id'] as String?,
    score: (json['score'] as num?)?.toInt(),
    message: json['message'] as String?,
    scoreReasons: ((json['score_reasons'] as List<Object?>?) ?? const <Object?>[]).map((r) => '$r').toList(),
  );

  final String name;
  final String email;
  final String stage;
  final String? packageId;
  final int? score;
  final String? message;
  final List<String> scoreReasons;
}
