import assert from 'node:assert/strict';
import { test } from 'node:test';
import { money, TEXT } from './i18n.ts';

test('every text has English and Arabic', () => {
  for (const [key, text] of Object.entries(TEXT)) {
    assert.ok(text.en.trim(), `${key} has no English`);
    assert.ok(text.ar.trim(), `${key} has no Arabic`);
  }
});

test('money keeps each currency in its own decimals', () => {
  assert.equal(money(5900, 'USD'), '\u206659.00 USD\u2069');
  assert.equal(money(5000, 'JOD'), '\u20665.000 JOD\u2069');
});
