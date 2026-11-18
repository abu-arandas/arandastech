import 'dart:async';

import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart' show Locale;

import '../config/brand.dart';
import '../models/metrics.dart';
import '../models/overview.dart';
import '../services/platform.dart';
import '../services/platform_client.dart';

/// A screen's share of what the app reads from the platform. The session reads every share first and shows them
/// together, so a sign-out or an action during the read never puts older data on screen.
abstract interface class PlatformReader {
  /// Reads this share, and returns how to show it.
  Future<void Function()> read(Platform platform);

  /// Forgets everything shown, at sign-out.
  void clear();
}

/// Who is signed in, the language, the pause, and the reading and refreshing every screen shares.
class SessionController extends GetxController {
  SessionController({required this._connect, required this.baseUrl, required Locale locale, this.refreshEvery}) : locale = locale.obs;

  final PlatformConnector _connect;

  /// The platform this build belongs to (`--dart-define=PLATFORM_URL=...`).
  final String baseUrl;

  /// How often the screens refresh on their own while the owner is signed in. Null turns it off.
  final Duration? refreshEvery;

  /// The screens' shares, in the order they are read.
  final List<PlatformReader> readers = [];

  final Rx<Locale> locale;
  final platform = Rxn<Platform>();
  final overview = Rxn<Overview>();
  final metrics = Rxn<Metrics>();
  final busy = false.obs;

  /// The last failure, ready to show; null when there is none.
  final error = RxnString();

  /// When the screens were last filled from the platform, so every status shows how fresh it is.
  final loadedAt = Rxn<DateTime>();

  Timer? _refresh;

  /// Counts the owner's actions and sign-ins, so a background read can tell that it has been overtaken.
  int _version = 0;

  bool get signedIn => platform.value != null;
  bool get paused => overview.value?.paused ?? false;

  /// Switches between the languages in [Brand.locales]. GetX rebuilds the app in place.
  void toggleLanguage() {
    final next = Brand.locales[(Brand.locales.indexOf(locale.value) + 1) % Brand.locales.length];
    Get.locale = next;
    locale.value = next;
    Get.rootController.update();
  }

  /// Signs in with the owner token. The dashboard appears only after the platform has answered, so a wrong token
  /// never shows it, even briefly.
  Future<bool> signIn(String token) async {
    final candidate = _connect(baseUrl, token.trim());
    final ok = await guard(() => _read(candidate, keep: () => true));
    if (ok) {
      platform.value = candidate;
      _refresh?.cancel();
      if (refreshEvery != null) _refresh = Timer.periodic(refreshEvery!, (_) => unawaited(refreshQuietly()));
    }
    return ok;
  }

  void signOut() {
    _version++;
    _refresh?.cancel();
    _refresh = null;
    platform.value = null;
    overview.value = null;
    metrics.value = null;
    loadedAt.value = null;
    for (final reader in readers) {
      reader.clear();
    }
  }

  @override
  void onClose() {
    _refresh?.cancel();
    super.onClose();
  }

  /// A background refresh: it never interrupts something the owner started, and an error on screen stays there.
  Future<void> refreshQuietly() async {
    final current = platform.value;
    if (current == null || busy.value) return;
    final started = _version;
    try {
      // What it read is shown only if the owner did nothing in the meantime.
      await _read(current, keep: () => _version == started && !busy.value && identical(platform.value, current));
    } on Object {
      // The next refresh, or the owner's own tap, tries again.
    }
  }

  /// Reads everything again. Shows it only if the owner is still signed in to the same platform.
  Future<bool> reload() async {
    final current = platform.value;
    return current != null && await guard(() => _read(current, keep: () => identical(platform.value, current)));
  }

  /// Runs [work] and records its error instead of throwing, so a failed call never leaves a screen half drawn.
  Future<bool> guard(Future<void> Function() work) async {
    // Anything the owner starts overtakes a background read that is still on its way.
    _version++;
    busy.value = true;
    error.value = null;
    try {
      await work();
      return true;
    } on ApiError catch (e) {
      error.value = e.message;
      return false;
    } on Object {
      error.value = 'Could not connect. Check the connection and the token.';
      return false;
    } finally {
      busy.value = false;
    }
  }

  /// Runs one owner action, then shows the platform as it is afterwards. An error stays on screen.
  Future<bool> act(Future<void> Function(Platform platform) work) async {
    final current = platform.value;
    if (current == null) return false;
    final ok = await guard(() => work(current));
    final shown = error.value;
    await reload();
    if (!ok) error.value = shown;
    return ok;
  }

  /// Pauses every agent, or resumes them. Only the owner may resume.
  Future<bool> setPaused({required bool value}) => act((p) => value ? p.company.pause() : p.company.resume());

  Future<void> _read(Platform from, {required bool Function() keep}) async {
    final overviewNow = await from.company.overview();
    final metricsNow = await from.company.metrics();
    final shows = [for (final reader in readers) await reader.read(from)];
    if (!keep()) return;
    overview.value = overviewNow;
    metrics.value = metricsNow;
    for (final show in shows) {
      show();
    }
    loadedAt.value = DateTime.now();
  }
}
