// Lists every English text a screen translates with `.tr` / `.trParams` that has no Arabic entry in
// lib/l10n, and every Arabic entry that appears twice. Run from the project root:
//
//   node tool/check_arabic.mjs
//
// It reads source text only (nothing is built or run). A text built at run time, or passed around and
// translated somewhere else, cannot be seen here: use the app in Arabic for those.
import fs from 'node:fs';
import path from 'node:path';

const lib = 'lib';
const i18n = path.join(lib, 'l10n');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (p.endsWith('.dart')) acc.push(p);
  }
  return acc;
}

const LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g;
const unquote = (s) => s.slice(1, -1).replace(/\\(['"$\\])/g, '$1');

// --- the Arabic keys
const known = new Map();
const repeated = [];
for (const f of fs.readdirSync(i18n).filter((n) => n.startsWith('ar') && n.endsWith('.dart'))) {
  const text = fs.readFileSync(path.join(i18n, f), 'utf8');
  for (const m of text.matchAll(/^\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")\s*:/gm)) {
    const key = unquote(m[1]);
    if (known.has(key)) repeated.push(`${key}  (${known.get(key)} and ${f})`);
    known.set(key, f);
  }
}

// --- the texts the screens translate
const missing = new Map(); // text -> first place
// Names and codes that read the same in every language.
const SAME_IN_EVERY_LANGUAGE = new Set(['Zirr', 'zirr']);

function want(text, file, line) {
  if (text.includes('$') || !/[A-Za-z]/.test(text) || SAME_IN_EVERY_LANGUAGE.has(text) || known.has(text) || missing.has(text)) return;
  missing.set(text, `${file}:${line}`);
}
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

for (const file of walk(lib).filter((f) => !f.startsWith(i18n))) {
  const text = fs.readFileSync(file, 'utf8');
  // 'a' 'b'.tr   (adjacent literals are one text)
  for (const m of text.matchAll(/((?:(?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")\s*)+)\.(?:tr|trParams)\b/g)) {
    const parts = [...m[1].matchAll(LITERAL)].map((x) => unquote(x[0]));
    want(parts.join(''), file, lineOf(text, m.index));
  }
  // (cond ? 'a' : 'b').tr
  for (const m of text.matchAll(/\)\.(?:tr|trParams)\b/g)) {
    let depth = 0;
    let start = -1;
    for (let i = m.index; i >= 0; i--) {
      if (text[i] === ')') depth++;
      if (text[i] === '(') { depth--; if (depth === 0) { start = i; break; } }
    }
    if (start < 0) continue;
    const inner = text.slice(start + 1, m.index);
    if (!/\?[^?]/.test(inner)) continue;
    for (const x of inner.matchAll(LITERAL)) {
      // a text being compared (`kind == 'opening'`) is not a text being shown
      if (/(?:==|!=)\s*$/.test(inner.slice(0, x.index))) continue;
      want(unquote(x[0]), file, lineOf(text, m.index));
    }
  }
}

// Widgets that translate a text they are handed: `Col(label: 'Product')`, `PageFrame(title: 'Reports')`, ...
// A literal given to one of these names should have an Arabic entry too.
const PASSED = ['label', 'title', 'subtitle', 'confirmLabel', 'cancelLabel', 'hint', 'emptyTitle', 'emptyMessage', 'eyebrow', 'detail', 'help', 'description'];
const passedRe = new RegExp(`\\b(?:${PASSED.join('|')}):\\s*('(?:[^'\\\\\\n]|\\\\.)*'|"(?:[^"\\\\\\n]|\\\\.)*")`, 'g');
for (const file of walk(lib).filter((f) => !f.startsWith(i18n))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(passedRe)) {
    // `x: 'a'.tr` is already covered above, and `'a' + b` is not a plain text
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 6);
    if (/^\s*\.tr/.test(after) || /^\s*[+']/.test(after)) continue;
    want(unquote(m[1]), file, lineOf(text, m.index));
  }
}

// Messages a controller hands back for the screen to translate and show.
const controllerFiles = walk(path.join(lib, 'controllers'));
const messageRe = /(?:\.failed\(\s*|error\.value\s*=\s*|\breturn\s+)('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")\s*[;)]/g;
for (const file of controllerFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(messageRe)) want(unquote(m[1]), file, lineOf(text, m.index));
}

let bad = 0;
if (repeated.length) {
  bad += repeated.length;
  console.log(`Arabic texts written twice (${repeated.length}):`);
  for (const r of repeated) console.log(`  ${r}`);
}
if (missing.size) {
  bad += missing.size;
  console.log(`English texts with no Arabic (${missing.size}):`);
  for (const [t, where] of missing) console.log(`  ${JSON.stringify(t)}  ${where}`);
}
console.log(bad === 0 ? `All good: ${known.size} Arabic texts, none repeated, none missing.` : `\n${bad} problem(s).`);
process.exit(bad === 0 ? 0 : 1);
