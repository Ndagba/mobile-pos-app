/**
 * Backend copy of the bar capability map must match the shared copy exactly.
 * Both suites load the SAME truth table: shared/src/modes/capability-matrix.json.
 */
import fs from 'fs';
import path from 'path';
import {
  BusinessMode,
  barCapabilities,
  canChangeBusinessMode,
  canUseRetailCheckout,
} from '../../src/utils/businessMode';

const sharedDir = path.resolve(__dirname, '../../../shared/src/modes');
const matrix = JSON.parse(fs.readFileSync(path.join(sharedDir, 'capability-matrix.json'), 'utf8'));
const personas = matrix.personas as Record<string, any>;

describe('capability truth table (backend copy)', () => {
  for (const mode of ['bar', 'retail'] as BusinessMode[]) {
    for (const [name, want] of Object.entries(matrix[mode]) as [string, any][]) {
      it(`${mode} / ${name}`, () => {
        expect([...barCapabilities(personas[name], mode)].sort()).toEqual([...want.capabilities].sort());
        expect(canUseRetailCheckout(personas[name], mode)).toBe(want.retailCheckout);
      });
    }
  }
});

describe('mirror integrity', () => {
  it('backend/src/utils/businessMode.ts is the shared file plus a header comment', () => {
    const norm = (s: string) => s.replace(/\r\n/g, '\n');
    const shared = norm(fs.readFileSync(path.join(sharedDir, 'businessMode.ts'), 'utf8'));
    const backend = norm(fs.readFileSync(path.resolve(__dirname, '../../src/utils/businessMode.ts'), 'utf8'));
    // Strip the leading MIRROR header block.
    const body = backend.replace(/^\/\*\*\n \* MIRROR of[\s\S]*?\*\/\n/, '');
    expect(body).toBe(shared);
  });
});

describe('canChangeBusinessMode', () => {
  it('admin only while unlocked; super-admin always', () => {
    expect(canChangeBusinessMode(personas.admin, false)).toBe(true);
    expect(canChangeBusinessMode(personas.admin, true)).toBe(false);
    expect(canChangeBusinessMode(personas.super_admin, true)).toBe(true);
    expect(canChangeBusinessMode(personas.manager, false)).toBe(false);
  });
});
