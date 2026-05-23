// Remaining screens: Checkout (modal sheet), Inventory, Analytics, Settings
const { useState: useState2, useMemo: useMemo2 } = React;

// ─────────────────────────────────────────────────────────────
// 2) CHECKOUT — modal full-screen sheet, slides up from FAB
// ─────────────────────────────────────────────────────────────
function CheckoutScreen({ onClose }) {
  const [branch, setBranch] = useState2('all');
  const [branchOpen, setBranchOpen] = useState2(false);
  const [query, setQuery] = useState2('');
  const [cart, setCart] = useState2({}); // { productId: qty }
  const [pay, setPay] = useState2('cash');
  const [expanded, setExpanded] = useState2(false);

  const products = window.PRODUCTS.filter(p =>
    !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.toLowerCase().includes(query.toLowerCase())
  );

  const addToCart = (id) => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const removeFromCart = (id) => setCart(c => {
    const next = { ...c, [id]: (c[id] || 0) - 1 };
    if (next[id] <= 0) delete next[id];
    return next;
  });

  const cartItems = Object.entries(cart).map(([id, qty]) => ({
    ...window.PRODUCTS.find(p => p.id === id), qty,
  }));
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const vat = Math.round(subtotal * 0.075);
  const total = subtotal + vat;
  const itemCount = cartItems.reduce((s, i) => s + i.qty, 0);

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', zIndex: 100,
      animation: 'slideUp .3s cubic-bezier(.16,1,.3,1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px 14px', display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--card)', borderBottom: '1px solid var(--border)',
        position: 'relative', zIndex: 10,
      }}>
        <button onClick={onClose} style={window.iconBtn}><Icons.close size={20}/></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.1 }}>New Sale</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
            <span>·</span>
            <button
              onClick={() => setBranchOpen(o => !o)}
              style={{
                background: 'rgba(110,86,247,0.08)', border: 0,
                color: 'var(--accent)', fontFamily: 'inherit', cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                padding: '3px 8px', borderRadius: 999,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              {window.BRANCHES.find(b => b.id === branch).label}
              <Icons.chevronDown size={12} strokeWidth={2.4}
                style={{ transform: branchOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}/>
            </button>
          </div>
          {/* Branch dropdown */}
          {branchOpen && (
            <>
              <div onClick={() => setBranchOpen(false)} style={{
                position: 'fixed', inset: 0, zIndex: 9,
              }}/>
              <div style={{
                position: 'absolute', top: '100%', left: 60, marginTop: -2,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                boxShadow: '0 18px 40px -10px rgba(0,0,0,0.18)',
                minWidth: 180, padding: 4, zIndex: 11,
              }}>
                {window.BRANCHES.map(b => (
                  <button key={b.id}
                    onClick={() => { setBranch(b.id); setBranchOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', padding: '10px 12px', borderRadius: 10,
                      background: branch === b.id ? 'rgba(110,86,247,0.08)' : 'transparent',
                      border: 0, cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 13, fontWeight: 600,
                      color: branch === b.id ? 'var(--accent)' : 'var(--ink)',
                      textAlign: 'left',
                    }}>
                    <span style={{ color: branch === b.id ? 'var(--accent)' : 'var(--muted)' }}>{b.icon}</span>
                    <span style={{ flex: 1 }}>{b.label}</span>
                    {branch === b.id && <Icons.check size={14}/>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button style={window.iconBtn}><Icons.qr size={20}/></button>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 20px 8px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '10px 14px',
        }}>
          <Icons.search size={18} style={{ color: 'var(--muted)' }}/>
          <input
            placeholder="Search by name or SKU"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              flex: 1, border: 0, outline: 'none', background: 'transparent',
              fontSize: 14, fontFamily: 'inherit', color: 'var(--ink)',
            }}
          />
        </div>
      </div>

      {/* Products grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: `4px 20px ${itemCount ? 180 : 120}px` }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 4px 10px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            {products.length} products
          </div>
          <button style={{
            background: 'transparent', border: 0, color: 'var(--muted)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit',
          }}>
            <Icons.filter size={12}/> All
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {products.map(p => {
            const qty = cart[p.id] || 0;
            return (
              <div key={p.id} style={{
                background: 'var(--card)', borderRadius: 14,
                border: `1px solid ${qty > 0 ? p.tone + '55' : 'var(--border)'}`,
                padding: 12, position: 'relative', overflow: 'hidden',
                transition: 'border-color .15s ease',
              }}>
                {/* category color edge */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                  background: p.tone, opacity: 0.85,
                }}/>
                {/* top row: category + low badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 6, minHeight: 14 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: p.tone,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    flex: 1,
                  }}>{p.cat}</span>
                  {p.stock <= 10 && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: '#FB7185',
                      background: 'rgba(251,113,133,0.10)', padding: '1px 5px', borderRadius: 4,
                    }}>LOW</span>
                  )}
                </div>
                {/* name */}
                <div style={{
                  fontSize: 13, fontWeight: 700, marginLeft: 6, marginTop: 4,
                  lineHeight: 1.25, height: 32, overflow: 'hidden',
                }}>{p.name}</div>
                {/* price + add */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginLeft: 6, marginTop: 8,
                }}>
                  <Money n={p.price} size={14} weight={800}/>
                  {qty === 0 ? (
                    <button onClick={() => addToCart(p.id)} style={{
                      width: 28, height: 28, borderRadius: 9,
                      background: 'var(--accent)', color: 'var(--accent-fg)',
                      border: 0, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}><Icons.plus size={15} strokeWidth={2.4}/></button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => removeFromCart(p.id)} style={qtyBtn}>
                        <Icons.minus size={13}/>
                      </button>
                      <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 13, minWidth: 14, textAlign: 'center' }}>{qty}</span>
                      <button onClick={() => addToCart(p.id)} style={qtyBtn}>
                        <Icons.plus size={13}/>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom cart drawer */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'var(--card)',
        borderTop: '1px solid var(--border)',
        borderRadius: '24px 24px 0 0',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.06)',
        padding: '14px 20px 22px',
        transition: 'all .25s cubic-bezier(.16,1,.3,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }}/>
        </div>

        {expanded && cartItems.length > 0 && (
          <div style={{
            maxHeight: 200, overflowY: 'auto', marginBottom: 12,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {cartItems.map(it => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar letter={it.letter} color={it.tone} size={32}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{it.qty} × ₦{it.price.toLocaleString()}</div>
                </div>
                <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 13 }}>
                  ₦{(it.price * it.qty).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}

        <div onClick={() => itemCount > 0 && setExpanded(!expanded)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12, cursor: itemCount > 0 ? 'pointer' : 'default',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12,
              background: 'rgba(110,86,247,0.12)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icons.cart size={18}/>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {itemCount === 0 ? 'Cart empty' : `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {itemCount === 0 ? 'Tap a product to add' : `VAT ₦${vat.toLocaleString()}`}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Money n={total} weight={800} size={22}/>
            {itemCount > 0 && (
              <Icons.chevronDown size={18}
                style={{ color: 'var(--muted)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}/>
            )}
          </div>
        </div>

        {/* Payment methods */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
          {[
            { id: 'cash', label: 'Cash', icon: <Icons.banknote size={16}/> },
            { id: 'card', label: 'Card', icon: <Icons.card size={16}/> },
            { id: 'transfer', label: 'Transfer', icon: <Icons.transfer size={16}/> },
          ].map(m => (
            <button key={m.id} onClick={() => setPay(m.id)} style={{
              padding: '10px 8px', borderRadius: 12,
              border: `1px solid ${pay === m.id ? 'var(--accent)' : 'var(--border)'}`,
              background: pay === m.id ? 'rgba(110,86,247,0.08)' : 'transparent',
              color: pay === m.id ? 'var(--accent)' : 'var(--ink)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        <button disabled={itemCount === 0} style={{
          width: '100%', padding: '15px 0', borderRadius: 16,
          background: itemCount === 0 ? 'var(--border)' : 'var(--accent)',
          color: itemCount === 0 ? 'var(--muted)' : 'var(--accent-fg)',
          border: 0, fontSize: 15, fontWeight: 700, cursor: itemCount === 0 ? 'default' : 'pointer',
          fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Icons.check size={18}/> Charge <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700 }}>₦{total.toLocaleString()}</span>
        </button>
      </div>
    </div>
  );
}

const qtyBtn = {
  width: 26, height: 26, borderRadius: 8,
  background: 'rgba(110,86,247,0.10)', color: 'var(--accent)',
  border: 0, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

// ─────────────────────────────────────────────────────────────
// 3) INVENTORY
// ─────────────────────────────────────────────────────────────
function InventoryScreen() {
  const [tab, setTab] = useState2('products');
  const [branch, setBranch] = useState2('bosso');
  const [sheet, setSheet] = useState2(null); // 'product' | 'category' | null

  const branchLabel = window.BRANCHES.find(b => b.id === branch)?.label || 'All Branches';

  return (
    <div style={{ paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ padding: '8px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Inventory</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>Catalog</div>
        </div>
        <button style={window.iconBtn}><Icons.search size={20}/></button>
      </div>

      {/* Segmented tabs (banking-style) */}
      <div style={{ padding: '0 20px' }}>
        <div style={{
          display: 'flex', background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 4, gap: 2,
        }}>
          {[
            { id: 'products', label: 'Products', count: 6 },
            { id: 'categories', label: 'Categories', count: 4 },
            { id: 'low', label: 'Low stock', count: 3 },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 10,
              background: tab === t.id ? 'var(--accent)' : 'transparent',
              color: tab === t.id ? 'var(--accent-fg)' : 'var(--ink)',
              border: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              transition: 'all .15s ease',
            }}>
              {t.label}
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 999,
                background: tab === t.id ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.06)',
                fontWeight: 700, fontFamily: 'JetBrains Mono',
              }}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Branch filter */}
      <div style={{
        display: 'flex', gap: 8, padding: '14px 20px 4px', overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {window.BRANCHES.map(b => (
          <Chip key={b.id} active={branch === b.id} onClick={() => setBranch(b.id)} icon={b.icon}>
            {b.label}
          </Chip>
        ))}
      </div>

      {/* Total bar */}
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{
          background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)',
          padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Stock value
            </div>
            <Money n={2148500} weight={800} size={24}/>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 36, color: 'var(--accent)' }}>
            <Sparkbars data={[42, 38, 50, 46, 58, 52, 64]} height={36}/>
          </div>
        </div>
      </div>

      {/* Content based on tab */}
      {tab === 'products' && (
        <>
          <SectionHeader label={`${window.PRODUCTS.length} products`} action="Sort"/>
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {window.PRODUCTS.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)',
                padding: 12,
              }}>
                <Avatar letter={p.letter} color={p.tone} size={44}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.name}
                    </div>
                    {p.stock <= 10 && <Pill color="#E11D6B" bg="rgba(225,29,107,0.10)">Low</Pill>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {p.cat} · SKU {p.sku}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Money n={p.price} size={14} weight={700}/>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, fontFamily: 'JetBrains Mono' }}>
                    {p.stock} in stock
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'categories' && (
        <>
          <SectionHeader label={`${window.CATEGORIES.length} categories`}/>
          <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {window.CATEGORIES.map(c => (
              <div key={c.name} style={{
                background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)',
                padding: 14, position: 'relative',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: c.tone + '20', color: c.tone,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 18, marginBottom: 10,
                }}>{c.letter}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{c.count}</span> products
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'low' && (
        <>
          <SectionHeader label="Needs reorder"/>
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {window.PRODUCTS.filter(p => p.stock <= 10).map(p => (
              <div key={p.id} style={{
                background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)',
                padding: 14, display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <Avatar letter={p.letter} color={p.tone} size={44}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.cat}</div>
                  {/* stock bar */}
                  <div style={{
                    marginTop: 8, height: 5, borderRadius: 999, background: 'rgba(0,0,0,0.06)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${Math.min(100, (p.stock / 20) * 100)}%`,
                      height: '100%',
                      background: p.stock <= 5 ? '#FB7185' : '#F59E0B',
                    }}/>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 18, color: p.stock <= 5 ? '#FB7185' : '#F59E0B' }}>{p.stock}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>left</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Floating add btn */}
      <div style={{ position: 'absolute', bottom: 102, right: 20 }}>
        <button
          onClick={() => setSheet(tab === 'categories' ? 'category' : 'product')}
          style={{
            padding: '14px 18px', borderRadius: 999,
            background: 'var(--ink)', color: 'var(--bg)', border: 0,
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
            fontFamily: 'inherit',
          }}>
          <Icons.plus size={18}/> New {tab === 'categories' ? 'category' : 'product'}
        </button>
      </div>

      {/* Sheets */}
      {sheet === 'product' && (
        <window.NewProductSheet onClose={() => setSheet(null)} branch={branchLabel}/>
      )}
      {sheet === 'category' && (
        <window.NewCategorySheet onClose={() => setSheet(null)} branch={branchLabel}/>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 4) ANALYTICS
// ─────────────────────────────────────────────────────────────
function AnalyticsScreen() {
  const [period, setPeriod] = useState2('week');
  const [view, setView] = useState2('overview');
  const data = period === 'today'
    ? [12, 18, 26, 22, 38, 44, 52, 48, 60, 56, 71]
    : period === 'week'
    ? [82, 94, 71, 110, 102, 124, 98]
    : [240, 280, 220, 310, 340, 300, 360, 380, 410, 390, 430, 460];

  const dataLabels = period === 'today'
    ? ['8a','','10a','','12p','','2p','','4p','','6p']
    : period === 'week'
    ? ['M','T','W','T','F','S','S']
    : ['1','3','5','7','9','11','13','15','17','19','21','23'];

  const total = data.reduce((s, v) => s + v, 0) * 1000;
  const peak = Math.max(...data);

  return (
    <div style={{ paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ padding: '8px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Analytics · Fri 15 May</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>Performance</div>
        </div>
        <button style={window.iconBtn}><Icons.download size={20}/></button>
      </div>

      {/* Period selector */}
      <div style={{ padding: '0 20px' }}>
        <div style={{
          display: 'flex', background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 4, gap: 2,
        }}>
          {[
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'This week' },
            { id: 'month', label: 'This month' },
          ].map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 10,
              background: period === p.id ? 'var(--ink)' : 'transparent',
              color: period === p.id ? 'var(--bg)' : 'var(--muted)',
              border: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all .15s ease',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* Hero chart card */}
      <div style={{ padding: '16px 20px 0' }}>
        <Card pad={18}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>
                Revenue
              </div>
              <div style={{ marginTop: 4 }}>
                <Money n={total} big size={32} weight={800}/>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <Pill color="#0F8A5B" bg="rgba(16,185,129,0.12)">↗ +18.4%</Pill>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>vs last period</span>
              </div>
            </div>
            <button style={{
              padding: '6px 10px', borderRadius: 10,
              background: 'rgba(0,0,0,0.04)', border: 0,
              fontSize: 12, fontWeight: 600, color: 'var(--ink)',
              display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
              <Icons.store size={13}/> All branches <Icons.chevronDown size={13}/>
            </button>
          </div>

          {/* Bar chart */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 130 }}>
              {data.map((v, i) => {
                const isPeak = v === peak;
                return (
                  <div key={i} style={{
                    flex: 1, position: 'relative',
                    height: `${(v / peak) * 100}%`,
                    background: isPeak ? 'var(--accent)' : 'rgba(110,86,247,0.18)',
                    borderRadius: '8px 8px 4px 4px',
                    minHeight: 8,
                  }}>
                    {isPeak && (
                      <div style={{
                        position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
                        background: 'var(--ink)', color: 'var(--bg)',
                        padding: '2px 6px', borderRadius: 6,
                        fontSize: 10, fontWeight: 700, fontFamily: 'JetBrains Mono',
                        whiteSpace: 'nowrap',
                      }}>₦{(v).toLocaleString()}K</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {dataLabels.map((l, i) => (
                <div key={i} style={{ flex: 1, fontSize: 10, color: 'var(--muted)', textAlign: 'center', fontWeight: 600 }}>{l}</div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* View toggle (Overview / Products / Staff) */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { id: 'overview', label: 'Overview', icon: <Icons.chart size={14}/> },
            { id: 'products', label: 'Products', icon: <Icons.box size={14}/> },
            { id: 'staff', label: 'Staff', icon: <Icons.users size={14}/> },
          ].map(v => (
            <Chip key={v.id} active={view === v.id} onClick={() => setView(v.id)} icon={v.icon}>
              {v.label}
            </Chip>
          ))}
        </div>
      </div>

      {view === 'overview' && (
        <>
          {/* KPI tiles */}
          <div style={{ padding: '14px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <KpiTile icon={<Icons.banknote size={18}/>} tone="#10B981" label="Total profit"
              value={<Money n={368940} weight={800} size={20}/>} sub="100.0% margin"/>
            <KpiTile icon={<Icons.receipt size={18}/>} tone="#6E56F7" label="Transactions"
              value={<span style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 20 }}>431</span>}
              sub="↗ +14% vs last"/>
            <KpiTile icon={<Icons.trending size={18}/>} tone="#F59E0B" label="Avg ticket"
              value={<Money n={1882} weight={800} size={20}/>} sub="per sale"/>
            <KpiTile icon={<Icons.box size={18}/>} tone="#FB7185" label="Items sold"
              value={<span style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 20 }}>892</span>}
              sub="units"/>
          </div>
        </>
      )}

      {view === 'products' && (
        <>
          <SectionHeader label="Top products"/>
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {window.PRODUCTS.slice(0, 5).map((p, i) => {
              const sales = [124, 96, 78, 64, 42][i];
              const pct = (sales / 124) * 100;
              return (
                <div key={p.id} style={{
                  background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)',
                  padding: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: 'rgba(0,0,0,0.04)', fontFamily: 'JetBrains Mono',
                      fontWeight: 800, fontSize: 12, color: 'var(--muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{i + 1}</div>
                    <Avatar letter={p.letter} color={p.tone} size={36}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sales} sold</div>
                    </div>
                    <Money n={p.price * sales} size={14} weight={700}/>
                  </div>
                  <div style={{ marginTop: 10, height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: p.tone }}/>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === 'staff' && (
        <>
          <SectionHeader label="Top performers"/>
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {window.STAFF.map((s, i) => {
              const rev = [128400, 96200, 71500][i];
              return (
                <div key={s.name} style={{
                  background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)',
                  padding: 14, display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <Avatar letter={s.letter} color={s.tone} size={44}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>{s.role} · {s.txns} txns</div>
                  </div>
                  <Money n={rev} size={14} weight={700}/>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 5) SETTINGS
// ─────────────────────────────────────────────────────────────
function SettingsScreen({ onLogout }) {
  const [notif, setNotif] = useState2(true);
  const [bio, setBio] = useState2(true);
  const [auto, setAuto] = useState2(false);

  return (
    <div style={{ paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ padding: '8px 20px 16px' }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Settings</div>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>Account</div>
      </div>

      {/* Profile hero */}
      <div style={{ padding: '0 20px' }}>
        <div style={{
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
          color: 'var(--accent-fg)',
          borderRadius: 24, padding: 20,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', right: -30, bottom: -30,
            width: 140, height: 140, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
          }}/>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 60, height: 60, borderRadius: 20,
              background: 'rgba(255,255,255,0.18)',
              border: '2px solid rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 26,
            }}>A</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>Admin User</div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>admin@store.com</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                  background: 'rgba(255,255,255,0.18)', padding: '3px 8px', borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.22)',
                }}>OWNER</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                  background: 'rgba(255,255,255,0.18)', padding: '3px 8px', borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.22)',
                }}>STORE_001</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ padding: '14px 20px 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { l: 'Staff', v: '3', i: <Icons.users size={16}/>, t: '#6E56F7' },
          { l: 'Branches', v: '2', i: <Icons.branch size={16}/>, t: '#F59E0B' },
          { l: 'Devices', v: '4', i: <Icons.qr size={16}/>, t: '#10B981' },
        ].map(s => (
          <div key={s.l} style={{
            background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)',
            padding: '12px 10px', textAlign: 'center',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: s.t + '1A', color: s.t,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 6px',
            }}>{s.i}</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 20 }}>{s.v}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Staff list */}
      <SectionHeader label="Staff" action="Manage"/>
      <div style={{ padding: '0 20px' }}>
        <Card pad={6}>
          {window.STAFF.map((s, i) => (
            <div key={s.name} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px',
              borderBottom: i < window.STAFF.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <Avatar letter={s.letter} color={s.tone} size={40}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</div>
                  {s.isYou && <Pill>you</Pill>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.sub}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <Pill color={
                    s.role === 'admin' ? '#E11D6B' :
                    s.role === 'manager' ? '#B45309' : '#0F8A5B'
                  } bg={
                    s.role === 'admin' ? 'rgba(225,29,107,0.10)' :
                    s.role === 'manager' ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)'
                  }>{s.role}</Pill>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{s.txns}</span> txns
                  </span>
                </div>
              </div>
              <Icons.chevronRight size={18} style={{ color: 'var(--muted)' }}/>
            </div>
          ))}
        </Card>
      </div>

      {/* Preferences */}
      <SectionHeader label="Preferences"/>
      <div style={{ padding: '0 20px' }}>
        <Card pad={4}>
          <ToggleRow icon={<Icons.bell size={18}/>} tone="#6E56F7" label="Push notifications"
            sub="Sales, refunds, low stock alerts" value={notif} onChange={setNotif}/>
          <ToggleRow icon={<Icons.shield size={18}/>} tone="#10B981" label="Biometric login"
            sub="Unlock with Face ID / fingerprint" value={bio} onChange={setBio}/>
          <ToggleRow icon={<Icons.download size={18}/>} tone="#F59E0B" label="Auto-sync reports"
            sub="Daily email summary at 9 PM" value={auto} onChange={setAuto} last/>
        </Card>
      </div>

      <div style={{ padding: '20px 20px 0' }}>
        <button onClick={onLogout} style={{
          width: '100%', padding: '14px', borderRadius: 14,
          background: 'transparent', color: '#E11D6B', border: '1px solid rgba(225,29,107,0.3)',
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontFamily: 'inherit',
        }}>
          <Icons.logout size={18}/> Log out
        </button>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--muted)' }}>
          JayPOS v2.4.1 · build 2026.05.15
        </div>
      </div>
    </div>
  );
}

const ToggleRow = ({ icon, tone, label, sub, value, onChange, last }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px',
    borderBottom: last ? 'none' : '1px solid var(--border)',
  }}>
    <div style={{
      width: 36, height: 36, borderRadius: 10,
      background: tone + '1A', color: tone,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{icon}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div>
    </div>
    <button onClick={() => onChange(!value)} style={{
      width: 42, height: 24, borderRadius: 999,
      background: value ? 'var(--accent)' : 'rgba(0,0,0,0.12)',
      border: 0, padding: 2, cursor: 'pointer',
      transition: 'background .2s',
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transform: value ? 'translateX(18px)' : 'translateX(0)',
        transition: 'transform .2s',
      }}/>
    </button>
  </div>
);

Object.assign(window, {
  CheckoutScreen, InventoryScreen, AnalyticsScreen, SettingsScreen,
});
