'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LogOut, KeyRound, Lock, Monitor, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useAuthStore } from '@/store/authStore';
import { usePrefsStore } from '@/store/prefsStore';
import { useUserMutations } from '@/hooks/useUserMutations';
import { useNetworkStatus } from '@/lib/useNetwork';
import { getDeviceId } from '@/lib/deviceId';
import { apiErrorMessage } from '@/lib/errors';
import { canManageSettings } from '@/lib/roles';
import { cn } from '@/lib/utils';

const SHORTCUTS: [string, string][] = [
  ['Command menu', 'Ctrl K'],
  ['New sale', 'F2'],
  ['Sales history', 'F3'],
  ['Hold sale', 'F4'],
  ['Charge', 'F9'],
  ['Focus product search', '/'],
];

function initials(name?: string, email?: string): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hideAmounts = usePrefsStore((s) => s.hideAmounts);
  const toggleHideAmounts = usePrefsStore((s) => s.toggleHideAmounts);
  const online = useNetworkStatus();
  const { resetPassword } = useUserMutations();

  const canChangePassword = canManageSettings(user);

  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (pw.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (pw !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    resetPassword
      .mutateAsync({ id: user.id, password: pw })
      .then(() => {
        toast.success('Password updated.');
        setPw('');
        setConfirm('');
      })
      .catch((err) => toast.error(apiErrorMessage(err, 'Could not update the password.')));
  };

  const deviceId = typeof window !== 'undefined' ? getDeviceId() : '';

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Profile" subtitle="Your account, security and preferences." />

      <div className="space-y-5">
        {/* Account overview */}
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-pill bg-primary-soft font-mono text-lg font-semibold text-primary-ink">
              {initials(user?.first_name, user?.email)}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-bold text-ink">
                  {user?.first_name || user?.email || 'User'}
                </h2>
                <Badge variant={user?.is_super_admin ? 'default' : 'secondary'} className="capitalize">
                  {user?.is_super_admin ? 'Super admin' : user?.role}
                </Badge>
              </div>
              {user?.email && <p className="truncate text-sm text-text-muted">{user.email}</p>}
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 border-t border-divider pt-4 sm:grid-cols-2">
            <Detail label="Branch" value={user?.branch_name || '—'} />
            <Detail label="Store" value={user?.store_id || '—'} />
            <Detail label="Account ID" value={user?.id || '—'} mono />
            <Detail label="Role" value={user?.role || '—'} />
          </dl>
        </Card>

        {/* Profile details — backend pending */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-md font-bold text-ink">Profile details</h2>
              <p className="text-xs text-text-muted">Your name, email and phone number.</p>
            </div>
            <span
              title="Coming soon — editing your details isn't available yet."
              className="inline-flex items-center gap-1 rounded-pill bg-muted px-2 py-1 text-2xs font-semibold text-text-faint"
            >
              <Lock className="h-3 w-3" /> Coming soon
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 opacity-60 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={user?.first_name ?? ''} disabled />
            </Field>
            <Field label="Phone">
              <Input value="" placeholder="—" disabled />
            </Field>
            <Field label="Email">
              <Input value={user?.email ?? ''} disabled />
            </Field>
          </div>
        </Card>

        {/* Security — change password */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-text-muted" />
            <h2 className="text-md font-bold text-ink">Change password</h2>
          </div>
          {canChangePassword ? (
            <form onSubmit={handleChangePassword} className="grid max-w-sm gap-4">
              <Field label="New password">
                <div className="relative">
                  <Input
                    type={show ? 'text' : 'password'}
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    className="pr-16"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-1.5 top-1.5 h-[30px] rounded-md px-2.5 text-xs font-semibold text-primary hover:bg-primary-soft"
                  >
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
              </Field>
              <Field label="Confirm new password">
                <Input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter the new password"
                  autoComplete="new-password"
                />
              </Field>
              <p className="text-xs text-text-muted">
                This sets a new password directly — it doesn’t ask for your current one. If you
                suspect your account is compromised, change it and sign out of other devices.
              </p>
              <div>
                <Button type="submit" disabled={resetPassword.isPending || !pw || !confirm}>
                  {resetPassword.isPending && <Spinner className="h-4 w-4" />}
                  Update password
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-start gap-3 rounded-lg bg-surface-subtle p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
              <p className="text-sm text-text">
                Ask your store admin to reset your password. For security, cashiers can’t change
                their own password here.
              </p>
            </div>
          )}
        </Card>

        {/* Display preferences */}
        <Card className="p-5">
          <h2 className="mb-4 text-md font-bold text-ink">Display preferences</h2>
          <div className="flex items-center justify-between gap-4 border-b border-divider pb-4">
            <div>
              <Label className="text-sm">Hide amounts</Label>
              <p className="mt-0.5 text-xs text-text-muted">
                Mask money as <span className="font-mono">₦ ••••••</span> across the app.
              </p>
            </div>
            <Switch checked={hideAmounts} onCheckedChange={toggleHideAmounts} />
          </div>
          <div className="pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Keyboard shortcuts
            </p>
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
          </div>
        </Card>

        {/* Session & sign out */}
        <Card className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-md font-bold text-ink">
            <Monitor className="h-4 w-4 text-text-muted" />
            This device
          </h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <Detail label="Device ID" value={deviceId ? deviceId.slice(0, 18) + '…' : '—'} mono />
            <Detail
              label="Connection"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-pill', online ? 'bg-success' : 'bg-warning')} />
                  {online ? 'Online' : 'Offline'}
                </span>
              }
            />
          </dl>
          <div className="mt-5 border-t border-divider pt-4">
            <Button variant="destructive" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-2xs font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className={cn('mt-0.5 text-sm text-ink-2', mono && 'break-all font-mono text-xs')}>{value}</dd>
    </div>
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
