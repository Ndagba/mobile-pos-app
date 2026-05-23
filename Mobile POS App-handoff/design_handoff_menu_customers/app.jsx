// Main app: phone shell + bottom nav + tab routing + tweaks.
const { useState: useS, useEffect: useE } = React;
const { Icons, TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle, useTweaks } = window;

// Theme presets
const THEMES = {
  light: {
    bg: '#F4F1EA',
    card: '#FFFFFF',
    ink: '#0E0E10',
    muted: '#71717A',
    border: 'rgba(14,14,16,0.07)',
    chrome: '#FFFFFF',
  },
  dark: {
    bg: '#0B0B0E',
    card: '#16161B',
    ink: '#F5F5F7',
    muted: '#9090A0',
    border: 'rgba(255,255,255,0.07)',
    chrome: '#16161B',
  },
};

// Accent palette options: [start, end, fg]
const ACCENT_OPTIONS = [
  ['#6E56F7', '#3D2EC4', '#FFFFFF'],
  ['#10B981', '#0B8A6A', '#FFFFFF'],
  ['#F59E0B', '#B45309', '#1A0F00'],
  ['#FB7185', '#E11D6B', '#FFFFFF'],
  ['#1A1A22', '#000000', '#FFFFFF'],
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": ["#6E56F7", "#3D2EC4", "#FFFFFF"],
  "showStatusBar": true,
  "showHomeIndicator": true
}/*EDITMODE-END*/;

// ─────────────────────────────────────────────────────────────
// Phone frame
// ─────────────────────────────────────────────────────────────
const PhoneFrame = ({ children, theme, showStatusBar, showHomeIndicator }) => {
  const isDark = theme === 'dark';
  return (
    <div style={{
      width: 390, height: 844,
      borderRadius: 52,
      background: isDark ? '#000' : '#1d1c20',
      padding: 10,
      boxShadow: '0 50px 120px -20px rgba(14,14,16,0.45), 0 20px 50px -10px rgba(14,14,16,0.25), inset 0 0 0 1px rgba(255,255,255,0.05)',
      position: 'relative',
    }}>
      <div style={{
        width: '100%', height: '100%',
        borderRadius: 42, overflow: 'hidden',
        background: 'var(--bg)',
        position: 'relative',
      }}>
        {/* Dynamic island */}
        {showStatusBar && (
          <>
            <div style={{
              position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
              width: 110, height: 32, borderRadius: 999, background: '#000',
              zIndex: 50,
            }}/>
            <StatusBar/>
          </>
        )}
        <div style={{
          position: 'absolute', inset: showStatusBar ? '54px 0 0' : 0,
          overflow: 'hidden',
        }}>
          {children}
        </div>
        {/* Home indicator */}
        {showHomeIndicator && (
          <div style={{
            position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
            width: 130, height: 5, borderRadius: 3,
            background: 'var(--ink)', opacity: 0.4, zIndex: 60,
          }}/>
        )}
      </div>
    </div>
  );
};

const StatusBar = () => (
  <div style={{
    position: 'absolute', top: 0, left: 0, right: 0, height: 54,
    padding: '18px 28px 0',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 15, fontWeight: 700, color: 'var(--ink)',
    fontFamily: '"Plus Jakarta Sans", system-ui',
    zIndex: 40, pointerEvents: 'none',
  }}>
    <div>14:22</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {/* signal */}
      <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
        <rect x="0" y="7" width="3" height="4" rx="0.6"/>
        <rect x="5" y="5" width="3" height="6" rx="0.6"/>
        <rect x="10" y="2" width="3" height="9" rx="0.6"/>
        <rect x="14.5" y="0" width="2.5" height="11" rx="0.6" opacity="0.35"/>
      </svg>
      {/* wifi */}
      <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor">
        <path d="M8 11l-1.4-1.4a2 2 0 0 1 2.8 0L8 11z"/>
        <path d="M11.7 7.3a5.2 5.2 0 0 0-7.4 0l-1-1a6.6 6.6 0 0 1 9.4 0l-1 1z" opacity="0.9"/>
        <path d="M14.4 4.6a9 9 0 0 0-12.8 0L0.5 3.5a10.5 10.5 0 0 1 15 0l-1.1 1.1z" opacity="0.85"/>
      </svg>
      {/* battery */}
      <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
        <rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" opacity="0.4"/>
        <rect x="2" y="2" width="17" height="8" rx="1.5" fill="currentColor"/>
        <rect x="23.5" y="4" width="1.5" height="4" rx="0.5" fill="currentColor" opacity="0.4"/>
      </svg>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Bottom navigation — floating pill with 4 tabs + center FAB
// ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard', icon: 'dashboard', label: 'Home' },
  { id: 'inventory', icon: 'box', label: 'Inventory' },
  { id: 'customers', icon: 'users', label: 'Customers' },
  { id: 'analytics', icon: 'chart', label: 'Analytics' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
];

const BottomNav = ({ active, onChange, onCheckout }) => {
  // 5 tabs + FAB — split 2 / FAB / 3 around the center action.
  // Active tab shows its label; inactive tabs are icon-only. This is
  // the standard modern banking pattern when slot count is tight.
  return (
    <div style={{
      position: 'absolute', bottom: 18, left: 12, right: 12,
      zIndex: 30, pointerEvents: 'none',
    }}>
      <div style={{
        background: 'var(--chrome)',
        borderRadius: 28, padding: '6px 6px',
        boxShadow: '0 20px 50px -10px rgba(14,14,16,0.18), 0 1px 0 rgba(255,255,255,0.4) inset',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 2,
        pointerEvents: 'auto',
        backdropFilter: 'blur(12px)',
      }}>
        {/* Left 2 tabs */}
        {TABS.slice(0, 2).map(t => (
          <NavBtn key={t.id} tab={t} active={active === t.id} onClick={() => onChange(t.id)}/>
        ))}

        {/* Center FAB */}
        <div style={{ width: 64, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <button onClick={onCheckout} style={{
            width: 54, height: 54, borderRadius: 20,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            color: 'var(--accent-fg)',
            border: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 10px 30px -5px color-mix(in oklab, var(--accent) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)',
            position: 'relative',
            transform: 'translateY(-14px)',
          }}>
            <Icons.cart size={22} strokeWidth={2.2}/>
            <div style={{
              position: 'absolute', bottom: -20, left: '50%', transform: 'translateX(-50%)',
              fontSize: 9, fontWeight: 800, color: 'var(--ink)',
              whiteSpace: 'nowrap', letterSpacing: '0.06em',
            }}>NEW SALE</div>
          </button>
        </div>

        {/* Right 3 tabs */}
        {TABS.slice(2).map(t => (
          <NavBtn key={t.id} tab={t} active={active === t.id} onClick={() => onChange(t.id)}/>
        ))}
      </div>
    </div>
  );
};

const NavBtn = ({ tab, active, onClick }) => {
  const Ic = Icons[tab.icon];
  return (
    <button onClick={onClick} style={{
      background: active ? 'rgba(110,86,247,0.10)' : 'transparent',
      border: 0, cursor: 'pointer',
      flex: active ? 2.6 : 1,
      minWidth: 0,
      padding: active ? '9px 12px' : '10px 4px',
      borderRadius: 18,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 6,
      color: active ? 'var(--accent)' : 'var(--muted)',
      fontFamily: 'inherit',
      transition: 'color .18s ease',
    }}>
      <Ic size={active ? 20 : 22} strokeWidth={active ? 2.2 : 1.8}/>
      {active && (
        <span style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}>{tab.label}</span>
      )}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────
function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = useS('dashboard');
  const [checkoutOpen, setCheckoutOpen] = useS(false);
  const [signedIn, setSignedIn] = useS(false);
  const [txnsOpen, setTxnsOpen] = useS(false);

  const theme = THEMES[tweaks.theme] || THEMES.light;
  const accent = Array.isArray(tweaks.accent) && tweaks.accent.length >= 3
    ? tweaks.accent
    : ACCENT_OPTIONS[0];

  // Apply theme as CSS variables on a root element so all children can use them
  const themeStyle = {
    '--bg': theme.bg,
    '--card': theme.card,
    '--ink': theme.ink,
    '--muted': theme.muted,
    '--border': theme.border,
    '--chrome': theme.chrome,
    '--accent': accent[0],
    '--accent-2': accent[1],
    '--accent-fg': accent[2],
    color: theme.ink,
  };

  return (
    <div style={{
      minHeight: '100vh', width: '100%',
      background: 'radial-gradient(ellipse at top, oklch(0.96 0.01 280), oklch(0.92 0.005 60))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      padding: 24, boxSizing: 'border-box',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(circle at 20% 30%, ${accent[0]}18 0%, transparent 40%), radial-gradient(circle at 80% 70%, ${accent[1]}12 0%, transparent 40%)`,
      }}/>

      <div style={themeStyle}>
        <PhoneFrame
          theme={tweaks.theme}
          showStatusBar={tweaks.showStatusBar}
          showHomeIndicator={tweaks.showHomeIndicator}
        >
          {/* Active screen */}
          {!signedIn ? (
            <window.LoginScreen
              onSignIn={() => setSignedIn(true)}
              accentPalette={accent}
            />
          ) : (
            <>
              <div style={{ width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg)', color: 'var(--ink)' }}>
                {tab === 'dashboard' && <window.DashboardScreen onOpenCheckout={() => setCheckoutOpen(true)} onOpenTxns={() => setTxnsOpen(true)}/>}
                {tab === 'inventory' && <window.InventoryScreen/>}
                {tab === 'customers' && <window.CustomersScreen/>}
                {tab === 'analytics' && <window.AnalyticsScreen/>}
                {tab === 'settings' && <window.SettingsScreen onLogout={() => setSignedIn(false)}/>}
              </div>

              {/* Bottom nav */}
              <BottomNav active={tab} onChange={setTab} onCheckout={() => setCheckoutOpen(true)}/>

              {/* Checkout modal */}
              {checkoutOpen && (
                <window.CheckoutScreen onClose={() => setCheckoutOpen(false)}/>
              )}

              {/* Transactions modal */}
              {txnsOpen && (
                <window.TransactionsScreen onClose={() => setTxnsOpen(false)}/>
              )}
            </>
          )}
        </PhoneFrame>
      </div>

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection title="Theme">
          <TweakRadio
            label="Mode"
            value={tweaks.theme}
            onChange={v => setTweak('theme', v)}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          <TweakColor
            label="Accent"
            value={tweaks.accent}
            onChange={v => setTweak('accent', v)}
            options={ACCENT_OPTIONS}
          />
        </TweakSection>
        <TweakSection title="Frame">
          <TweakToggle label="Status bar" value={tweaks.showStatusBar} onChange={v => setTweak('showStatusBar', v)}/>
          <TweakToggle label="Home indicator" value={tweaks.showHomeIndicator} onChange={v => setTweak('showHomeIndicator', v)}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
