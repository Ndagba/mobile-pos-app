import {
  businessDateToDbDate,
  getBusinessDate,
  getBusinessDayRange,
} from '../../src/utils/businessDate';

// Africa/Lagos is UTC+1 all year (no DST).
describe('getBusinessDate (default 06:00 Africa/Lagos)', () => {
  it('evening sale belongs to the same calendar day', () => {
    // 21:00 Lagos on 17 Nov = 20:00Z
    expect(getBusinessDate(new Date('2026-11-17T20:00:00Z'))).toBe('2026-11-17');
  });

  it('after-midnight sale before the cutoff belongs to the previous day', () => {
    // 02:00 Lagos on 18 Nov = 01:00Z on 18 Nov
    expect(getBusinessDate(new Date('2026-11-18T01:00:00Z'))).toBe('2026-11-17');
    // 05:59:59 Lagos
    expect(getBusinessDate(new Date('2026-11-18T04:59:59Z'))).toBe('2026-11-17');
  });

  it('the cutoff instant itself starts the new business day', () => {
    // 06:00 Lagos = 05:00Z
    expect(getBusinessDate(new Date('2026-11-18T05:00:00Z'))).toBe('2026-11-18');
  });

  it('uses the business timezone, not the UTC calendar day', () => {
    // 23:30Z on 17 Nov is 00:30 Lagos on 18 Nov → still business day 17 Nov
    expect(getBusinessDate(new Date('2026-11-17T23:30:00Z'))).toBe('2026-11-17');
    // With cutoff 0 it is the Lagos calendar day, 18 Nov
    expect(getBusinessDate(new Date('2026-11-17T23:30:00Z'), { cutoffHour: 0 })).toBe('2026-11-18');
  });

  it('rolls back across month and year boundaries', () => {
    expect(getBusinessDate(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31');
    expect(getBusinessDate(new Date('2026-03-01T03:00:00Z'))).toBe('2026-02-28');
  });

  it('rejects bad options and invalid instants', () => {
    expect(() => getBusinessDate(new Date('x'))).toThrow(RangeError);
    expect(() => getBusinessDate(new Date(), { cutoffHour: 24 })).toThrow(RangeError);
    expect(() => getBusinessDate(new Date(), { timeZone: 'Not/AZone' })).toThrow(RangeError);
  });
});

describe('getBusinessDayRange', () => {
  it('covers 06:00 Lagos to 06:00 Lagos next day, half-open', () => {
    const { start, end } = getBusinessDayRange('2026-11-17');
    expect(start.toISOString()).toBe('2026-11-17T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-18T05:00:00.000Z');
  });

  it('round-trips with getBusinessDate at both edges', () => {
    const { start, end } = getBusinessDayRange('2026-12-31');
    expect(getBusinessDate(start)).toBe('2026-12-31');
    expect(getBusinessDate(new Date(end.getTime() - 1))).toBe('2026-12-31');
    expect(getBusinessDate(end)).toBe('2027-01-01');
  });

  it('handles a DST zone (23-hour spring-forward day in London)', () => {
    // 2026-03-29: clocks go 01:00 GMT → 02:00 BST
    const { start, end } = getBusinessDayRange('2026-03-28', { timeZone: 'Europe/London', cutoffHour: 6 });
    expect(start.toISOString()).toBe('2026-03-28T06:00:00.000Z'); // 06:00 GMT
    expect(end.toISOString()).toBe('2026-03-29T05:00:00.000Z'); // 06:00 BST
  });

  it('rejects malformed dates', () => {
    expect(() => getBusinessDayRange('17-11-2026')).toThrow(RangeError);
  });
});

describe('businessDateToDbDate', () => {
  it('returns UTC midnight for @db.Date columns', () => {
    expect(businessDateToDbDate('2026-11-17').toISOString()).toBe('2026-11-17T00:00:00.000Z');
  });
});
