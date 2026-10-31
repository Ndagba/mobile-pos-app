'use client';

import { useState } from 'react';
import { UserPlus, KeyRound, UserX, Check, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Drawer } from '@/components/ui/drawer';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import { useUsers, type User } from '@/hooks/useUsers';
import { useUserMutations, type CreateUserFields } from '@/hooks/useUserMutations';
import { useBranches } from '@/hooks/useBranches';
import { useAuthStore } from '@/store/authStore';
import { apiErrorMessage } from '@/lib/errors';

const ROLES = ['admin', 'manager', 'cashier'] as const;

const MATRIX: { label: string; cashier: boolean; manager: boolean; admin: boolean }[] = [
  { label: 'Process sales & hold/resume', cashier: true, manager: true, admin: true },
  { label: 'View own sales history', cashier: true, manager: true, admin: true },
  { label: 'View store-wide sales', cashier: false, manager: true, admin: true },
  { label: 'Refund a sale', cashier: false, manager: true, admin: true },
  { label: 'Edit products & adjust stock', cashier: false, manager: true, admin: true },
  { label: 'See cost price & margins', cashier: false, manager: true, admin: true },
  { label: 'Record expenses', cashier: false, manager: true, admin: true },
  { label: 'Profit & loss reports', cashier: false, manager: true, admin: true },
  { label: 'Manage users & branches', cashier: false, manager: false, admin: true },
];

function initials(u: Pick<User, 'first_name' | 'last_name' | 'email'>) {
  const a = u.first_name?.[0] ?? u.email?.[0] ?? '?';
  const b = u.last_name?.[0] ?? '';
  return (a + b).toUpperCase();
}

export default function UsersPage() {
  const me = useAuthStore((s) => s.user);
  const { data: users = [], isLoading } = useUsers();
  const { create, updateRole, deactivate, resetPassword } = useUserMutations();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [resetFor, setResetFor] = useState<User | null>(null);
  const [deactivateFor, setDeactivateFor] = useState<User | null>(null);

  return (
    <>
      <PageHeader
        title="Users & roles"
        subtitle="Permissions are enforced by the server; this page manages them."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite user
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Users list */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner />
            </div>
          ) : users.length === 0 ? (
            <p className="py-16 text-center text-sm text-text-muted">No users yet.</p>
          ) : (
            <div className="divide-y divide-divider">
              {users.map((u) => {
                const isMe = u.id === me?.id;
                return (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-primary-soft font-mono text-xs font-semibold text-primary-ink">
                      {initials(u)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-2">
                        {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}
                        {isMe && <span className="ml-1.5 text-2xs font-normal text-text-faint">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-text-muted">{u.email}</p>
                    </div>
                    <select
                      value={u.role}
                      disabled={isMe || updateRole.isPending}
                      onChange={(e) =>
                        updateRole
                          .mutateAsync({ id: u.id, role: e.target.value })
                          .then(() => toast.success('Role updated'))
                          .catch((err) => toast.error(apiErrorMessage(err, 'Something went wrong')))
                      }
                      className="h-8 rounded-md border border-border-strong bg-surface px-2 text-xs font-medium capitalize text-ink-2 disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setResetFor(u)}
                      title="Reset password"
                      className="rounded-md p-1.5 text-text-muted hover:bg-surface-subtle hover:text-ink"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={isMe}
                      onClick={() => setDeactivateFor(u)}
                      title="Deactivate"
                      className="rounded-md p-1.5 text-text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Permission matrix */}
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1fr_repeat(3,auto)] gap-x-4 border-b border-divider bg-surface-subtle px-4 py-2.5 text-2xs font-bold uppercase tracking-wide text-text-muted">
            <span>Permission</span>
            <span className="text-center">Cashier</span>
            <span className="text-center">Manager</span>
            <span className="text-center">Admin</span>
          </div>
          <div className="divide-y divide-divider">
            {MATRIX.map((row) => (
              <div key={row.label} className="grid grid-cols-[1fr_repeat(3,auto)] items-center gap-x-4 px-4 py-2.5 text-sm">
                <span className="text-ink-2">{row.label}</span>
                <Cell on={row.cashier} />
                <Cell on={row.manager} />
                <Cell on={row.admin} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <InviteDrawer open={inviteOpen} onClose={() => setInviteOpen(false)} onCreate={create} />

      <ResetPasswordModal
        user={resetFor}
        onClose={() => setResetFor(null)}
        onReset={(password) =>
          resetPassword
            .mutateAsync({ id: resetFor!.id, password })
            .then(() => {
              toast.success('Password reset');
              setResetFor(null);
            })
            .catch((err) => toast.error(apiErrorMessage(err, 'Something went wrong')))
        }
        pending={resetPassword.isPending}
      />

      <ConfirmDialog
        open={!!deactivateFor}
        onClose={() => setDeactivateFor(null)}
        title="Deactivate user"
        confirmLabel="Deactivate"
        message={
          <>Deactivate <strong>{deactivateFor?.first_name || deactivateFor?.email}</strong>? They will no longer be able to sign in. You can re-invite them later.</>
        }
        pending={deactivate.isPending}
        onConfirm={() =>
          deactivate
            .mutateAsync(deactivateFor!.id)
            .then(() => {
              toast.success('User deactivated');
              setDeactivateFor(null);
            })
            .catch((err) => toast.error(apiErrorMessage(err, 'Something went wrong')))
        }
      />
    </>
  );
}

function Cell({ on }: { on: boolean }) {
  return (
    <span className="flex justify-center">
      {on ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-text-faint" />}
    </span>
  );
}

function InviteDrawer({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: ReturnType<typeof useUserMutations>['create'];
}) {
  const { data: branches = [] } = useBranches();
  const [form, setForm] = useState<CreateUserFields>({ username: '', password: '', role: 'cashier' });
  const set = (k: keyof CreateUserFields, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.username || form.password.length < 6) {
      toast.error('Username and a 6+ character password are required.');
      return;
    }
    onCreate
      .mutateAsync(form)
      .then(() => {
        toast.success('User invited');
        setForm({ username: '', password: '', role: 'cashier' });
        onClose();
      })
      .catch((err) => toast.error(apiErrorMessage(err, 'Something went wrong')));
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Invite user"
      description="Create a staff account for this store."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={onCreate.isPending}>
            {onCreate.isPending && <Spinner className="h-4 w-4" />} Create user
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Username *"><Input value={form.username} onChange={(e) => set('username', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><Input value={form.first_name ?? ''} onChange={(e) => set('first_name', e.target.value)} /></Field>
          <Field label="Last name"><Input value={form.last_name ?? ''} onChange={(e) => set('last_name', e.target.value)} /></Field>
        </div>
        <Field label="Email"><Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Temporary password *">
          <Input type="text" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="At least 6 characters" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <select value={form.role} onChange={(e) => set('role', e.target.value)} className="h-[38px] w-full rounded-lg border border-border-strong bg-surface px-3 text-sm capitalize text-ink-2">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Branch">
            <select value={form.branch_id ?? ''} onChange={(e) => set('branch_id', e.target.value)} className="h-[38px] w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink-2">
              <option value="">Default</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        </div>
      </div>
    </Drawer>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onReset,
  pending,
}: {
  user: User | null;
  onClose: () => void;
  onReset: (password: string) => void;
  pending: boolean;
}) {
  const [pw, setPw] = useState('');
  return (
    <Modal open={!!user} onClose={onClose} title="Reset password" className="max-w-sm">
      <div className="space-y-4 p-5">
        <p className="text-sm text-text">
          Set a new password for <strong>{user?.first_name || user?.email}</strong>.
        </p>
        <Field label="New password">
          <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pw.length < 6 || pending}
            onClick={() => { onReset(pw); setPw(''); }}
          >
            {pending && <Spinner className="h-4 w-4" />} Reset
          </Button>
        </div>
      </div>
    </Modal>
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
