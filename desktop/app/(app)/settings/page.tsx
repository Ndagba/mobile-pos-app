'use client';

import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useSettings, type StoreSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from 'sonner';
import { Loader2, ShieldCheck } from 'lucide-react';

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

  // Editable (save-on-click) sections, hydrated once settings load.
  const [profile, setProfile] = useState({ business_name: '', rc_number: '', store_address: '' });
  const [taxRate, setTaxRate] = useState('');
  const [footer, setFooter] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');

  useEffect(() => {
    if (!settings) return;
    setProfile({
      business_name: settings.business_name ?? '',
      rc_number: settings.rc_number ?? '',
      store_address: settings.store_address ?? '',
    });
    setTaxRate(settings.tax_rate != null ? String(settings.tax_rate) : '');
    setFooter(settings.receipt_footer ?? '');
    setMaxDiscount(settings.max_discount_percent != null ? String(settings.max_discount_percent) : '');
  }, [settings]);

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
    } catch {
      toast.error('Failed to update setting');
    }
  };

  const save = async (payload: Partial<StoreSettings>, label: string) => {
    try {
      await updateSettings(payload);
      toast.success(`${label} saved`);
    } catch {
      toast.error(`Could not save ${label.toLowerCase()}`);
    }
  };

  const toggles: { key: keyof StoreSettings; label: string; desc: string; fallback?: boolean }[] = [
    { key: 'allow_cashier_add_customers', label: 'Allow adding customers', desc: 'Cashiers can create new customer profiles.' },
    { key: 'allow_cashier_edit_customers', label: 'Allow editing customers', desc: 'Cashiers can edit or delete customers.' },
    { key: 'customer_menu_enabled', label: 'Customer menu enabled', desc: 'Show the Customers menu to cashiers.' },
    { key: 'supplier_menu_enabled', label: 'Supplier menu enabled', desc: 'Show the Suppliers menu to cashiers.' },
    { key: 'allow_cashier_discount', label: 'Allow discounts', desc: 'Cashiers can apply a discount at checkout.', fallback: true },
    { key: 'allow_cashier_refund', label: 'Allow refunds', desc: 'Cashiers can refund a completed sale.', fallback: false },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" subtitle="Store configuration and staff permissions." />

      <div className="space-y-5">
        {/* Business profile */}
        <SectionCard title="Business profile" subtitle="Printed at the top of every receipt.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">
              <Input value={profile.business_name} onChange={(e) => setProfile((p) => ({ ...p, business_name: e.target.value }))} placeholder="e.g. Mama Jay Supermarket" />
            </Field>
            <Field label="RC number">
              <Input value={profile.rc_number} onChange={(e) => setProfile((p) => ({ ...p, rc_number: e.target.value }))} placeholder="RC 1234567" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address">
                <Input value={profile.store_address} onChange={(e) => setProfile((p) => ({ ...p, store_address: e.target.value }))} placeholder="Shop address" />
              </Field>
            </div>
          </div>
          <SaveBar onSave={() => save(profile, 'Business profile')} pending={isUpdating} />
        </SectionCard>

        {/* Tax */}
        <SectionCard title="Tax" subtitle="VAT rate shown on receipts.">
          <Field label="VAT rate (%)">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              placeholder="7.5"
              className="max-w-[160px]"
            />
          </Field>
          <SaveBar
            onSave={() => save({ tax_rate: taxRate === '' ? null : Number(taxRate) }, 'Tax rate')}
            pending={isUpdating}
          />
        </SectionCard>

        {/* Receipt */}
        <SectionCard title="Receipt" subtitle="What appears on printed receipts.">
          <div className="flex items-center justify-between gap-4 border-b border-divider pb-4">
            <div>
              <Label className="text-sm">Show store logo</Label>
              <p className="mt-0.5 text-xs text-text-muted">Print the JayPOS mark on the receipt.</p>
            </div>
            <Switch
              checked={settings?.receipt_show_logo ?? true}
              onCheckedChange={(v) => handleToggle('receipt_show_logo', v)}
              disabled={isUpdating}
            />
          </div>
          <div className="pt-4">
            <Field label="Receipt footer">
              <Textarea
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                placeholder="Thank you for your purchase!"
                rows={2}
              />
            </Field>
            <SaveBar onSave={() => save({ receipt_footer: footer.trim() || null }, 'Receipt footer')} pending={isUpdating} />
          </div>
        </SectionCard>

        {/* Cashier permissions */}
        <Card className="overflow-hidden">
          <div className="border-b border-divider px-5 py-4">
            <h2 className="text-md font-bold text-ink">Cashier permissions</h2>
            <p className="text-xs text-text-muted">Control what cashiers can do.</p>
          </div>
          <div className="divide-y divide-divider">
            {toggles.map((t) => (
              <div key={t.key} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <Label className="text-sm">{t.label}</Label>
                  <p className="mt-0.5 text-xs text-text-muted">{t.desc}</p>
                </div>
                <Switch
                  checked={(settings?.[t.key] as boolean) ?? t.fallback ?? false}
                  onCheckedChange={(v) => handleToggle(t.key, v)}
                  disabled={isUpdating}
                />
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <Label className="text-sm">Max discount a cashier can give (%)</Label>
                <p className="mt-0.5 text-xs text-text-muted">Leave blank for no limit. Admins/managers are never limited.</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={maxDiscount}
                  onChange={(e) => setMaxDiscount(e.target.value)}
                  placeholder="∞"
                  className="w-24 text-right"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isUpdating}
                  onClick={() =>
                    save(
                      { max_discount_percent: maxDiscount === '' ? null : Math.round(Number(maxDiscount)) },
                      'Max discount'
                    )
                  }
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Keyboard shortcuts */}
        <SectionCard title="Keyboard shortcuts">
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            {SHORTCUTS.map(([label, key]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-ink-2">{label}</span>
                <kbd className="rounded-chip border border-border-strong bg-surface-subtle px-1.5 py-0.5 font-mono text-2xs text-text-muted">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-md font-bold text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SaveBar({ onSave, pending }: { onSave: () => void; pending: boolean }) {
  return (
    <div className="mt-4 flex justify-end">
      <Button size="sm" onClick={onSave} disabled={pending}>
        {pending && <Spinner className="h-4 w-4" />}
        Save
      </Button>
    </div>
  );
}
