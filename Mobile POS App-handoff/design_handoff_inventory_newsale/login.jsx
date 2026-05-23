// Login screen — banking-app pattern: saved-account hero + password + biometric.
const { useState: useLS, useEffect: useLE } = React;

function LoginScreen({ onSignIn, accentPalette }) {
  const [pw, setPw] = useLS('');
  const [showPw, setShowPw] = useLS(false);
  const [loading, setLoading] = useLS(false);
  const [bioActive, setBioActive] = useLS(false);
  const [fresh, setFresh] = useLS(false); // "Switch account" mode
  const [email, setEmail] = useLS('admin@store.com');

  const handleSignIn = () => {
    if (loading) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); onSignIn(); }, 700);
  };

  const handleBio = () => {
    setBioActive(true);
    setTimeout(() => { setBioActive(false); onSignIn(); }, 900);
  };

  const accent = accentPalette || ['#6E56F7', '#3D2EC4'];

  return (
    <div style={{
      width: '100%', height: '100%', overflowY: 'auto', overflowX: 'hidden',
      background: 'var(--bg)', color: 'var(--ink)',
      position: 'relative',
    }}>
      {/* Soft background blobs */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(circle at 20% 12%, ${accent[0]}22 0%, transparent 45%), radial-gradient(circle at 90% 88%, ${accent[1]}18 0%, transparent 45%)`,
      }}/>

      {/* Big JP logo + wordmark — hero */}
      <div style={{
        position: 'relative', paddingTop: 30,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <window.Logo size={84} accent={accent}/>
        <window.Wordmark size={22}/>
      </div>

      {/* Welcome / Switch-account context */}
      <div style={{ position: 'relative', marginTop: 28, textAlign: 'center', padding: '0 28px' }}>
        {!fresh ? (
          <>
            <div style={{
              fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em',
            }}>Welcome back, Admin</div>
            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--muted)' }}>
              {email} · store_001
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            Sign in to your store
          </div>
        )}
      </div>

      {/* Form */}
      <div style={{ position: 'relative', padding: '32px 24px 0' }}>
        {fresh && (
          <FloatingField
            label="Email"
            value={email}
            onChange={setEmail}
            type="email"
            icon={<window.Icons.user size={18}/>}
          />
        )}

        <div style={{ marginTop: fresh ? 12 : 0 }}>
          <FloatingField
            label="Password"
            value={pw}
            onChange={setPw}
            type={showPw ? 'text' : 'password'}
            icon={<window.Icons.shield size={18}/>}
            rightSlot={
              <button
                onClick={() => setShowPw(!showPw)}
                style={{
                  background: 'transparent', border: 0, cursor: 'pointer',
                  color: 'var(--muted)', padding: 4,
                }}>
                {showPw ? <window.Icons.eyeOff size={18}/> : <window.Icons.eye size={18}/>}
              </button>
            }
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <a href="#" onClick={e => e.preventDefault()} style={{
            fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none',
          }}>Forgot password?</a>
        </div>

        <button
          onClick={handleSignIn}
          disabled={loading}
          style={{
            marginTop: 18, width: '100%', padding: '15px 0',
            borderRadius: 18, border: 0, cursor: loading ? 'default' : 'pointer',
            background: `linear-gradient(135deg, ${accent[0]}, ${accent[1]})`,
            color: 'var(--accent-fg)',
            fontFamily: 'inherit', fontWeight: 700, fontSize: 15,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            whiteSpace: 'nowrap',
            boxShadow: `0 14px 30px -8px ${accent[0]}88, inset 0 1px 0 rgba(255,255,255,0.22)`,
            transition: 'transform .15s ease',
          }}
        >
          {loading ? (
            <>
              <span style={spinnerStyle}/>
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <window.Icons.arrowRight size={18} strokeWidth={2.2}/>
            </>
          )}
        </button>

        {/* OR divider */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          margin: '24px 0 18px',
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.16em' }}>OR</div>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
        </div>

        {/* Biometric */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <button onClick={handleBio} style={{
            width: 72, height: 72, borderRadius: '50%',
            background: bioActive
              ? `radial-gradient(circle, ${accent[0]}33 0%, ${accent[0]}11 70%, transparent 100%)`
              : `${accent[0]}10`,
            border: `1.5px solid ${accent[0]}33`,
            color: accent[0], cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
            transition: 'all .3s ease',
            transform: bioActive ? 'scale(1.08)' : 'scale(1)',
          }}>
            <FingerprintIcon size={34} color={accent[0]}/>
            {bioActive && (
              <div style={{
                position: 'absolute', inset: -8, borderRadius: '50%',
                border: `2px solid ${accent[0]}55`,
                animation: 'ping 1.2s cubic-bezier(0,0,0.2,1) infinite',
              }}/>
            )}
          </button>
          <div style={{
            marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--ink)',
          }}>{bioActive ? 'Authenticating…' : 'Use Biometric'}</div>
        </div>
      </div>

      {/* Switch account */}
      <div style={{
        position: 'absolute', bottom: 18, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
        <button onClick={() => setFresh(!fresh)} style={{
          background: 'transparent', border: 0, cursor: 'pointer',
          color: 'var(--muted)', fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
        }}>
          {fresh ? '← Back to saved account' : (<>Not you? <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Switch account</span></>)}
        </button>
        <div style={{ fontSize: 10, color: 'var(--muted)', opacity: 0.7 }}>
          JayPOS v2.4.1 · Secured by PIN, biometrics & device trust
        </div>
      </div>
    </div>
  );
}

const FloatingField = ({ label, value, onChange, type = 'text', icon, rightSlot }) => {
  const [focused, setFocused] = useLS(false);
  const float = focused || (value && value.length);
  return (
    <div style={{
      position: 'relative',
      background: 'var(--card)',
      border: `1.5px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 16,
      padding: '14px 14px 14px 46px',
      transition: 'border-color .15s ease',
    }}>
      <span style={{
        position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
        color: focused ? 'var(--accent)' : 'var(--muted)',
        transition: 'color .15s',
      }}>{icon}</span>
      <label style={{
        position: 'absolute',
        left: 46,
        top: float ? 6 : '50%',
        transform: float ? 'translateY(0)' : 'translateY(-50%)',
        fontSize: float ? 10 : 14,
        fontWeight: float ? 700 : 500,
        color: focused ? 'var(--accent)' : 'var(--muted)',
        letterSpacing: float ? '0.06em' : 0,
        textTransform: float ? 'uppercase' : 'none',
        pointerEvents: 'none',
        transition: 'all .15s ease',
        fontFamily: 'inherit',
      }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          border: 0, outline: 'none', background: 'transparent',
          fontSize: 15, fontFamily: 'inherit', color: 'var(--ink)',
          fontWeight: 600,
          paddingTop: float ? 12 : 0,
          paddingRight: rightSlot ? 28 : 0,
          transition: 'padding-top .15s ease',
        }}
      />
      {rightSlot && (
        <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>{rightSlot}</span>
      )}
    </div>
  );
};

const spinnerStyle = {
  display: 'inline-block',
  width: 14, height: 14, borderRadius: '50%',
  border: '2px solid rgba(255,255,255,0.4)',
  borderTopColor: '#fff',
  animation: 'spin .8s linear infinite',
};

const FingerprintIcon = ({ size = 32, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 11v4a3 3 0 0 1-3 3"/>
    <path d="M8 11a4 4 0 0 1 8 0v3a8 8 0 0 1-1 4"/>
    <path d="M5 14c0-3.87 3.13-7 7-7s7 3.13 7 7v2"/>
    <path d="M3 11a9 9 0 0 1 9-9 9 9 0 0 1 8 4.7"/>
    <path d="M16 20a8 8 0 0 1-9-2"/>
  </svg>
);

window.LoginScreen = LoginScreen;
