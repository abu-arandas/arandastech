import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/json.dart';

/// A message from the platform that is safe to show to the owner.
class ApiError implements Exception {
  ApiError(this.message, {this.status});

  final String message;

  /// The HTTP status the platform answered with, when it answered.
  final int? status;

  /// The platform turned the token down: it is wrong, or it was replaced.
  bool get rejectedToken => status == 401 || status == 403;

  @override
  String toString() => message;
}

/// The platform's HTTP API, signed in with the owner token. Every service reads and writes through it.
class PlatformClient {
  PlatformClient({required this.baseUrl, required this._token, http.Client? client}) : _client = client ?? http.Client();

  /// The platform's address, with no slash at the end.
  final String baseUrl;
  final String _token;
  final http.Client _client;

  Future<Json> send(String method, String path, [Json? body]) async {
    final request = http.Request(method, Uri.parse('$baseUrl$path'))..headers['authorization'] = 'Bearer $_token';
    if (body != null) {
      request
        ..headers['content-type'] = 'application/json'
        ..body = jsonEncode(body);
    }
    final response = await http.Response.fromStream(await _client.send(request));
    final decoded = response.body.isEmpty ? const <String, Object?>{} : jsonDecode(utf8.decode(response.bodyBytes)) as Json;
    if (response.statusCode >= 400) {
      throw ApiError((jsonMap(decoded['error'])['message'] as String?) ?? 'Request failed (${response.statusCode}).', status: response.statusCode);
    }
    return decoded;
  }

  /// Reads the list under [key] in the answer to a GET of [path].
  Future<List<Json>> list(String path, String key) async => jsonList((await send('GET', path))[key]);
}
