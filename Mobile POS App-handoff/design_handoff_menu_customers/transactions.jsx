// Transactions list (modern banking-app style) + Receipt detail bottom sheet.

const { useState: useTS, useMemo: useTMemo } = React;

// ─────────────────────────────────────────────────────────────
// Fixture data
// ─────────────────────────────────────────────────────────────
const TRANSACTIONS = [
  { id: '9C781228', cashier: 'Admin',   method: 'Card',     items: [
      { name: 'Goldberg',       qty: 3, price: 1000  },
      { name: 'Smartphone Pro', qty: 3, price: 45000 },
    ], total: 146175, vat: 10175, ago: '20h ago', date: '15 May 2026 · 16:44', status: 'completed' },
  { id: 'A2B19044', cashier: 'Admin',   method: 'Cash',     items: [
      { name: 'Coca-Cola 50cl', qty: 3, price: 350 },
    ], total: 1075, vat: 25, ago: '23h ago', date: '15 May 2026 · 14:02', status: 'completed' },
  { id: 'D5F88123', cashier: 'Fidelis', method: 'Cash',     items: [
      { name: 'Heineken Bottle', qty: 2, price: 1500 },
      { name: 'Coca-Cola 50cl',  qty: 1, price: 457.5 },
    ], total: 3457.5, vat: 241.5, ago: '23h ago', date: '15 May 2026 · 13:18', status: 'completed' },
  { id: '8E2C9011', cashier: 'Admin',   method: 'Card',     items: [
      { name: 'Bluetooth Earbuds', qty: 1, price: 4057.5 },
    ], total: 4057.5, vat: 283, ago: '23h ago', date: '15 May 2026 · 12:55', status: 'completed' },
  { id: '7B41ACEF', cashier: 'Admin',   method: 'Transfer', items: [
      { name: 'Smartphone Pro', qty: 2, price: 45000 },
      { name: 'USB-C Charger',  qty: 1, price: 6500 },
    ], total: 102175, vat: 7125, ago: '1d ago', date: '14 May 2026 · 18:12', status: 'completed' },
  { id: '5A8D0F12', cashier: 'Admin',   method: 'Card',     items: [
      { name: 'Smartphone Pro', qty: 3, price: 45000 },
    ], total: 150175, vat: 10475, ago: '1d ago', date: '14 May 2026 · 16:30', status: 'completed' },
  { id: '4C12B3D9', cashier: 'Admin',   method: 'Card',     items: [
      { name: 'Goldberg',       qty: 6, price: 1000 },
      { name: 'Bluetooth Earbuds', qty: 5, price: 18500 },
    ], total: 101175, vat: 7050, ago: '1d ago', date: '14 May 2026 · 15:11', status: 'completed' },
  { id: '3F09E2A1', cashier: 'Lilian',  method: 'Card',     items: [
      { name: 'Smartphone Pro', qty: 1, price: 45000 },
      { name: 'USB-C Charger',  qty: 1, price: 6500 },
    ], total: 53100, vat: 1600, ago: '1d ago', date: '14 May 2026 · 12:47', status: 'completed' },
  { id: '2A6FB80C', cashier: 'Admin',   method: 'Card',     items: [
      { name: 'Smartphone Pro', qty: 2, price: 45000 },
      { name: 'Heineken Bottle', qty: 4, price: 1500 },
    ], total: 98100, vat: 6100, ago: '1d ago', date: '14 May 2026 · 11:22', status: 'completed' },
  { id: '1D7E5544', cashier: 'Admin',   method: 'Cash',     items: [
      { name: 'Smartphone Pro', qty: 4, price: 45000 },
    ], total: 188100, vat: 8100, ago: '1d ago', date: '14 May 2026 · 09:55', status: 'completed' },
  { id: '0B8C9923', cashier: 'Jay',     method: 'Card',     items: [
      { name: 'USB-C Charger',  qty: 1, price: 6500 },
    ], total: 6987, vat: 487, ago: '2d ago', date: '13 May 2026 · 18:30', status: 'refunded' },
];

window.TRANSACTIONS = TRANSACTIONS;

// ─────────────────────────────────────────────────────────────
// Transactions screen — full modal
// ─────────────────────────────────────────────────────────────
function TransactionsScreen({ onClose }) {
  const [status, setStatus] = useTS('all');     // all | completed | refunded
  const [period, setPeriod] = useTS('week');    // today | week
  const [query, setQuery]   = useTS('');
  const [openId, setOpenId] = useTS(null);

  const filtered = useTMemo(() => TRANSACTIONS.filter(t => {
    if (status !== 'all' && t.status !== status) return false;
    if (period === 'today' && !t.ago.endsWith('h ago')) return false;
    if (query && !(t.cashier.toLowerCase().includes(query.toLowerCase())
                || t.id.toLowerCase().includes(query.toLowerCase())
                || t.method.toLowerCase().includes(query.toLowerCase()))) return false;
    return true;
  }), [status, period, query]);

  const totalVal = filtered.reduce((s, t) => s + (t.status === 'refunded' ? -t.total : t.total), 0);

  const openTxn = filtered.find(t => t.id === openId) || TRANSACTIONS.find(t => t.id === openId);

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
            Transactions
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{filtered.length}</span> records
          </div>
        </div>
        <button style={window.iconBtn}><window.Icons.search size={20}/></button>
      </div>

      {/* Total bar */}
      <div style={{ padding: '8px 20px 14px', background: 'var(--card)' }}>
        <div style={{
          borderRadius: 18,
          background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
          color: 'var(--accent-fg)',
          padding: '16px 18px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', right: -30, top: -30,
            width: 130, height: 130, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
          }}/>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', opacity: 0.8, textTransform: 'uppercase' }}>
                Net {period === 'today' ? 'today' : 'this week'}
              </div>
              <div style={{ marginTop: 4, fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em' }}>
                <span style={{ opacity: 0.7 }}>₦</span>{Math.abs(totalVal).toLocaleString('en-NG', { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Avg sale</div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 15 }}>
                <span style={{ opacity: 0.7 }}>₦</span>{filtered.length ? Math.round(Math.abs(totalVal) / filtered.length).toLocaleString() : 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{
        display: 'flex', gap: 8, padding: '4px 20px 14px', overflowX: 'auto',
        scrollbarWidth: 'none', background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
      }}>
        <window.Chip active={status === 'all'} onClick={() => setStatus('all')}>All</window.Chip>
        <window.Chip active={status === 'completed'} onClick={() => setStatus('completed')}>Completed</window.Chip>
        <window.Chip active={status === 'refunded'} onClick={() => setStatus('refunded')}>Refunded</window.Chip>
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '4px 4px' }}/>
        <window.Chip active={period === 'today'} onClick={() => setPeriod('today')}>Today</window.Chip>
        <window.Chip active={period === 'week'} onClick={() => setPeriod('week')}>Week</window.Chip>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 40px' }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: '60px 40px', textAlign: 'center', color: 'var(--muted)',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 18, margin: '0 auto 14px',
              background: 'rgba(0,0,0,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)',
            }}>
              <window.Icons.receipt size={26}/>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>No transactions yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Try a different filter.</div>
          </div>
        ) : (
          filtered.map((t, i) => (
            <TxnRow key={t.id} t={t} last={i === filtered.length - 1}
              onClick={() => setOpenId(t.id)}/>
          ))
        )}
      </div>

      {/* Receipt sheet */}
      {openTxn && (
        <ReceiptSheet txn={openTxn} onClose={() => setOpenId(null)}/>
      )}
    </div>
  );
}

const TxnRow = ({ t, onClick, last }) => {
  const isRefund = t.status === 'refunded';
  return (
    <button onClick={onClick} style={{
      width: '100%', background: 'transparent', border: 0,
      borderBottom: last ? 'none' : '1px solid var(--border)',
      padding: '14px 20px', cursor: 'pointer', textAlign: 'left',
      display: 'flex', alignItems: 'center', gap: 14,
      fontFamily: 'inherit',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 14, flexShrink: 0,
        background: isRefund ? 'rgba(251,113,133,0.12)' : 'rgba(16,185,129,0.12)',
        color: isRefund ? '#E11D6B' : '#0F8A5B',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isRefund
          ? <window.Icons.refund size={20}/>
          : <window.Icons.arrowUpRight size={20} strokeWidth={2}/>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{t.cashier}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          {t.method} · {t.items.length} {t.items.length === 1 ? 'item' : 'items'} · {t.ago}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 14,
          color: isRefund ? '#E11D6B' : 'var(--ink)',
        }}>
          {isRefund ? '−' : '+'}<span style={{ opacity: 0.55 }}>₦</span>{t.total.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
        </div>
        <div style={{
          marginTop: 4, display: 'inline-block',
          fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
          padding: '2px 7px', borderRadius: 999,
          color: isRefund ? '#E11D6B' : '#0F8A5B',
          background: isRefund ? 'rgba(225,29,107,0.10)' : 'rgba(16,185,129,0.12)',
        }}>
          {t.status.toUpperCase()}
        </div>
      </div>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
// Receipt sheet
// ─────────────────────────────────────────────────────────────
function ReceiptSheet({ txn, onClose }) {
  const subtotal = txn.items.reduce((s, i) => s + i.qty * i.price, 0);
  const isRefund = txn.status === 'refunded';

  const methodIcon = {
    Cash:     <window.Icons.banknote size={16}/>,
    Card:     <window.Icons.card size={16}/>,
    Transfer: <window.Icons.transfer size={16}/>,
  }[txn.method];

  return (
    <>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, zIndex: 99,
        background: 'rgba(14,14,16,0.55)',
        backdropFilter: 'blur(2px)',
        animation: 'fadeIn .25s ease',
      }}/>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--bg)',
        borderRadius: '24px 24px 0 0',
        padding: '14px 20px 22px',
        maxHeight: '85%', overflowY: 'auto',
        animation: 'slideUp .3s cubic-bezier(.16,1,.3,1)',
        boxShadow: '0 -20px 60px -10px rgba(0,0,0,0.25)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }}/>
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, marginBottom: 18,
        }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Receipt</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, fontFamily: 'JetBrains Mono', fontWeight: 600 }}>
              #{txn.id}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(0,0,0,0.06)', border: 0, cursor: 'pointer',
            color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><window.Icons.close size={16} strokeWidth={2.2}/></button>
        </div>

        {/* Hero amount */}
        <div style={{
          padding: '20px 18px',
          borderRadius: 20,
          background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
          color: 'var(--accent-fg)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', right: -30, top: -30,
            width: 130, height: 130, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
          }}/>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', opacity: 0.8, textTransform: 'uppercase' }}>
              {isRefund ? 'Refunded' : 'Total paid'}
            </div>
            <div style={{ marginTop: 6, fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 36, letterSpacing: '-0.03em' }}>
              {isRefund && <span>−</span>}<span style={{ opacity: 0.7 }}>₦</span>{txn.total.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
            </div>
            <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.22)',
              padding: '4px 10px', borderRadius: 999,
              fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }}/>
              {txn.status.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Meta */}
        <div style={{
          marginTop: 14,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '4px 14px',
        }}>
          <MetaRow label="Date"    value={txn.date}/>
          <MetaRow label="Cashier" value={txn.cashier}
            valueLeft={<window.Avatar letter={txn.cashier[0]} color="#6E56F7" size={20}/>}/>
          <MetaRow label="Method"  value={txn.method} valueLeft={methodIcon}/>
          <MetaRow label="ID"      value={`#${txn.id}`} mono last/>
        </div>

        {/* Items */}
        <div style={{
          marginTop: 14, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--muted)',
        }}>
          Items <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700 }}>· {txn.items.length}</span>
        </div>
        <div style={{
          marginTop: 8,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 16, padding: '4px 14px',
        }}>
          {txn.items.map((it, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 0',
              borderBottom: i < txn.items.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{it.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, fontFamily: 'JetBrains Mono' }}>
                  ×{it.qty} @ ₦{it.price.toLocaleString()}
                </div>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 14 }}>
                <span style={{ opacity: 0.55 }}>₦</span>{(it.qty * it.price).toLocaleString('en-NG', { maximumFractionDigits: 0 })}
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ marginTop: 14, padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <TotalRow label="Subtotal" value={subtotal}/>
          <TotalRow label="VAT (7.5%)" value={txn.vat}/>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }}/>
          <TotalRow label="Total" value={txn.total} big/>
        </div>

        {/* Actions */}
        <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
          <button style={{
            flex: 1, padding: '14px', borderRadius: 16,
            background: 'rgba(110,86,247,0.10)',
            border: '1px solid rgba(110,86,247,0.22)',
            color: 'var(--accent)',
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <window.Icons.arrowUpRight size={16} strokeWidth={2.2}/> Share
          </button>
          <button disabled={isRefund} style={{
            flex: 1.2, padding: '14px', borderRadius: 16,
            background: isRefund ? 'var(--border)' : 'linear-gradient(135deg, #FB7185, #E11D6B)',
            color: isRefund ? 'var(--muted)' : '#fff',
            border: 0, fontSize: 14, fontWeight: 700,
            cursor: isRefund ? 'default' : 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: isRefund ? 'none' : '0 12px 24px -8px rgba(251,113,133,0.6)',
          }}>
            <window.Icons.refund size={16} strokeWidth={2}/> {isRefund ? 'Refunded' : 'Process Refund'}
          </button>
        </div>
      </div>
    </>
  );
}

const MetaRow = ({ label, value, valueLeft, mono, last }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '11px 0',
    borderBottom: last ? 'none' : '1px solid var(--border)',
  }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', minWidth: 72 }}>{label}</div>
    <div style={{
      flex: 1, textAlign: 'right',
      fontSize: 13, fontWeight: 700, color: 'var(--ink)',
      fontFamily: mono ? 'JetBrains Mono' : 'inherit',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
    }}>
      {valueLeft}{value}
    </div>
  </div>
);

const TotalRow = ({ label, value, big }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  }}>
    <div style={{
      fontSize: big ? 14 : 12,
      fontWeight: big ? 800 : 600,
      color: big ? 'var(--ink)' : 'var(--muted)',
      letterSpacing: big ? '0.02em' : 0,
      textTransform: big ? 'uppercase' : 'none',
    }}>{label}</div>
    <div style={{
      fontFamily: 'JetBrains Mono', fontWeight: big ? 800 : 700,
      fontSize: big ? 22 : 13,
      color: 'var(--ink)',
    }}>
      <span style={{ opacity: 0.55 }}>₦</span>{value.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
    </div>
  </div>
);

Object.assign(window, { TransactionsScreen, ReceiptSheet });
