import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
  barCapabilities,
  canChangeBusinessMode,
  canUseRetailCheckout,
  effectiveProfile,
  normalizeBusinessMode,
  type BarCapability,
  type BusinessMode,
  type OperationalProfile,
} from '@jaypos/shared';
import type { RootState } from '../redux/store';

/**
 * Store business mode + the signed-in user's bar profile (Bar/Lounge Phase 1).
 *
 * Mode comes from the store settings (always fetched fresh), falling back to the
 * value captured at login. Rules come from @jaypos/shared so mobile, desktop and
 * the backend agree. This only decides what to SHOW — the server enforces.
 */
export function useBusinessMode() {
  const user = useSelector((s: RootState) => s.auth.user);
  const settings = useSelector((s: RootState) => s.settings.settings);

  return useMemo(() => {
    const mode: BusinessMode = normalizeBusinessMode(settings?.business_mode ?? user?.business_mode);
    const locked = !!settings?.business_mode_locked;
    const profile: OperationalProfile | null = effectiveProfile(user, mode);
    const caps = barCapabilities(user, mode);
    const isSupervisor = user?.role === 'admin' || user?.role === 'manager' || !!user?.is_super_admin;
    return {
      mode,
      isBar: mode === 'bar',
      locked,
      profile,
      /** A cashier working a bar store (with or without a profile yet). */
      isBarCashier: mode === 'bar' && !isSupervisor,
      canRetailCheckout: canUseRetailCheckout(user, mode),
      canChangeMode: canChangeBusinessMode(user, locked),
      /** Admin + manager can open Bar / Lounge setup (mode itself is admin-only). */
      canOpenBarSetup: isSupervisor,
      can: (capability: BarCapability) => caps.has(capability),
    };
  }, [user, settings?.business_mode, settings?.business_mode_locked]);
}
