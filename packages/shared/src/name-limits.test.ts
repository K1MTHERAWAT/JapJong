import { describe, expect, it } from 'vitest';
import {
  NAME_MAX_LENGTH,
  clampNameInput,
  formatNameCounter,
  getNameLimitWarning,
  isNameAtLimit,
} from './name-limits';

describe('name-limits', () => {
  it('defines distinct max lengths per name category rather than one identical limit', () => {
    const values = new Set(Object.values(NAME_MAX_LENGTH));
    expect(values.size).toBeGreaterThan(4);
    expect(NAME_MAX_LENGTH.NICKNAME).toBe(20);
    expect(NAME_MAX_LENGTH.PERSON_NAME).toBe(40);
    expect(NAME_MAX_LENGTH.ORGANIZATION).toBe(60);
    expect(NAME_MAX_LENGTH.ACTIVITY_NAME).toBe(80);
    expect(NAME_MAX_LENGTH.RICH_MENU_BAR_TEXT).toBe(14);
  });

  it('clamps strings exceeding maxLength while preserving Thai, English, numbers, and special chars', () => {
    const mixed = 'นายสมชาย Dev-01 (ห้องประชุม #2/2569)';
    expect(clampNameInput(mixed, NAME_MAX_LENGTH.PERSON_NAME)).toBe(mixed);

    const longThai = 'ก'.repeat(35);
    const clamped = clampNameInput(longThai, NAME_MAX_LENGTH.NICKNAME);
    expect(clamped.length).toBe(20);
    expect(clamped).toBe('ก'.repeat(20));
  });

  it('formats character counters and detects when input reaches limit', () => {
    expect(formatNameCounter('Test', 40)).toBe('4/40');
    expect(isNameAtLimit('a'.repeat(19), 20)).toBe(false);
    expect(isNameAtLimit('a'.repeat(20), 20)).toBe(true);
  });

  it('returns warning message only when input reaches maxLength', () => {
    expect(getNameLimitWarning('abc', 20)).toBeNull();
    const warning = getNameLimitWarning('x'.repeat(20), 20, 'ชื่อเล่น');
    expect(warning).toContain('20/20');
    expect(warning).toContain('ชื่อเล่น');
  });
});
