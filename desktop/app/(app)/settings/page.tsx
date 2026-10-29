'use client';

import React from 'react';
import { useAuthStore } from '@/store/authStore';
import { useSettings, type StoreSettings } from '@/hooks/useSettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Settings as SettingsIcon, ShieldCheck } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { settings, isLoading, updateSettings, isUpdating } = useSettings();

  if (user?.role === 'cashier') {
    return (
      <div className="flex items-center justify-center h-screen p-6 text-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Only administrators and managers can access store settings.</CardDescription>
          </CardHeader>
          <CardContent>
            <ShieldCheck className="h-12 w-12 mx-auto text-destructive mb-4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
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

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary rounded-lg text-primary-foreground">
          <SettingsIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Store Settings</h1>
          <p className="text-muted-foreground">Configure operational permissions and visibility.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cashier Permissions</CardTitle>
          <CardDescription>
            Control what staff members can do within the POS system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-base">Allow Adding Customers</Label>
                <p className="text-sm text-muted-foreground">Permit cashiers to create new customer profiles during checkout.</p>
              </div>
              <Switch
                checked={settings?.allow_cashier_add_customers ?? false}
                onCheckedChange={(v) => handleToggle('allow_cashier_add_customers', v)}
                disabled={isUpdating}
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-base">Allow Editing Customers</Label>
                <p className="text-sm text-muted-foreground">Permit cashiers to modify existing customer contact details.</p>
              </div>
              <Switch
                checked={settings?.allow_cashier_edit_customers ?? false}
                onCheckedChange={(v) => handleToggle('allow_cashier_edit_customers', v)}
                disabled={isUpdating}
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-base">Customer Menu Enabled</Label>
                <p className="text-sm text-muted-foreground">Show the customer management menu in the sidebar for cashiers.</p>
              </div>
              <Switch
                checked={settings?.customer_menu_enabled ?? false}
                onCheckedChange={(v) => handleToggle('customer_menu_enabled', v)}
                disabled={isUpdating}
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-base">Supplier Menu Enabled</Label>
                <p className="text-sm text-muted-foreground">Show the supplier management menu in the sidebar for cashiers.</p>
              </div>
              <Switch
                checked={settings?.supplier_menu_enabled ?? false}
                onCheckedChange={(v) => handleToggle('supplier_menu_enabled', v)}
                disabled={isUpdating}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
