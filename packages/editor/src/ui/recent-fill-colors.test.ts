import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeFillColorHex,
  readRecentFillColors,
  rememberFillColor,
  RECENT_FILL_COLORS_MAX,
  RECENT_FILL_COLORS_STORAGE_KEY,
} from './recent-fill-colors.js';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  } as Storage;
}

describe('normalizeFillColorHex', () => {
  it('normalizes 3- and 6-digit hex', () => {
    assert.equal(normalizeFillColorHex('#AbC'), '#aabbcc');
    assert.equal(normalizeFillColorHex('#e8eef5'), '#e8eef5');
  });

  it('rejects invalid values', () => {
    assert.equal(normalizeFillColorHex(''), null);
    assert.equal(normalizeFillColorHex('not-a-color'), null);
  });
});

describe('rememberFillColor', () => {
  it('stores newest first and dedupes', () => {
    const storage = memoryStorage();
    rememberFillColor('#111111', storage);
    rememberFillColor('#222222', storage);
    rememberFillColor('#111111', storage);
    assert.deepEqual(readRecentFillColors(storage), ['#111111', '#222222']);
  });

  it(`keeps at most ${RECENT_FILL_COLORS_MAX} colors`, () => {
    const storage = memoryStorage();
    for (let i = 1; i <= 8; i += 1) {
      rememberFillColor(`#${String(i).padStart(6, '0')}`, storage);
    }
    const recent = readRecentFillColors(storage);
    assert.equal(recent.length, RECENT_FILL_COLORS_MAX);
    assert.equal(recent[0], '#000008');
    assert.equal(storage.getItem(RECENT_FILL_COLORS_STORAGE_KEY)?.includes('#000008'), true);
  });
});
