import { describe, expect, it } from 'vitest';
import matrix from './capability-matrix.json';
import {
  BAR_CAPABILITIES,
  OPERATIONAL_PROFILE_LABELS,
  barCapabilities,
  canChangeBusinessMode,
  canUseRetailCheckout,
  effectiveProfile,
  hasBarCapability,
  normalizeBusinessMode,
  normalizeOperationalProfile,
  type BusinessMode,
} from './businessMode';

const personas = matrix.personas as Record<string, any>;

describe('capability truth table (shared copy)', () => {
  for (const mode of ['bar', 'retail'] as BusinessMode[]) {
    const expected = (matrix as any)[mode] as Record<string, { retailCheckout: boolean; capabilities: string[] }>;
    for (const [name, want] of Object.entries(expected)) {
      it(`${mode} / ${name}`, () => {
        const user = personas[name];
        expect([...barCapabilities(user, mode)].sort()).toEqual([...want.capabilities].sort());
        expect(canUseRetailCheckout(user, mode)).toBe(want.retailCheckout);
      });
    }
  }

  it('every persona is covered in both modes', () => {
    const names = Object.keys(personas).sort();
    expect(Object.keys((matrix as any).bar).sort()).toEqual(names);
    expect(Object.keys((matrix as any).retail).sort()).toEqual(names);
  });

  it('the matrix only names real capabilities', () => {
    const all = new Set(BAR_CAPABILITIES);
    for (const row of Object.values((matrix as any).bar) as any[]) {
      for (const c of row.capabilities) expect(all.has(c)).toBe(true);
    }
  });
});

describe('segregation of duties', () => {
  it('attendants can never fulfil, remit or record damage', () => {
    const a = personas.attendant;
    for (const cap of ['bar.order.fulfil', 'bar.remittance.record', 'bar.damage.record', 'bar.order.queue.view'] as const) {
      expect(hasBarCapability(a, 'bar', cap)).toBe(false);
    }
  });

  it('controllers cannot create attendant orders or approve reversals', () => {
    const c = personas.controller;
    expect(hasBarCapability(c, 'bar', 'bar.order.create')).toBe(false);
    expect(hasBarCapability(c, 'bar', 'bar.reversal.approve')).toBe(false);
  });
});

describe('normalisers', () => {
  it('unknown modes fall back to retail', () => {
    expect(normalizeBusinessMode('bar')).toBe('bar');
    expect(normalizeBusinessMode('BAR')).toBe('retail');
    expect(normalizeBusinessMode(undefined)).toBe('retail');
  });

  it('only known profiles survive', () => {
    expect(normalizeOperationalProfile('bar_attendant')).toBe('bar_attendant');
    expect(normalizeOperationalProfile('waiter')).toBeNull();
    expect(normalizeOperationalProfile(null)).toBeNull();
  });

  it('effectiveProfile ignores profiles in retail stores and on supervisors', () => {
    expect(effectiveProfile(personas.attendant, 'retail')).toBeNull();
    expect(effectiveProfile(personas.manager_with_stray_profile, 'bar')).toBeNull();
    expect(effectiveProfile(personas.controller, 'bar')).toBe('bar_controller');
  });

  it('labels follow decision N1', () => {
    expect(OPERATIONAL_PROFILE_LABELS.bar_controller).toBe('Bar Controller (Cashier One)');
    expect(OPERATIONAL_PROFILE_LABELS.bar_attendant).toBe('Attendant (Cashier Two)');
  });
});

describe('canChangeBusinessMode', () => {
  it('admin only while unlocked; super-admin always; never manager or cashier', () => {
    expect(canChangeBusinessMode(personas.admin, false)).toBe(true);
    expect(canChangeBusinessMode(personas.admin, true)).toBe(false);
    expect(canChangeBusinessMode(personas.super_admin, true)).toBe(true);
    expect(canChangeBusinessMode(personas.manager, false)).toBe(false);
    expect(canChangeBusinessMode(personas.controller, false)).toBe(false);
  });
});
