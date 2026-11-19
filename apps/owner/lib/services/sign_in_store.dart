import 'sign_in_store_none.dart' if (dart.library.js_interop) 'sign_in_store_browser.dart';

/// Keeps the owner token on this device, so the owner signs in once. The token never leaves the device except to the
/// platform itself; signing out forgets it.
abstract interface class SignInStore {
  /// Where this build keeps it: the browser's storage on the web (and so in an app added to the iPhone's home
  /// screen), nowhere elsewhere.
  factory SignInStore.device() => deviceSignInStore();

  String? read();
  void write(String token);
  void clear();
}
