import 'sign_in_store.dart';

SignInStore deviceSignInStore() => _NoSignInStore();

/// Outside a browser nothing is kept: the owner signs in each time.
class _NoSignInStore implements SignInStore {
  @override
  String? read() => null;

  @override
  void write(String token) {}

  @override
  void clear() {}
}
