import { barBusinessToday, shiftDate } from './barBusinessDate';

describe('barBusinessToday (06:00 Africa/Lagos cutoff by default)', () => {
  it('02:00 Lagos still belongs to the previous business day', () => {
    // 2026-11-22 02:00 Lagos = 01:00 UTC
    expect(barBusinessToday({}, new Date('2026-11-22T01:00:00.000Z'))).toBe('2026-11-21');
  });

  it('07:00 Lagos is the new business day', () => {
    expect(barBusinessToday({}, new Date('2026-11-22T06:00:00.000Z'))).toBe('2026-11-22');
  });

  it('honours a midnight cutoff', () => {
    expect(barBusinessToday({ cutoffHour: 0 }, new Date('2026-11-22T01:00:00.000Z'))).toBe('2026-11-22');
  });

  it('shiftDate moves across month ends', () => {
    expect(shiftDate('2026-12-01', -1)).toBe('2026-11-30');
  });
});
