import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StoreSettings } from '../redux/slices/settingsSlice';

// Legacy device-local keys (pre store-settings). Still read as a fallback so a
// device that set these before the store profile existed keeps its receipt text.
const LEGACY_BIZ_NAME_KEY = '@pos_business_name';
const LEGACY_FOOTER_KEY = '@pos_receipt_footer';

export interface ReceiptBranding {
  /** Business name, RC number, address — in print order, empty entries removed. */
  headerLines: string[];
  footer: string;
}

/** Pure part: store settings win; legacy device-local values only fill gaps. */
export function resolveReceiptBranding(
  settings: Pick<StoreSettings, 'business_name' | 'rc_number' | 'store_address' | 'receipt_footer'> | null | undefined,
  legacy: { name?: string | null; footer?: string | null } = {},
  defaultFooter = ''
): ReceiptBranding {
  const clean = (v?: string | null) => (v ?? '').trim();
  const name = clean(settings?.business_name) || clean(legacy.name);
  const headerLines = [name, clean(settings?.rc_number), clean(settings?.store_address)].filter(Boolean);
  const footer = clean(settings?.receipt_footer) || clean(legacy.footer) || defaultFooter;
  return { headerLines, footer };
}

/**
 * Header/footer text for a shared (plaintext) receipt — the same business
 * profile and footer the desktop receipt prints, from the store settings.
 */
export async function getReceiptBranding(
  settings: StoreSettings | null | undefined,
  defaultFooter = ''
): Promise<ReceiptBranding> {
  let name: string | null = null;
  let footer: string | null = null;
  try {
    [name, footer] = await Promise.all([
      AsyncStorage.getItem(LEGACY_BIZ_NAME_KEY),
      AsyncStorage.getItem(LEGACY_FOOTER_KEY),
    ]);
  } catch {}
  return resolveReceiptBranding(settings, { name, footer }, defaultFooter);
}
