import { describe, it, expect } from 'vitest';
import { timeConversion } from './timeConversion';

describe('timeConversion', () => {
  it('returns seconds for < 60s', () => {
    expect(timeConversion(0)).toBe('0.0 Sec');
    expect(timeConversion(1000)).toBe('1.0 Sec');
    expect(timeConversion(30500)).toBe('30.5 Sec');
    expect(timeConversion(59999)).toBe('60.0 Sec'); // 59.999s rounds to 60.0
  });

  it('returns minutes for 60s to < 60min', () => {
    expect(timeConversion(60000)).toBe('1.0 Min');
    expect(timeConversion(90000)).toBe('1.5 Min');
    expect(timeConversion(3599999)).toBe('60.0 Min');
  });

  it('returns hours for 60min to < 24h', () => {
    expect(timeConversion(3600000)).toBe('1.0 Hrs');
    expect(timeConversion(5400000)).toBe('1.5 Hrs');
    expect(timeConversion(86399999)).toBe('24.0 Hrs');
  });

  it('returns days for >= 24h', () => {
    expect(timeConversion(86400000)).toBe('1.0 Days');
    expect(timeConversion(172800000)).toBe('2.0 Days');
    expect(timeConversion(129600000)).toBe('1.5 Days');
  });
});
