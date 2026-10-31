'use client';

import React from 'react';
import { useAuthStore } from '@/store/authStore';
import { useSettings, type StoreSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, Store, Percent, Printer, Lock } from 'lucide-react';

const SHORTCUTS: [string, string][] = [
  ['Command menu', 'Ctrl K'],
  ['New sale', 'F2'],
  ['Sales history', 'F3'],
  ['Hold sale', 'F4'],
  ['Charge', 'F9'],
  ['Focus product search', '/'],
];

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { settings, isLoading, updateSettings, isUpdating } = useSettings();

  if (user?.role === 'cashier') {
    return (
      <div className="flex h-[60vh] items-center justify-center p-6 text-center">
        <Card className="max-w-md p-8">
          <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-danger" />
          <h2 className="text-md font-bold text-ink">Access denied</h2>
          <p className="mt-1 text-sm text-text-muted">
            Only administrators and managers can access store settings.
          </p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleToggle = async (key: keyof StoreSettings, value: boolean) => {
    try {
      await updateSettings({ [key]: value });
      toast.success('Setting updated');
    } catch (e) {
      toast.error('Failed to update setting');
    }
  };

  const toggles: { key: keyof StoreSettings; label: string; desc: string }[] = [
    { key: 'allow_cashier_add_customers', label: 'Allow adding customers', desc: 'Cashiers can create new customer profiles during checkout.' },
    { key: 'allow_cashier_edit_customers', label: 'Allow editing customers', desc: 'Cashiers can modify existing customer contact details.' },
    { key: 'customer_menu_enabled', label: 'Customer menu enabled', desc: 'Show the Customers menu in the sidebar for cashiers.' },
    { key: 'supplier_menu_enabled', label: 'Supplier menu enabled', desc: 'Show the Suppliers menu in the sidebar for cashiers.' },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" subtitle="Store configuration and staff permissions." />

      <div className="space-y-5">
        {/* Cashier permissions */}
        <Card className="overflow-hidden">
          <div className="border-b border-divider px-5 py-4">
            <h2 className="text-md font-bold text-ink">Cashier permissions</h2>
            <p className="text-xs text-text-muted">Control what staff can do within the POS.</p>
          </div>
          <div className="divide-y divide-divider">
            {toggles.map((t) => (
              <div key={t.key} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <Label className="text-sm">{t.label}</Label>
                  <p className="mt-0.5 text-xs text-text-muted">{t.desc}</p>
                </div>
                <Switch
                  checked={(settings?.[t.key] as boolean) ?? false}
                  onCheckedChange={(v) => handleToggle(t.key, v)}
                  disabled={isUpdating}
                />
              </div>
            ))}
          </div>
        </Card>

        {/* Store configuration (new — backend pending) */}
        <Card className="overflow-hidden">
          <div className="border-b border-divider px-5 py-4">
            <h2 className="text-md font-bold text-ink">Store configuration</h2>
            <p className="text-xs text-text-muted">Business profile, tax and receipt printing.</p>
          </div>
          <div className="divide-y divide-divider">
            <ComingSoonRow icon={<Store className="h-4 w-4" />} title="Business profile" desc="Store name, RC number and address printed on receipts." />
            <ComingSoonRow icon={<Percent className="h-4 w-4" />} title="Tax" desc="VAT rate added on top of shelf price." />
            <ComingSoonRow icon={<Printer className="h-4 w-4" />} title="Receipt footer" desc="Custom message printed at the bottom of each receipt." />
          </div>
        </Card>

        {/* Keyboard shortcuts */}
        <Card className="overflow-hidden">
          <div className="border-b border-divider px-5 py-4">
            <h2 className="text-md font-bold text-ink">Keyboard shortcuts</h2>
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 px-5 py-4 sm:grid-cols-2">
            {SHORTCUTS.map(([label, key]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-ink-2">{label}</span>
                <kbd className="rounded-chip border border-border-strong bg-surface-subtle px-1.5 py-0.5 font-mono text-2xs text-text-muted">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ComingSoonRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-text-muted">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-ink-2">{title}</p>
          <p className="mt-0.5 text-xs text-text-muted">{desc}</p>
        </div>
      </div>
      <span
        title="Coming soon — this setting is not yet available in the backend."
        className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-muted px-2 py-1 text-2xs font-semibold text-text-faint"
      >
        <Lock className="h-3 w-3" /> Coming soon
      </span>
    </div>
  );
}
