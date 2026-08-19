// Customers screen — modern banking contact-list pattern.
// Hero with totals + filter chips + alphabetical contact list + FAB.

const { useState: useCS, useMemo: useCMemo } = React;

const CUSTOMERS = [
  { id: 'c1',  name: 'Aisha Bello',         phone: '+234 803 211 0042', spend: 248500, txns: 14, last: '2d ago',  tag: 'VIP',     tone: '#6E56F7' },
  { id: 'c2',  name: 'Adamu Yusuf',         phone: '+234 802 882 7104', spend: 86200,  txns: 9,  last: 'Today',   tag: null,      tone: '#10B981' },
  { id: 'c3',  name: 'Blessing Okoro',      phone: '+234 805 419 6622', spend: 168900, txns: 12, last: 'Yesterday', tag: 'VIP',  tone: '#FB7185' },
  { id: 'c4',  name: 'Chinedu Okafor',      phone: '+234 706 220 1188', spend: 42500,  txns: 5,  last: '3d ago',  tag: null,      tone: '#F59E0B' },
  { id: 'c5',  name: 'Daniel Ojo',          phone: '+234 814 002 5530', spend: 192300, txns: 11, last: '1d ago',  tag: 'VIP',     tone: '#6E56F7' },
  { id: 'c6',  name: 'Fatima Ibrahim',      phone: '+234 808 765 3210', spend: 31200,  txns: 4,  last: '4d ago',  tag: null,      tone: '#10B981' },
  { id: 'c7',  name: 'Grace Adekunle',      phone: '+234 812 994 7711', spend: 64750,  txns: 7,  last: '1w ago',  tag: null,      tone: '#FB7185' },
  { id: 'c8',  name: 'Halima Sani',         phone: '+234 909 543 2098', spend: 14100,  txns: 2,  last: '2w ago',  tag: 'New',     tone: '#F59E0B' },
  { id: 'c9',  name: 'Ibrahim Musa',        phone: '+234 803 444 1122', spend: 0,      txns: 0,  last: '—',       tag: 'New',     tone: '#1A1A22' },
  { id: 'c10', name: 'Joy Nwankwo',         phone: '+234 802 110 5566', spend: 88450,  txns: 8,  last: 'Today',   tag: null,      tone: '#6E56F7' },
  { id: 'c11', name: 'Kemi Adeyemi',        phone: '+234 805 776 9988', spend: 215600, txns: 13, last: '5d ago',  tag: 'VIP',     tone: '#10B981' },
  { id: 'c12', name: 'Lilian Eze',          phone: '+234 818 332 0044', spend: 12600,  txns: 3,  last: '6d ago',  tag: null,      tone: '#FB7185' },
];

window.CUSTOMERS = CUSTOMERS;

function CustomersScreen() {
  const [filter, setFilter] = useCS('all'); // all | vip | new
  const [query, setQuery] = useCS('');
  const [openId, setOpenId] = useCS(null);

  const filtered = useCMemo(() => {
    return CUSTOMERS.filter(c => {
      if (filter === 'vip' && c.tag !== 'VIP') return false;
      if (filter === 'new' && c.tag !== 'New') return false;
      if (query && !c.name.toLowerCase().includes(query.toLowerCase())
                && !c.phone.includes(query)) return false;
      return true;
    });
  }, [filter, query]);

  // Group alphabetically
  const groups = useCMemo(() => {
    const m = {};
    filtered.forEach(c => {
      const k = c.name[0].toUpperCase();
      (m[k] = m[k] || []).push(c);
    });
    return Object.keys(m).sort().map(k => ({ k, items: m[k] }));
  }, [filtered]);

  const totalSpend = filtered.reduce((s, c) => s + c.spend, 0);
  const vipCount = CUSTOMERS.filter(c => c.tag === 'VIP').length;

  const openCustomer = CUSTOMERS.find(c => c.id === openId);

  return (
    <div style={{ paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ padding: '8px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Customers</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>Directory</div>
        </div>
        <button style={window.iconBtn}><window.Icons.search size={20}/></button>
      </div>

      {/* Hero summary */}
      <div style={{ padding: '0 20px' }}>
        <div style={{
          borderRadius: 20,
          background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
          color: 'var(--accent-fg)',
          padding: '18px 18px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', right: -30, top: -30,
            width: 140, height: 140, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
          }}/>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', opacity: 0.8, textTransform: 'uppercase' }}>
              All customers
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 32, letterSpacing: '-0.02em' }}>
                {CUSTOMERS.length}
              </div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>contacts</div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 18 }}>
              <Stat label="VIP" value={vipCount}/>
              <Divider/>
              <Stat label="Active 30d" value={CUSTOMERS.filter(c => c.txns > 0).length}/>
              <Divider/>
              <Stat label="Lifetime"
                value={<><span style={{ opacity: 0.7 }}>₦</span>{(CUSTOMERS.reduce((s,c)=>s+c.spend,0)/1000).toFixed(0)}K</>}/>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '14px 20px 8px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '10px 14px',
        }}>
          <window.Icons.search size={18} style={{ color: 'var(--muted)' }}/>
          <input
            placeholder="Search by name or phone"
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
        display: 'flex', gap: 8, padding: '4px 20px 10px',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        <window.Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          All <span style={{ opacity: 0.6, fontFamily: 'JetBrains Mono', marginLeft: 2 }}>{CUSTOMERS.length}</span>
        </window.Chip>
        <window.Chip active={filter === 'vip'} onClick={() => setFilter('vip')}>
          ⭐ VIP <span style={{ opacity: 0.6, fontFamily: 'JetBrains Mono', marginLeft: 2 }}>{CUSTOMERS.filter(c => c.tag === 'VIP').length}</span>
        </window.Chip>
        <window.Chip active={filter === 'new'} onClick={() => setFilter('new')}>
          New <span style={{ opacity: 0.6, fontFamily: 'JetBrains Mono', marginLeft: 2 }}>{CUSTOMERS.filter(c => c.tag === 'New').length}</span>
        </window.Chip>
      </div>

      {/* Alphabetical groups */}
      <div style={{ padding: '0 20px' }}>
        {groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>No matches</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Try a different search or filter.</div>
          </div>
        ) : groups.map(g => (
          <div key={g.k} style={{ marginTop: 14 }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
              color: 'var(--muted)', padding: '0 6px 8px',
            }}>{g.k}</div>
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 16, padding: 4,
            }}>
              {g.items.map((c, i) => (
                <CustomerRow key={c.id} c={c} last={i === g.items.length - 1}
                  onClick={() => setOpenId(c.id)}/>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* FAB */}
      <div style={{ position: 'absolute', bottom: 102, right: 20 }}>
        <button style={{
          padding: '14px 18px', borderRadius: 999,
          background: 'var(--ink)', color: 'var(--bg)', border: 0,
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
          fontFamily: 'inherit',
        }}>
          <window.Icons.plus size={18}/> New customer
        </button>
      </div>

      {openCustomer && <CustomerSheet c={openCustomer} onClose={() => setOpenId(null)}/>}
    </div>
  );
}

const Stat = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 10, opacity: 0.75, fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
    <div style={{ marginTop: 2, fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 16 }}>{value}</div>
  </div>
);

const Divider = () => (
  <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.18)' }}/>
);

const CustomerRow = ({ c, onClick, last }) => (
  <button onClick={onClick} style={{
    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 10px', background: 'transparent',
    border: 0, borderBottom: last ? 'none' : '1px solid var(--border)',
    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
  }}>
    <window.Avatar letter={c.name[0]} color={c.tone} size={40}/>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</div>
        {c.tag === 'VIP' && (
          <span style={{
            fontSize: 9, fontWeight: 800, color: '#B45309',
            background: 'rgba(245,158,11,0.16)', padding: '2px 6px', borderRadius: 999,
            letterSpacing: '0.06em',
          }}>VIP</span>
        )}
        {c.tag === 'New' && (
          <span style={{
            fontSize: 9, fontWeight: 800, color: '#0F8A5B',
            background: 'rgba(16,185,129,0.14)', padding: '2px 6px', borderRadius: 999,
            letterSpacing: '0.06em',
          }}>NEW</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, fontFamily: 'JetBrains Mono' }}>
        {c.phone}
      </div>
    </div>
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 13 }}>
        <span style={{ opacity: 0.55 }}>₦</span>{c.spend.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{c.txns} txns · {c.last}</div>
    </div>
  </button>
);

// Quick customer details sheet
function CustomerSheet({ c, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, zIndex: 99,
        background: 'rgba(14,14,16,0.55)',
        animation: 'fadeIn .25s ease',
      }}/>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--bg)',
        borderRadius: '24px 24px 0 0',
        padding: '14px 20px 24px',
        animation: 'slideUp .3s cubic-bezier(.16,1,.3,1)',
        boxShadow: '0 -20px 60px -10px rgba(0,0,0,0.25)',
        maxHeight: '80%', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }}/>
        </div>

        {/* Hero */}
        <div style={{
          padding: '18px',
          borderRadius: 20,
          background: `linear-gradient(135deg, ${c.tone}, ${c.tone}88)`,
          color: '#fff',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 20,
              background: 'rgba(255,255,255,0.22)',
              border: '2px solid rgba(255,255,255,0.28)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 24,
            }}>{c.name[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>{c.name}</div>
              <div style={{ fontSize: 12, opacity: 0.9, fontFamily: 'JetBrains Mono', marginTop: 2 }}>{c.phone}</div>
            </div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10, opacity: 0.8, letterSpacing: '0.08em', fontWeight: 700 }}>LIFETIME</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 22, marginTop: 2 }}>
                <span style={{ opacity: 0.7 }}>₦</span>{c.spend.toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, opacity: 0.8, letterSpacing: '0.08em', fontWeight: 700 }}>VISITS</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 22, marginTop: 2 }}>{c.txns}</div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {[
            { i: <window.Icons.plus size={18}/>,  l: 'New sale' },
            { i: <window.Icons.receipt size={18}/>, l: 'History' },
            { i: <window.Icons.edit size={18}/>,  l: 'Edit' },
          ].map(a => (
            <button key={a.l} style={{
              padding: '12px 8px', borderRadius: 14,
              background: 'var(--card)', border: '1px solid var(--border)',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 700, color: 'var(--ink)',
            }}>
              <span style={{ color: 'var(--accent)' }}>{a.i}</span>{a.l}
            </button>
          ))}
        </div>

        {/* Close */}
        <button onClick={onClose} style={{
          marginTop: 16, width: '100%', padding: '12px', borderRadius: 14,
          background: 'transparent', border: '1px solid var(--border)',
          fontWeight: 700, fontSize: 13, cursor: 'pointer',
          color: 'var(--ink)', fontFamily: 'inherit',
        }}>Close</button>
      </div>
    </>
  );
}

window.CustomersScreen = CustomersScreen;
