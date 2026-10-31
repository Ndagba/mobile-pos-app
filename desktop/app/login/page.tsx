'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStatus } from '@/lib/useNetwork';
import { Spinner } from '@/components/ui/spinner';
import { AuthScene } from '@/components/auth/AuthScene';
import { cn } from '@/lib/utils';

/** Self-serve sign-up is hidden until its backend ships (login handoff §Sign up). */
const SIGNUP_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SIGNUP === 'true';

type Mode = 'login' | 'signup';

function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const login = useAuthStore((s) => s.login);
  const signup = useAuthStore((s) => s.signup);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const online = useNetworkStatus();

  const urlMode = searchParams.get('mode');
  const [mode, setMode] = useState<Mode>(SIGNUP_ENABLED && urlMode === 'signup' ? 'signup' : 'login');
  const [showPw, setShowPw] = useState(false);

  // Keep the tab in sync with the URL (deep links, back/forward).
  useEffect(() => {
    setMode(SIGNUP_ENABLED && urlMode === 'signup' ? 'signup' : 'login');
  }, [urlMode]);

  // Already signed in → straight to the app.
  useEffect(() => {
    if (hydrated && user) router.replace('/dashboard');
  }, [hydrated, user, router]);

  const changeMode = (m: Mode) => {
    if (m === 'signup' && !SIGNUP_ENABLED) return;
    setMode(m);
    router.replace(m === 'signup' ? '/login?mode=signup' : '/login', { scroll: false });
  };

  const submitting = status === 'loading';

  // ── Login ────────────────────────────────────────────────────
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true); // UI-only (tokenStorage is persistent)

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(username.trim(), password);
      router.replace('/dashboard');
    } catch {
      /* error surfaced via the store */
    }
  };

  // ── Sign up ──────────────────────────────────────────────────
  const [su, setSu] = useState({ businessName: '', fullName: '', phone: '', email: '', password: '' });
  const [suErrors, setSuErrors] = useState<Record<string, string>>({});
  const setSuField = (k: keyof typeof su, v: string) => setSu((p) => ({ ...p, [k]: v }));

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!su.businessName.trim()) errs.businessName = 'Business name is required.';
    if (!su.fullName.trim()) errs.fullName = 'Your name is required.';
    if (!su.phone.trim()) errs.phone = 'Phone is required.';
    if (!su.email.trim()) errs.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(su.email.trim())) errs.email = 'Enter a valid email.';
    if (su.password.length < 8) errs.password = 'At least 8 characters.';
    setSuErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await signup({ ...su, email: su.email.trim(), phone: su.phone.trim() });
      router.replace('/dashboard');
    } catch {
      /* error surfaced via the store */
    }
  };

  return (
    <div
      className="grid min-h-screen bg-background"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))' }}
    >
      <AuthScene />

      {/* Form panel */}
      <div className="flex flex-col bg-surface px-6 py-7 sm:px-10">
        {/* Top prompt + opposite-mode button */}
        {SIGNUP_ENABLED && (
          <div className="flex items-center justify-end gap-3 text-[13px] text-text-muted">
            <span>{mode === 'login' ? 'New to JayPOS?' : 'Already have an account?'}</span>
            <button
              type="button"
              onClick={() => changeMode(mode === 'login' ? 'signup' : 'login')}
              className="h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-ink-2 transition-colors hover:border-primary-border hover:bg-surface-subtle"
            >
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </div>
        )}

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-[400px]">
            {/* Tabs */}
            {SIGNUP_ENABLED && (
              <div role="tablist" className="mb-7 flex gap-1 rounded-seg bg-muted p-[3px]">
                {(['login', 'signup'] as Mode[]).map((m) => {
                  const active = mode === m;
                  return (
                    <button
                      key={m}
                      role="tab"
                      type="button"
                      aria-selected={active}
                      onClick={() => changeMode(m)}
                      className={cn(
                        'h-9 flex-1 rounded-lg text-[13.5px] font-bold transition-colors',
                        active ? 'bg-surface text-ink shadow-segment' : 'text-[#6A687C] hover:text-ink-2'
                      )}
                    >
                      {m === 'login' ? 'Log in' : 'Sign up'}
                    </button>
                  );
                })}
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={onLogin} className="grid gap-4">
                <div>
                  <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink">Welcome back</h1>
                  <p className="mt-1.5 text-[14px] text-text-muted">Log in to your point of sale.</p>
                </div>

                <FieldLabel htmlFor="username">Username</FieldLabel>
                <AuthInput
                  id="username"
                  autoComplete="username"
                  autoFocus
                  placeholder="e.g. superadmin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={submitting}
                  className="-mt-2"
                />

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <button
                      type="button"
                      onClick={() => toast('Ask your store admin to reset your password.')}
                      className="text-[12.5px] font-semibold text-primary hover:text-primary-ink"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={submitting}
                    show={showPw}
                    onToggle={() => setShowPw((v) => !v)}
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-text">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  Remember this device
                </label>

                {error && (
                  <p className="text-[12px] text-danger" role="alert">
                    {error}
                  </p>
                )}

                <PrimaryButton submitting={submitting}>Log in</PrimaryButton>
                {SIGNUP_ENABLED && (
                  <SecondaryButton onClick={() => changeMode('signup')}>Sign up for JayPOS</SecondaryButton>
                )}
              </form>
            ) : (
              <form onSubmit={onSignup} className="grid gap-3.5">
                <div>
                  <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink">Create your store</h1>
                  <p className="mt-1.5 text-[14px] text-text-muted">Set up your business and your admin account.</p>
                </div>

                <Field label="Business name" error={suErrors.businessName}>
                  <AuthInput
                    autoFocus
                    placeholder="e.g. Mama Jay Supermarket"
                    value={su.businessName}
                    onChange={(e) => setSuField('businessName', e.target.value)}
                    disabled={submitting}
                  />
                </Field>

                <div className="grid gap-3.5 sm:grid-cols-2">
                  <Field label="Full name" error={suErrors.fullName}>
                    <AuthInput
                      autoComplete="name"
                      placeholder="Your name"
                      value={su.fullName}
                      onChange={(e) => setSuField('fullName', e.target.value)}
                      disabled={submitting}
                    />
                  </Field>
                  <Field label="Phone" error={suErrors.phone}>
                    <AuthInput
                      type="tel"
                      autoComplete="tel"
                      placeholder="080…"
                      value={su.phone}
                      onChange={(e) => setSuField('phone', e.target.value)}
                      disabled={submitting}
                    />
                  </Field>
                </div>

                <Field label="Email" error={suErrors.email}>
                  <AuthInput
                    type="email"
                    autoComplete="email"
                    placeholder="you@business.com"
                    value={su.email}
                    onChange={(e) => setSuField('email', e.target.value)}
                    disabled={submitting}
                  />
                </Field>

                <Field label="Password" error={suErrors.password}>
                  <PasswordInput
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={su.password}
                    onChange={(e) => setSuField('password', e.target.value)}
                    disabled={submitting}
                    show={showPw}
                    onToggle={() => setShowPw((v) => !v)}
                  />
                </Field>

                {error && (
                  <p className="text-[12px] text-danger" role="alert">
                    {error}
                  </p>
                )}

                <PrimaryButton submitting={submitting}>Create account</PrimaryButton>
                <SecondaryButton onClick={() => changeMode('login')}>I already have an account</SecondaryButton>
                <p className="text-center text-[12px] leading-[1.5] text-text-faint">
                  By creating an account you agree to the{' '}
                  <a href="#" className="text-primary hover:text-primary-ink">Terms</a> and{' '}
                  <a href="#" className="text-primary hover:text-primary-ink">Privacy Policy</a>.
                </p>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-text-faint">
          <span>© 2026 JayPOS</span>
          <span className="flex items-center gap-1.5">
            <span className={cn('h-[7px] w-[7px] rounded-full', online ? 'bg-success' : 'bg-warning')} />
            {online ? 'Online' : 'Offline'} · v2.0
          </span>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[12.5px] font-semibold text-[#3A3848]">
      {children}
    </label>
  );
}

function Field({
  label,
  error,
  children
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      {children}
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </div>
  );
}

function AuthInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'h-11 w-full rounded-lg border border-border-strong bg-surface px-3.5 text-[14px] font-medium text-ink-2 outline-none transition-colors placeholder:text-text-faint disabled:opacity-60',
        className
      )}
    />
  );
}

function PasswordInput({
  show,
  onToggle,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { show: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <AuthInput {...props} type={show ? 'text' : 'password'} className={cn('pr-16', className)} />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        className="absolute right-1.5 top-1.5 h-8 rounded-md px-2.5 text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary-soft"
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

function PrimaryButton({ submitting, children }: { submitting: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className="mt-1 flex h-[46px] items-center justify-center rounded-lg bg-primary text-[14.5px] font-bold text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active disabled:opacity-60"
      style={{ boxShadow: '0 10px 24px rgba(110,86,247,.32)' }}
    >
      {submitting ? <Spinner className="text-primary-foreground" /> : children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[46px] items-center justify-center rounded-lg border border-border-strong bg-surface text-[14.5px] font-bold text-ink-2 transition-colors hover:border-primary-border hover:bg-surface-subtle"
    >
      {children}
    </button>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  );
}
