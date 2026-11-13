/// Decimal places of each currency. The dinar has three: 1 JOD is 1,000 fils.
const _exponent = {'JOD': 3, 'USD': 2, 'EUR': 2};

/// "59.00 USD" or "5.000 JOD", from a whole number of the currency's smallest unit.
String formatMoney(int minor, String currency) {
  final e = _exponent[currency] ?? 2;
  final digits = minor.abs().toString().padLeft(e + 1, '0');
  final split = digits.length - e;
  return '${minor < 0 ? '-' : ''}${digits.substring(0, split)}.${digits.substring(split)} $currency';
}
