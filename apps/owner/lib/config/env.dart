/// What the build was given with `--dart-define`: the platform the owner app belongs to.
///
/// Every build talks to a real platform: there is no demo mode and no sample data. A build without the address
/// shows why it cannot start instead of the app (see [problem]). The owner token is typed at sign-in and never
/// built in.
class Env {
  const Env({required this.platformUrl});

  /// This build's values.
  static const current = Env(platformUrl: String.fromEnvironment('PLATFORM_URL'));

  /// The platform's address, such as https://zirr-platform-ehab-arandas.vercel.app.
  final String platformUrl;

  /// The address with no slash at the end.
  String get baseUrl => platformUrl.trim().replaceFirst(RegExp(r'/+$'), '');

  /// Why the address cannot be right, or null when it can.
  String? get problem {
    if (platformUrl.trim().isEmpty) {
      return 'This build does not name its platform. Build it with --dart-define=PLATFORM_URL=https://... (README.md).';
    }
    final address = Uri.tryParse(baseUrl);
    final local = address != null && address.scheme == 'http' && (address.host == 'localhost' || address.host == '127.0.0.1');
    if (address == null || address.host.isEmpty || !(address.scheme == 'https' || local)) {
      return 'PLATFORM_URL must be the https address of the platform (http only for localhost).';
    }
    return null;
  }
}
