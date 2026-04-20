import { describe, it, expect } from 'vitest';
import { hasProfanity } from '../services/profanity-filter.js';

describe('hasProfanity', () => {
  it('returns false for clean input', () => {
    expect(hasProfanity('My Awesome Level')).toBe(false);
    expect(hasProfanity('Kedves vízalatti kaland')).toBe(false);
    expect(hasProfanity('')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(hasProfanity(null)).toBe(false);
    expect(hasProfanity(undefined)).toBe(false);
    expect(hasProfanity(123)).toBe(false);
  });

  it('catches obvious English profanity', () => {
    expect(hasProfanity('fuck this')).toBe(true);
    expect(hasProfanity('SHIT level')).toBe(true);
  });

  it('catches common Hungarian profanity', () => {
    expect(hasProfanity('fasz pálya')).toBe(true);
    expect(hasProfanity('kurva jó')).toBe(true);
  });

  it('bypass via accents is detected (normalization)', () => {
    expect(hasProfanity('fäsz')).toBe(true);
    expect(hasProfanity('kürva')).toBe(true);
  });

  it('bypass via punctuation/spaces is detected', () => {
    expect(hasProfanity('f.u.c.k')).toBe(true);
    expect(hasProfanity('k u r v a')).toBe(true);
  });
});
