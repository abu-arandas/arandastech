import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUIDES } from './guides-content.ts';

const texts = (value: unknown): { en: string; ar: string }[] => {
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === 'object') {
    if ('en' in value && 'ar' in value) return [value as { en: string; ar: string }];
    return Object.values(value).flatMap(texts);
  }
  return [];
};

test('every guide has a unique address made of plain words', () => {
  const slugs = GUIDES.map((guide) => guide.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test('every guide text has English and Arabic, and the table header may be blank in both', () => {
  for (const guide of GUIDES) {
    for (const text of texts({ ...guide, table: guide.table?.rows })) {
      assert.ok(text.en.trim(), `${guide.slug} has a text with no English`);
      assert.ok(text.ar.trim(), `${guide.slug} has no Arabic for "${text.en}"`);
    }
  }
});

test('search engines show the whole description', () => {
  for (const guide of GUIDES) {
    assert.ok(guide.description.en.length <= 160, `${guide.slug} English description is too long`);
    assert.ok(guide.description.ar.length <= 160, `${guide.slug} Arabic description is too long`);
  }
});

test('links go to the site itself or to an https address', () => {
  for (const guide of GUIDES) {
    assert.ok(guide.links.length > 0, `${guide.slug} has nowhere to go next`);
    for (const link of guide.links) assert.match(link.href, /^(\/[a-z]|https:\/\/)/, `${guide.slug}: ${link.href}`);
  }
});
