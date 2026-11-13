'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, Pencil, Plus, Users, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import { useBranches, type Branch } from '@/hooks/useBranches';
import { useBranchMutations, useBranchStaff, type BranchStaff } from '@/hooks/useBranchAdmin';
import { useUsers } from '@/hooks/useUsers';
import { useNetworkStatus } from '@/lib/useNetwork';
import { apiErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

const staffName = (u: { first_name?: string | null; last_name?: string | null; email?: string | null }) =>
  [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'User';

/**
 * Branches (admin only; the section layout gates everyone else out) — desktop
 * counterpart of mobile Settings → Branch Management, on the same `/v1/branches*`
 * routes: create, rename / edit contact details, deactivate, and manage which
 * staff work in each branch. Online-only for writes.
 */
export default function BranchesPage() {
  const online = useNetworkStatus();
  const branchesQ = useBranches();
  const branches = useMemo(() => branchesQ.data ?? [], [branchesQ.data]);
  const { deactivate } = useBranchMutations();

  const [formFor, setFormFor] = useState<Branch | 'new' | null>(null);
  const [staffFor, setStaffFor] = useState<Branch | null>(null);
  const [deactivateFor, setDeactivateFor] = useState<Branch | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const activeCount = branches.filter((b) => b.is_active !== false).length;

  const confirmDeactivate = () => {
    if (!deactivateFor) return;
    setDeactivateError(null);
    deactivate.mutate(deactivateFor.id, {
      onSuccess: () => {
        toast.success(`${deactivateFor.name} deactivated`);
        setDeactivateFor(null);
      },
      onError: (e) => setDeactivateError(apiErrorMessage(e, 'Could not deactivate the branch.')),
    });
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Branches"
        subtitle={`${activeCount} active branch${activeCount === 1 ? '' : 'es'} · locations, contact details and staff.`}
        className="mb-0"
        actions={
          <Button onClick={() => setFormFor('new')} disabled={!online}>
            <Plus className="h-4 w-4" /> New branch
          </Button>
        }
      />

      {!online && (
        <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink-2">
          You&apos;re offline. Branches can be viewed from the last sync but not changed until you reconnect.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-card border border-border bg-card">
        {branchesQ.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : branches.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Building2 className="h-8 w-8 text-text-faint" />
            <p className="text-sm text-text-muted">No branches yet. Create your first branch to start selling.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider bg-surface-subtle text-left text-2xs font-bold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2.5">Branch</th>
                <th className="px-4 py-2.5">Address</th>
                <th className="px-4 py-2.5">Phone</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => {
                const active = b.is_active !== false;
                return (
                  <tr key={b.id} className="border-b border-divider last:border-0">
                    <td className={cn('px-4 py-3 font-semibold', active ? 'text-ink' : 'text-text-muted')}>{b.name}</td>
                    <td className="px-4 py-3 text-text-muted">{b.address || '—'}</td>
                    <td className="px-4 py-3 text-text-muted">{b.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-pill px-2 py-0.5 text-2xs font-bold uppercase',
                          active ? 'bg-success-soft text-success' : 'bg-surface-subtle text-text-muted'
                        )}
                      >
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => setStaffFor(b)}>
                          <Users className="h-4 w-4" /> Staff
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setFormFor(b)} disabled={!online}>
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
                        {active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:text-danger"
                            onClick={() => {
                              setDeactivateError(null);
                              setDeactivateFor(b);
                            }}
                            disabled={!online}
                          >
                            Deactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <BranchFormModal target={formFor} onClose={() => setFormFor(null)} />
      <BranchStaffModal branch={staffFor} onClose={() => setStaffFor(null)} />
      <ConfirmDialog
        open={!!deactivateFor}
        onClose={() => setDeactivateFor(null)}
        onConfirm={confirmDeactivate}
        title="Deactivate branch"
        message={
          <>
            Deactivate <strong>{deactivateFor?.name}</strong>? It is hidden from the branch selectors in both
            apps. Its products, sales history and staff are kept. There is no reactivate option in the app.
          </>
        }
        confirmLabel="Deactivate"
        destructive
        pending={deactivate.isPending}
        error={deactivateError}
      />
    </div>
  );
}

/* ───────────────────────── Create / edit ───────────────────────── */

function BranchFormModal({ target, onClose }: { target: Branch | 'new' | null; onClose: () => void }) {
  const { create, update } = useBranchMutations();
  const editing = target && target !== 'new' ? target : null;

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setError(null);
    setName(editing?.name ?? '');
    setAddress(editing?.address ?? '');
    setPhone(editing?.phone ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const pending = create.isPending || update.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Branch name is required.');
      return;
    }
    // Empty strings (not null): the PATCH route trims the value it is given.
    const data = { name: name.trim(), address: address.trim(), phone: phone.trim() };
    const opts = {
      onSuccess: () => {
        toast.success(editing ? 'Branch updated' : 'Branch created');
        onClose();
      },
      onError: (err: unknown) => setError(apiErrorMessage(err, 'Could not save the branch.')),
    };
    if (editing) update.mutate({ id: editing.id, data }, opts);
    else create.mutate(data, opts);
  };

  return (
    <Modal open={!!target} onClose={onClose} title={editing ? 'Edit branch' : 'New branch'}>
      <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="br-name">Branch name *</Label>
          <Input id="br-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wuse Market" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="br-address">Address</Label>
          <Input id="br-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="br-phone">Phone</Label>
          <Input id="br-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
        </div>
        {!editing && (
          <p className="text-xs text-text-muted">
            The number of branches you can create depends on your subscription plan.
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Spinner className="h-4 w-4" />}
            {editing ? 'Save changes' : 'Create branch'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ───────────────────────── Staff in a branch ───────────────────────── */

function BranchStaffModal({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const online = useNetworkStatus();
  const staffQ = useBranchStaff(branch?.id);
  const usersQ = useUsers();
  const { assign, unassign } = useBranchMutations();
  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPick('');
    setError(null);
  }, [branch?.id]);

  const staff = useMemo(() => staffQ.data ?? [], [staffQ.data]);
  // Admins already work across every branch; anyone listed here is already in.
  const candidates = useMemo(() => {
    const inBranch = new Set(staff.map((s) => s.id));
    return (usersQ.data ?? []).filter((u) => u.role !== 'admin' && !inBranch.has(u.id));
  }, [usersQ.data, staff]);

  if (!branch) return null;

  const handleAssign = () => {
    if (!pick) return;
    setError(null);
    assign.mutate(
      { branchId: branch.id, userId: pick },
      {
        onSuccess: () => {
          toast.success('Staff assigned');
          setPick('');
        },
        onError: (e) => setError(apiErrorMessage(e, 'Could not assign this user.')),
      }
    );
  };

  const handleRemove = (s: BranchStaff) => {
    setError(null);
    unassign.mutate(
      { branchId: branch.id, userId: s.id },
      {
        onSuccess: () => toast.success(`${staffName(s)} removed from ${branch.name}`),
        onError: (e) => setError(apiErrorMessage(e, 'Could not remove this user.')),
      }
    );
  };

  const picked = candidates.find((u) => u.id === pick);

  return (
    <Modal open onClose={onClose} title={`Staff — ${branch.name}`} className="max-w-xl">
      <div className="space-y-4 px-4 py-4">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="br-assign">Assign a user to this branch</Label>
            <select
              id="br-assign"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              disabled={!online || branch.is_active === false}
              className="h-[38px] w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink-2 disabled:opacity-60"
            >
              <option value="">{candidates.length ? 'Select a user…' : 'No other users to assign'}</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {staffName(u)} — {u.role}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleAssign} disabled={!pick || assign.isPending || !online}>
            {assign.isPending && <Spinner className="h-4 w-4" />}
            Assign
          </Button>
        </div>
        <p className="text-xs text-text-muted">
          {picked?.role === 'cashier'
            ? 'A cashier works in one branch — assigning them here moves them out of their current branch.'
            : 'Managers can be assigned to several branches; cashiers work in one. Admins can act in every branch.'}
        </p>
        {branch.is_active === false && (
          <p className="text-xs text-warning">This branch is inactive — staff can be removed but not added.</p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
          {staffQ.isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Spinner className="h-5 w-5" />
            </div>
          ) : staffQ.isError ? (
            <p className="py-6 text-center text-sm text-text-muted">Couldn&apos;t load staff — check you&apos;re online.</p>
          ) : staff.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">No staff assigned to this branch yet.</p>
          ) : (
            <ul>
              {staff.map((s) => (
                <li key={s.id} className="flex items-center gap-3 border-b border-divider px-4 py-2.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{staffName(s)}</p>
                    <p className="truncate text-xs text-text-muted">
                      <span className="capitalize">{s.role}</span>
                      {s.email ? ` · ${s.email}` : ''}
                    </p>
                  </div>
                  {s.role === 'admin' ? (
                    <span className="text-xs text-text-faint">All branches</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:text-danger"
                      onClick={() => handleRemove(s)}
                      disabled={unassign.isPending || !online}
                    >
                      <UserMinus className="h-4 w-4" /> Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
