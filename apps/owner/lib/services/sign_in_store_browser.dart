import 'package:web/web.dart' as web;

import 'sign_in_store.dart';

SignInStore deviceSignInStore() => _BrowserSignInStore();

/// The browser's local storage. An app added to an iPhone's home screen keeps its own, which Safari does not clear.
class _BrowserSignInStore implements SignInStore {
  static const _key = 'zirr_owner_token';

  @override
  String? read() => _guard(() => web.window.localStorage.getItem(_key));

  @override
  void write(String token) => _guard(() => web.window.localStorage.setItem(_key, token));

  @override
  void clear() => _guard(() => web.window.localStorage.removeItem(_key));

  /// A private window may refuse storage; the owner then simply signs in again next time.
  static T? _guard<T>(T? Function() work) {
    try {
      return work();
    } on Object {
      return null;
    }
  }
}
