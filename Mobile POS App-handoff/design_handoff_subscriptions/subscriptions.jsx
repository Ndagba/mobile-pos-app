// Subscriptions screen + Create Subscription bottom sheet.
// Modern JayPOS pattern: gradient hero w/ totals, search + segmented chip filter,
// list of store cards with status pill, Plan + Expires meta rows, and actions.

const { useState: useSS, useMemo: useSMemo } = React;

const SUBS = [
  { id: 's1',  store: 'Elephant House Store',   storeId: 'store_002', plan: 'Business', status: 'active',   expires: '22 Jun 2026', daysLeft: 31,  amt: 25000 },
  { id: 's2',  store: 'Tudunfulani Mart',       storeId: 'store_005', plan: 'Pro',      status: 'active',   expires: '08 Jul 2026', daysLeft: 47,  amt: 75000 },
  { id: 's3',  store: 'Bosso Foods',            storeId: 'store_001', plan: 'Business', status: 'active',   expires: '14 Aug 2026', daysLeft: 84,  amt: 25000 },
  { id: 's4',  store: 'Aisha General Store',    storeId: 'store_008', plan: 'Business', status: 'past_due', expires: '12 May 2026', daysLeft: -10, amt: 25000 },
  { id: 's5',  store: 'Northern Beverages',     storeId: 'store_011', plan: 'Pro',      status: 'expired',  expires: '01 May 2026', daysLeft: -21, amt: 75000 },
  { id: 's6',  store: 'Quick-Stop Kiosk',       storeId: 'store_014', plan: 'Business', status: 'active',   expires: '19 May 2026', daysLeft: 6,   amt: 25000 }, // expiring soon
  { id: 's7',  store: 'JK Wholesalers',         storeId: 'store_017', plan: 'Pro',      status: 'expired',  expires: '15 Apr 2026', daysLeft: -37, amt: 75000 },
];

window.SUBS = SUBS;

const STATUS_META = {
  active:   { label: 'Active',   text: '#0F8A5B', bg: 'rgba(16,185,129,0.14)', dot: '#10B981' },
  expired:  { label: 'Expired',  text: '#71717A', bg: 'rgba(0,0,0,0.06)',      dot: '#9090A0' },
  past_due: { label: 'Past due', text: '#E11D6B', bg: 'rgba(225,29,107,0.12)', dot: '#FB7185' },
};

// ─────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────
function SubscriptionsScreen({ onClose }) {
  const [filter, setFilter] = useSS('all');
  const [query, setQuery] = useSS('');
  const [createOpen, setCreateOpen] = useSS(false);

  const filtered = useSMemo(() => SUBS.filter(s => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!s.store.toLowerCase().includes(q) && !s.storeId.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [filter, query]);

  const counts = {
    all:      SUBS.length,
    active:   SUBS.filter(s => s.status === 'active').length,
    expired:  SUBS.filter(s => s.status === 'expired').length,
    past_due: SUBS.filter(s => s.status === 'past_due').length,
  };
  const mrr = SUBS.filter(s => s.status === 'active').reduce((a, s) => a + s.amt, 0);

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', zIndex: 100,
      animation: 'slideUp .3s cubic-bezier(.16,1,.3,1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px 14px', display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--card)',
      }}>
        <button onClick={onClose} style={window.iconBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Subscriptions
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{filtered.length}</span> records
          </div>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          style={{
            padding: '10px 14px', borderRadius: 14,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            color: 'var(--accent-fg)', border: 0, cursor: 'pointer',
            fontSize: 13, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'inherit',
            boxShadow: '0 10px 22px -8px color-mix(in oklab, var(--accent) 70%, transparent)',
          }}>
          <window.Icons.plus size={16} strokeWidth={2.4}/> Create
        </button>
      </div>

      {/* Hero */}
      <div style={{ padding: '8px 20px 14px', background: 'var(--card)' }}>
        <div style={{
          borderRadius: 18,
          background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
          color: 'var(--accent-fg)',
          padding: '16px 18px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', right: -30, top: -30,
            width: 140, height: 140, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
          }}/>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', opacity: 0.85, textTransform: 'uppercase' }}>
              Monthly recurring revenue
            </div>
            <div style={{ marginTop: 4, fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em' }}>
              <span style={{ opacity: 0.7 }}>₦</span>{mrr.toLocaleString()}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
              <SubStat label="Active"   value={counts.active}/>
              <SubStat label="Past due" value={counts.past_due}/>
              <SubStat label="Expired"  value={counts.expired}/>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '6px 20px 8px', background: 'var(--card)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(0,0,0,0.04)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '10px 14px',
        }}>
          <window.Icons.search size={18} style={{ color: 'var(--muted)' }}/>
          <input
            placeholder="Search by store name or ID…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              flex: 1, border: 0, outline: 'none', background: 'transparent',
              fontSize: 14, fontFamily: 'inherit', color: 'var(--ink)',
            }}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div style={{
        display: 'flex', gap: 8, padding: '4px 20px 12px',
        overflowX: 'auto', scrollbarWidth: 'none',
        background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
      }}>
        {[
          { id: 'all',      label: 'All' },
          { id: 'active',   label: 'Active' },
          { id: 'expired',  label: 'Expired' },
          { id: 'past_due', label: 'Past due' },
        ].map(c => (
          <window.Chip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>
            {c.label}{' '}
            <span style={{ opacity: 0.6, fontFamily: 'JetBrains Mono', marginLeft: 2 }}>{counts[c.id]}</span>
          </window.Chip>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 40px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 18, margin: '0 auto 14px',
              background: 'rgba(0,0,0,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <window.Icons.receipt size={26}/>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>No subscriptions</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Try a different filter or search.</div>
          </div>
        ) : filtered.map(s => <SubCard key={s.id} sub={s}/>)}
      </div>

      {createOpen && <CreateSubscriptionSheet onClose={() => setCreateOpen(false)}/>}
    </div>
  );
}

const SubStat = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 10, opacity: 0.8, fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
    <div style={{ marginTop: 2, fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 18 }}>{value}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Subscription card
// ─────────────────────────────────────────────────────────────
function SubCard({ sub }) {
  const meta = STATUS_META[sub.status];
  const isExpiringSoon = sub.status === 'active' && sub.daysLeft <= 14;
  const isPro = sub.plan === 'Pro';

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 18,
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {/* Top: name + status pill */}
      <div style={{
        padding: '14px 16px 12px',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 14, flexShrink: 0,
          background: isPro
            ? 'linear-gradient(135deg, #F59E0B22, #F59E0B0A)'
            : 'linear-gradient(135deg, rgba(110,86,247,0.12), rgba(110,86,247,0.04))',
          color: isPro ? '#B45309' : 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <window.Icons.store size={20}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{sub.store}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, fontFamily: 'JetBrains Mono', fontWeight: 600 }}>
            {sub.storeId}
          </div>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 9px', borderRadius: 999,
          fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
          color: meta.text, background: meta.bg, textTransform: 'uppercase',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.dot }}/>
          {meta.label}
        </div>
      </div>

      {/* Meta rows */}
      <div style={{
        background: 'rgba(0,0,0,0.025)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
      }}>
        <SubMetaRow
          label="Plan"
          value={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 9, fontWeight: 800, color: isPro ? '#B45309' : 'var(--accent)',
                background: isPro ? 'rgba(245,158,11,0.12)' : 'rgba(110,86,247,0.10)',
                padding: '2px 7px', borderRadius: 999, letterSpacing: '0.06em',
              }}>{isPro ? 'PRO' : 'BUSINESS'}</span>
              <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 12, color: 'var(--muted)' }}>
                ₦{sub.amt.toLocaleString()}/mo
              </span>
            </span>
          }
        />
        <SubMetaRow
          label="Expires"
          last
          value={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{sub.expires}</span>
              {sub.status === 'active' && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: isExpiringSoon ? '#B45309' : 'var(--muted)',
                  background: isExpiringSoon ? 'rgba(245,158,11,0.12)' : 'rgba(0,0,0,0.04)',
                  padding: '2px 6px', borderRadius: 6,
                  fontFamily: 'JetBrains Mono',
                }}>
                  {sub.daysLeft} days
                </span>
              )}
              {sub.status === 'past_due' && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#E11D6B',
                  background: 'rgba(225,29,107,0.12)',
                  padding: '2px 6px', borderRadius: 6, fontFamily: 'JetBrains Mono',
                }}>
                  {Math.abs(sub.daysLeft)} days overdue
                </span>
              )}
            </span>
          }
        />
      </div>

      {/* Actions */}
      <div style={{
        padding: '12px 16px',
        display: 'flex', gap: 10,
      }}>
        {sub.status === 'active' ? (
          <>
            <button style={subActionBtn('ghost')}>
              <window.Icons.refund size={14}/> Renew
            </button>
            <button style={subActionBtn('danger')}>
              Deactivate
            </button>
          </>
        ) : sub.status === 'past_due' ? (
          <>
            <button style={subActionBtn('primary')}>
              Collect payment
            </button>
            <button style={subActionBtn('ghost')}>
              <window.Icons.bell size={14}/> Remind
            </button>
          </>
        ) : (
          <>
            <button style={subActionBtn('primary')}>
              <window.Icons.refund size={14}/> Reactivate
            </button>
            <button style={subActionBtn('ghost')}>
              View history
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const SubMetaRow = ({ label, value, last }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '11px 0',
    borderBottom: last ? 'none' : '1px solid var(--border)',
  }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
  </div>
);

const subActionBtn = (variant) => {
  const base = {
    flex: 1, padding: '11px 12px', borderRadius: 12,
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    border: 0,
  };
  if (variant === 'primary') return { ...base, background: 'var(--accent)', color: 'var(--accent-fg)' };
  if (variant === 'danger')  return {
    ...base, background: 'transparent',
    border: '1px solid rgba(225,29,107,0.30)', color: '#E11D6B',
  };
  return {
    ...base, background: 'transparent',
    border: '1px solid var(--border)', color: 'var(--ink)',
  };
};

// ─────────────────────────────────────────────────────────────
// Create Subscription bottom sheet
// ─────────────────────────────────────────────────────────────
function CreateSubscriptionSheet({ onClose }) {
  const [storeId, setStoreId] = useSS('');
  const [plan, setPlan] = useSS('Business');
  const [duration, setDuration] = useSS('1');
  const [reason, setReason] = useSS('');

  const valid = storeId.trim().length > 0;
  const planMeta = plan === 'Pro'
    ? { tone: '#F59E0B', label: 'Pro',      price: 75000, includes: 'Unlimited branches · Priority support' }
    : { tone: '#6E56F7', label: 'Business', price: 25000, includes: 'Up to 3 branches · Standard support' };

  const total = planMeta.price * (parseInt(duration) || 1);

  return (
    <>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, zIndex: 200,
        background: 'rgba(14,14,16,0.55)',
        animation: 'fadeIn .25s ease',
      }}/>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: 'var(--bg)',
        borderRadius: '24px 24px 0 0',
        padding: '14px 0 0',
        animation: 'slideUp .3s cubic-bezier(.16,1,.3,1)',
        boxShadow: '0 -20px 60px -10px rgba(0,0,0,0.25)',
        maxHeight: '92%', display: 'flex', flexDirection: 'column',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }}/>
        </div>

        {/* Header */}
        <div style={{
          padding: '0 20px 16px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12,
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Create Subscription</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              Manually provision a paid plan for a store
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(0,0,0,0.06)', border: 0, cursor: 'pointer',
            color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><window.Icons.close size={16} strokeWidth={2.2}/></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 20px' }}>
          {/* Store ID */}
          <window.Field
            label="Store ID"
            required
            value={storeId}
            onChange={setStoreId}
            placeholder="e.g. store_014"
          />

          {/* Plan selector */}
          <div style={{ marginTop: 18 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10,
            }}>Plan</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <PlanOption
                active={plan === 'Business'} onClick={() => setPlan('Business')}
                name="Business" price="₦25,000" sub="per month"
                features={['3 branches', 'Standard support']}
                tone="#6E56F7"
              />
              <PlanOption
                active={plan === 'Pro'} onClick={() => setPlan('Pro')}
                name="Pro" price="₦75,000" sub="per month"
                features={['Unlimited branches', 'Priority support']}
                tone="#F59E0B"
              />
            </div>
          </div>

          {/* Duration */}
          <div style={{ marginTop: 18 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10,
            }}>Duration</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['1', '3', '6', '12'].map(d => (
                <button key={d} onClick={() => setDuration(d)} style={{
                  flex: 1, padding: '12px 4px', borderRadius: 12,
                  background: duration === d ? 'var(--accent)' : 'var(--card)',
                  color: duration === d ? 'var(--accent-fg)' : 'var(--ink)',
                  border: duration === d ? 'none' : '1px solid var(--border)',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 800 }}>{d}</span>
                  <span style={{ fontSize: 10, opacity: 0.75 }}>{d === '1' ? 'month' : 'months'}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div style={{ marginTop: 14 }}>
            <window.Field
              label="Reason (optional)"
              value={reason}
              onChange={setReason}
              multiline
              rows={3}
              placeholder="e.g. offline payment, special deal"
            />
          </div>

          {/* Summary card */}
          <div style={{
            marginTop: 18,
            background: `linear-gradient(135deg, ${planMeta.tone}10, ${planMeta.tone}04)`,
            border: `1px solid ${planMeta.tone}30`,
            borderRadius: 14, padding: 14,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: planMeta.tone }}>
              Total to provision
            </div>
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em' }}>
                <span style={{ opacity: 0.55 }}>₦</span>{total.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'JetBrains Mono' }}>
                {planMeta.label} × {duration} {parseInt(duration) === 1 ? 'mo' : 'mos'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          background: 'var(--card)',
          borderTop: '1px solid var(--border)',
          padding: '14px 20px 22px',
          display: 'flex', gap: 10,
        }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '14px', borderRadius: 14,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--ink)', fontWeight: 700, fontSize: 14,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button
            onClick={valid ? onClose : undefined}
            disabled={!valid}
            style={{
              flex: 1.8, padding: '14px', borderRadius: 14,
              background: valid ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'var(--border)',
              color: valid ? 'var(--accent-fg)' : 'var(--muted)',
              border: 0, fontWeight: 700, fontSize: 14,
              cursor: valid ? 'pointer' : 'default', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: valid ? '0 12px 24px -8px color-mix(in oklab, var(--accent) 70%, transparent)' : 'none',
            }}>
            <window.Icons.check size={16}/> Create subscription
          </button>
        </div>
      </div>
    </>
  );
}

const PlanOption = ({ active, onClick, name, price, sub, features, tone }) => (
  <button onClick={onClick} style={{
    background: active ? `linear-gradient(135deg, ${tone}14, ${tone}06)` : 'var(--card)',
    border: `1.5px solid ${active ? tone : 'var(--border)'}`,
    borderRadius: 16, padding: '14px 14px',
    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
    transition: 'all .15s ease',
    position: 'relative',
  }}>
    {active && (
      <div style={{
        position: 'absolute', top: 10, right: 10,
        width: 18, height: 18, borderRadius: '50%',
        background: tone, color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <window.Icons.check size={11} strokeWidth={3}/>
      </div>
    )}
    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{name}</div>
    <div style={{ marginTop: 4, fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 16, color: tone }}>
      {price}
    </div>
    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>
    <div style={{
      marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      {features.map(f => (
        <div key={f} style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 5, alignItems: 'center' }}>
          <window.Icons.check size={11} style={{ color: tone, flexShrink: 0 }} strokeWidth={2.4}/> {f}
        </div>
      ))}
    </div>
  </button>
);

window.SubscriptionsScreen = SubscriptionsScreen;
window.CreateSubscriptionSheet = CreateSubscriptionSheet;
