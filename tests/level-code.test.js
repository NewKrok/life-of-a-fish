import { describe, it, expect } from 'vitest';
import {
  generateLevelCode, normalizeLevelCode, isValidLevelCode,
  LEVEL_CODE_PREFIX, LEVEL_CODE_LENGTH,
} from '../services/level-code.js';

describe('generateLevelCode', () => {
  it('returns a string of expected format', () => {
    const code = generateLevelCode();
    expect(code.startsWith(LEVEL_CODE_PREFIX)).toBe(true);
    expect(code).toHaveLength(LEVEL_CODE_PREFIX.length + LEVEL_CODE_LENGTH);
  });

  it('uses only safe-alphabet characters (no 0, 1, I, L, O)', () => {
    for (let i = 0; i < 200; i++) {
      const body = generateLevelCode().slice(LEVEL_CODE_PREFIX.length);
      expect(body).toMatch(/^[2-9A-HJKMNP-Z]+$/);
      expect(body).not.toMatch(/[01ILO]/);
    }
  });

  it('produces distinct codes across many calls (no hot collision)', () => {
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(generateLevelCode());
    // 500 generations from ~887M space: practically zero collision chance.
    expect(seen.size).toBe(500);
  });
});

describe('normalizeLevelCode', () => {
  it('uppercases and adds LOAF- prefix if body-only', () => {
    expect(normalizeLevelCode('7k2pxm')).toBe('LOAF-7K2PXM');
  });

  it('strips whitespace and invalid characters', () => {
    expect(normalizeLevelCode('loaf - 7K2PXM ')).toBe('LOAF-7K2PXM');
  });

  it('leaves a valid code unchanged', () => {
    expect(normalizeLevelCode('LOAF-7K2PXM')).toBe('LOAF-7K2PXM');
  });

  it('returns empty string for non-string input', () => {
    expect(normalizeLevelCode(null)).toBe('');
    expect(normalizeLevelCode(123)).toBe('');
  });
});

describe('isValidLevelCode', () => {
  it('accepts a freshly generated code', () => {
    expect(isValidLevelCode(generateLevelCode())).toBe(true);
  });

  it('rejects missing prefix', () => {
    expect(isValidLevelCode('7K2PXM')).toBe(false);
  });

  it('rejects wrong body length', () => {
    expect(isValidLevelCode('LOAF-7K2PX')).toBe(false);
    expect(isValidLevelCode('LOAF-7K2PXMM')).toBe(false);
  });

  it('rejects banned characters (0, 1, I, L, O) in body', () => {
    expect(isValidLevelCode('LOAF-7K2PX0')).toBe(false);
    expect(isValidLevelCode('LOAF-7K2PXI')).toBe(false);
    expect(isValidLevelCode('LOAF-7K2PXL')).toBe(false);
    expect(isValidLevelCode('LOAF-7K2PXO')).toBe(false);
  });

  it('rejects lowercase body', () => {
    expect(isValidLevelCode('LOAF-7k2pxm')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidLevelCode(null)).toBe(false);
    expect(isValidLevelCode(undefined)).toBe(false);
    expect(isValidLevelCode(42)).toBe(false);
  });
});
