// All five POS screens + Checkout sheet. Pure presentational components.
// Reads tweaks via props (theme tokens + density) — no state owned here.

const { useState, useMemo, useEffect, useRef } = React;
const { Icons } = window;

// ─────────────────────────────────────────────────────────────
// Shared atoms
// ─────────────────────────────────────────────────────────────
const Money = ({ n, big, faded, weight = 700, size, currency = '₦' }) => {
  const formatted = typeof n === 'number'
    ? n.toLocaleString('en-NG', { maximumFractionDigits: 0 })
    : n;
  return (
    <span style={{
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontWeight: weight,
      fontSize: size || (big ? 34 : 16),
      letterSpacing: big ? '-0.03em' : '-0.01em',
      color: faded ? 'var(--muted)' : 'inherit',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <span style={{ opacity: 0.55, marginRight: 2 }}>{currency}</span>{formatted}
    </span>
  );
};

const SectionHeader = ({ label, action, onAction }) => (
  <div style={{
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    padding: '20px 20px 10px',
  }}>
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: 'var(--muted)',
    }}>{label}</div>
    {action && (
      <button onClick={onAction} style={{
        background: 'none', border: 0, color: 'var(--accent)',
        fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 4,
      }}>{action}</button>
    )}
  </div>
);

const Chip = ({ active, onClick, icon, children, tone = 'default' }) => {
  const styles = active
    ? { background: 'var(--accent)', color: 'var(--accent-fg)', border: '1px solid var(--accent)' }
    : { background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--border)' };
  return (
    <button onClick={onClick} style={{
      ...styles,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 14px', borderRadius: 999,
      fontSize: 13, fontWeight: 600, cursor: 'pointer',
      whiteSpace: 'nowrap', flexShrink: 0,
      transition: 'all .15s ease',
    }}>
      {icon}
      {children}
    </button>
  );
};

const Pill = ({ children, color = 'var(--muted)', bg, weight = 600 }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 8px', borderRadius: 999,
    fontSize: 11, fontWeight: weight, letterSpacing: '0.02em',
    color, background: bg || 'rgba(0,0,0,0.04)',
    fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
  }}>
    {children}
  </span>
);

const Avatar = ({ letter, color = '#6E56F7', bg, size = 40 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: bg || color + '20', color,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
  }}>{letter}</div>
);

const Card = ({ children, style, onClick, pad = 16 }) => (
  <div onClick={onClick} style={{
    background: 'var(--card)', borderRadius: 20,
    padding: pad, border: '1px solid var(--border)',
    cursor: onClick ? 'pointer' : 'default',
    ...style,
  }}>
    {children}
  </div>
);

// Sparkline component — bars
const Sparkbars = ({ data, color = 'var(--accent)', height = 36, gap = 3 }) => {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap, height }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${Math.max(8, (v / max) * 100)}%`,
          background: color,
          opacity: 0.35 + (i / data.length) * 0.65,
          borderRadius: 2,
        }} />
      ))}
    </div>
  );
};

// Line sparkline
const Sparkline = ({ data, color = 'var(--accent)', height = 50 }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');
  const area = `0,100 ${pts} 100,100`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{
      width: '100%', height, display: 'block',
    }}>
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#sparkfill)"/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────
// Data fixtures
// ─────────────────────────────────────────────────────────────
const BRANCHES = [
  { id: 'all', label: 'All Branches', icon: <Icons.store size={14}/> },
  { id: 'bosso', label: 'Bosso Branch', icon: <Icons.branch size={14}/> },
  { id: 'tudunfulani', label: 'Tudunfulani', icon: <Icons.branch size={14}/> },
];

const PRODUCTS = [
  { id: 'p1', name: 'Goldberg Lager', cat: 'Alcoholic Drinks', price: 1000, sku: 'BEV-001', stock: 48, letter: 'G', tone: '#F59E0B' },
  { id: 'p2', name: 'Smartphone Pro', cat: 'Electronics', price: 45000, sku: 'ELC-002', stock: 7, letter: 'S', tone: '#6E56F7' },
  { id: 'p3', name: 'Coca-Cola 50cl', cat: 'Soft Drinks', price: 350, sku: 'SFT-003', stock: 124, letter: 'C', tone: '#FB7185' },
  { id: 'p4', name: 'Bluetooth Earbuds', cat: 'Electronics', price: 18500, sku: 'ELC-004', stock: 12, letter: 'B', tone: '#10B981' },
  { id: 'p5', name: 'Heineken Bottle', cat: 'Alcoholic Drinks', price: 1500, sku: 'BEV-005', stock: 36, letter: 'H', tone: '#10B981' },
  { id: 'p6', name: 'USB-C Charger', cat: 'Electronics', price: 6500, sku: 'ELC-006', stock: 3, letter: 'U', tone: '#FB7185' },
];

const RECENT_TX = [
  { id: 't1', name: 'Smartphone Pro', sub: 'Cash · Bosso · 14:22', amt: 45000, kind: 'sale' },
  { id: 't2', name: 'Goldberg ×3', sub: 'Card · Bosso · 13:47', amt: 3000, kind: 'sale' },
  { id: 't3', name: 'Refund — USB-C Charger', sub: 'Transfer · Tudunfulani · 12:10', amt: -6500, kind: 'refund' },
  { id: 't4', name: 'Coca-Cola ×6', sub: 'Cash · Bosso · 11:38', amt: 2100, kind: 'sale' },
  { id: 't5', name: 'Bluetooth Earbuds', sub: 'Card · Tudunfulani · 10:55', amt: 18500, kind: 'sale' },
];

const STAFF = [
  { name: 'Admin User', sub: 'admin@store.com', role: 'admin', txns: 82, last: '15 May, 13:33', letter: 'A', tone: '#FB7185', isYou: true },
  { name: 'Jay Gana', sub: 'jay@gmail.com', role: 'cashier', txns: 24, last: '15 May, 13:18', letter: 'J', tone: '#10B981' },
  { name: 'Lilian Agbenyo', sub: 'lilian@gmail.com', role: 'manager', txns: 41, last: '15 May, 13:27', letter: 'L', tone: '#F59E0B' },
];

const CATEGORIES = [
  { name: 'Electronics', count: 14, letter: 'E', tone: '#6E56F7' },
  { name: 'Alcoholic Drinks', count: 9, letter: 'A', tone: '#F59E0B' },
  { name: 'Soft Drinks', count: 6, letter: 'S', tone: '#10B981' },
  { name: 'Snacks', count: 11, letter: 'N', tone: '#FB7185' },
];

// ─────────────────────────────────────────────────────────────
// 1) DASHBOARD
// ─────────────────────────────────────────────────────────────
function DashboardScreen({ onOpenCheckout }) {
  return (
    <div style={{ paddingBottom: 120 }}>
      {/* Header */}
      <div style={{
        padding: '8px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>Friday, 15 May</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }}>
            Good afternoon, Admin <Icons.wave/>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={iconBtn}><Icons.bell size={20}/></button>
        </div>
      </div>

      {/* Hero balance card */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{
          borderRadius: 28,
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
          color: 'var(--accent-fg)',
          padding: '22px 22px 18px',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* decorative orb */}
          <div style={{
            position: 'absolute', right: -40, top: -40,
            width: 180, height: 180, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
          }}/>
          <div style={{
            position: 'absolute', right: 20, top: 80,
            width: 90, height: 90, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
          }}/>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, letterSpacing: '0.04em' }}>
              7-DAY REVENUE · ALL BRANCHES
            </div>
            <div style={{ marginTop: 6, fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 38, letterSpacing: '-0.03em' }}>
              <span style={{ opacity: 0.7, marginRight: 2 }}>₦</span>811,200
            </div>
            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
              Avg ₦115,886 / day this week
            </div>

            {/* sparkline */}
            <div style={{ marginTop: 12, height: 42, color: 'rgba(255,255,255,0.85)' }}>
              <Sparkline data={[68, 72, 51, 90, 84, 102, 95]} color="currentColor" height={42}/>
            </div>

            {/* Quick actions row */}
            <div style={{
              marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
            }}>
              {[
                { i: <Icons.plus size={18}/>, l: 'New Sale', onClick: onOpenCheckout },
                { i: <Icons.refund size={18}/>, l: 'Refund' },
                { i: <Icons.receipt size={18}/>, l: 'Receipts' },
                { i: <Icons.qr size={18}/>, l: 'Scan' },
              ].map((a, i) => (
                <button key={i} onClick={a.onClick} style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: 'var(--accent-fg)',
                  borderRadius: 14, padding: '10px 6px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  backdropFilter: 'blur(8px)',
                }}>
                  {a.i}
                  {a.l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Today KPI grid */}
      <SectionHeader label="Today at a glance"/>
      <div style={{
        padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
      }}>
        <KpiTile
          icon={<Icons.banknote size={18}/>}
          tone="#10B981"
          label="Revenue"
          value={<Money n={71575} weight={800} size={22}/>}
          sub="64 sales · +12%"
        />
        <KpiTile
          icon={<Icons.trending size={18}/>}
          tone="#6E56F7"
          label="Avg ticket"
          value={<Money n={1118} weight={800} size={22}/>}
          sub="per transaction"
        />
        <KpiTile
          icon={<Icons.box size={18}/>}
          tone="#F59E0B"
          label="Items sold"
          value={<span style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 22 }}>128</span>}
          sub="units today"
        />
        <KpiTile
          icon={<Icons.alert size={18}/>}
          tone="#FB7185"
          label="Low stock"
          value={<span style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 22 }}>3</span>}
          sub="needs reorder"
        />
      </div>

      {/* Payment methods */}
      <SectionHeader label="Payment mix — today"/>
      <div style={{ padding: '0 20px' }}>
        <Card pad={18}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <Money n={71575} big weight={800} size={26}/>
            <Pill color="#0F8A5B" bg="rgba(16,185,129,0.12)">↗ +12.4%</Pill>
          </div>
          {/* Stacked bar */}
          <div style={{
            display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', marginBottom: 14,
          }}>
            <div style={{ flex: 58, background: 'var(--accent)' }}/>
            <div style={{ flex: 28, background: '#10B981' }}/>
            <div style={{ flex: 14, background: '#F59E0B' }}/>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PayRow color="var(--accent)" label="Cash" pct="58%" amt={41513}/>
            <PayRow color="#10B981" label="Card" pct="28%" amt={20041}/>
            <PayRow color="#F59E0B" label="Transfer" pct="14%" amt={10021}/>
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <SectionHeader label="Recent activity" action="See all"/>
      <div style={{ padding: '0 20px' }}>
        <Card pad={6}>
          {RECENT_TX.map((t, i) => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 12px',
              borderBottom: i < RECENT_TX.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 12,
                background: t.kind === 'refund' ? 'rgba(251,113,133,0.12)' : 'rgba(16,185,129,0.12)',
                color: t.kind === 'refund' ? '#FB7185' : '#10B981',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {t.kind === 'refund' ? <Icons.refund size={18}/> : <Icons.arrowUpRight size={18}/>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.sub}</div>
              </div>
              <div style={{
                fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 14,
                color: t.amt < 0 ? '#E11D6B' : 'var(--ink)',
              }}>
                {t.amt < 0 ? '−' : '+'}<span style={{ opacity: 0.55 }}>₦</span>{Math.abs(t.amt).toLocaleString()}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

const iconBtn = {
  width: 40, height: 40, borderRadius: 14,
  background: 'var(--card)', border: '1px solid var(--border)',
  color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
};

const KpiTile = ({ icon, tone, label, value, sub }) => (
  <div style={{
    background: 'var(--card)', borderRadius: 18,
    padding: 14, border: '1px solid var(--border)',
  }}>
    <div style={{
      width: 34, height: 34, borderRadius: 10,
      background: tone + '1A', color: tone,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      marginBottom: 10,
    }}>{icon}</div>
    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
    <div style={{ marginTop: 2 }}>{value}</div>
    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>
  </div>
);

const PayRow = ({ color, label, pct, amt }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <div style={{ width: 8, height: 8, borderRadius: 4, background: color }}/>
    <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, width: 40 }}>{pct}</div>
    <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 13 }}>
      <span style={{ opacity: 0.55 }}>₦</span>{amt.toLocaleString()}
    </div>
  </div>
);

window.DashboardScreen = DashboardScreen;
window.Money = Money;
window.SectionHeader = SectionHeader;
window.Chip = Chip;
window.Pill = Pill;
window.Avatar = Avatar;
window.Card = Card;
window.Sparkbars = Sparkbars;
window.Sparkline = Sparkline;
window.KpiTile = KpiTile;
window.PRODUCTS = PRODUCTS;
window.BRANCHES = BRANCHES;
window.STAFF = STAFF;
window.CATEGORIES = CATEGORIES;
window.RECENT_TX = RECENT_TX;
window.iconBtn = iconBtn;
