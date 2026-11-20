import 'json.dart';

/// Reads a list of prospects for Sales: the weekly research file pasted whole, or lines typed by hand.
///
/// One prospect a line, the values split by commas or tabs; a value in double quotes may hold commas. Blank lines and
/// lines that start with `#` are notes and are skipped. When the first line names an `email` column, it is a header
/// and every column is read by its name: name, email, company, country, audience ("shop" or "agency"), locale ("ar"
/// or "en"), website, notes, already_sent and last_sent_on. Without a header the columns come in this order: name,
/// email, company, country, audience, then for someone already emailed, how many emails (1 to 3) and the last date.
List<Json> parseProspects(String text) {
  final lines = [
    for (final line in text.split('\n'))
      if (line.trim().isNotEmpty && !line.trimLeft().startsWith('#')) line,
  ];
  if (lines.isEmpty) return [];
  final first = splitCells(lines.first).map((cell) => cell.toLowerCase()).toList();
  final hasHeader = first.contains('email');
  final columns = hasHeader ? first : _typedOrder;
  return [for (final line in hasHeader ? lines.skip(1) : lines) _prospect(_named(columns, splitCells(line)), line)];
}

const _typedOrder = ['name', 'email', 'company', 'country', 'audience', 'already_sent', 'last_sent_on'];

/// The values of one line, split by commas or tabs outside double quotes, each trimmed.
List<String> splitCells(String line) {
  final cells = <String>[];
  final cell = StringBuffer();
  var quoted = false;
  for (var i = 0; i < line.length; i++) {
    final char = line[i];
    if (char == '"' && quoted && i + 1 < line.length && line[i + 1] == '"') {
      cell.write('"');
      i++;
    } else if (char == '"') {
      quoted = !quoted;
    } else if (!quoted && (char == ',' || char == '\t')) {
      cells.add(cell.toString().trim());
      cell.clear();
    } else {
      cell.write(char);
    }
  }
  cells.add(cell.toString().trim());
  return cells;
}

Map<String, String> _named(List<String> columns, List<String> cells) => {
  for (var i = 0; i < columns.length && i < cells.length; i++)
    if (cells[i].isNotEmpty) columns[i].replaceAll(' ', '_'): cells[i],
};

final _arabic = RegExp('[؀-ۿ]');
final _date = RegExp(r'^\d{4}-\d{2}-\d{2}$');

Json _prospect(Map<String, String> v, String line) {
  final name = v['name'] ?? '';
  final locale = v['locale']?.toLowerCase();
  return <String, Object?>{
    'name': name,
    'email': v['email'] ?? '',
    'company': v['company'] ?? name,
    if (v['country'] case final country?) 'country': country,
    if (v['website'] case final website?) 'website': website,
    if (v['notes'] case final notes?) 'notes': notes,
    'audience': v['audience']?.toLowerCase() == 'shop' ? 'shop' : 'agency',
    'locale': locale == 'ar' || locale == 'en' ? locale : (_arabic.hasMatch(line) ? 'ar' : 'en'),
    if (int.tryParse(v['already_sent'] ?? '') case final sent? when sent > 0) 'already_sent': sent,
    if (v['last_sent_on'] case final date? when _date.hasMatch(date)) 'last_sent_on': date,
  };
}
