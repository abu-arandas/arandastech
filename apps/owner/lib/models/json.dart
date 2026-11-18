/// A record as the platform's API sends it, before a model reads it.
typedef Json = Map<String, Object?>;

/// A text in each language the platform writes it in, keyed by language code (`en`, `ar`).
typedef Localized = Map<String, String>;

/// Reads the nested record at [value], or an empty one.
Json jsonMap(Object? value) => (value as Json?) ?? const <String, Object?>{};

/// Reads the list of records at [value], or an empty list.
List<Json> jsonList(Object? value) => ((value as List<Object?>?) ?? const <Object?>[]).cast<Json>();

/// Reads a whole number, or [fallback] when there is none.
int intOf(Object? value, [int fallback = 0]) => (value as num?)?.toInt() ?? fallback;

/// Reads a localized text, such as `{"en": "Zirr Retail", "ar": "زِرّ للتجزئة"}`.
Localized localizedOf(Object? value) => {for (final e in jsonMap(value).entries) e.key: '${e.value}'};

/// The text in [language], else in English, else [fallback].
String pick(Localized text, String language, [String fallback = '']) => text[language] ?? text['en'] ?? fallback;
