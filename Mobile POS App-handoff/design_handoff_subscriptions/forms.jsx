// New Product (full-screen sheet) + New Category (bottom sheet).
// Both rendered conditionally over the phone shell.

const { useState: useFS } = React;

// ─────────────────────────────────────────────────────────────
// Shared field components
// ─────────────────────────────────────────────────────────────
const Field = ({ label, value, onChange, type = 'text', required, placeholder, suffix, prefix, multiline, rows = 3 }) => {
  const [focused, setFocused] = useFS(false);
  const float = focused || (value != null && String(value).length > 0);
  const InputTag = multiline ? 'textarea' : 'input';
  return (
    <div style={{
      position: 'relative',
      background: 'var(--card)',
      border: `1.5px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 14,
      padding: multiline ? '14px 14px 10px' : '14px 14px',
      transition: 'border-color .15s ease',
    }}>
      <label style={{
        position: 'absolute',
        left: prefix ? 28 : 14,
        top: float ? 6 : (multiline ? 14 : '50%'),
        transform: float ? 'translateY(0)' : (multiline ? 'translateY(0)' : 'translateY(-50%)'),
        fontSize: float ? 10 : 14,
        fontWeight: float ? 700 : 500,
        color: focused ? 'var(--accent)' : 'var(--muted)',
        letterSpacing: float ? '0.06em' : 0,
        textTransform: float ? 'uppercase' : 'none',
        pointerEvents: 'none',
        transition: 'all .15s ease',
        fontFamily: 'inherit',
      }}>
        {label}{required && <span style={{ color: '#E11D6B', marginLeft: 2 }}>*</span>}
      </label>
      {prefix && (
        <span style={{
          position: 'absolute', left: 14, top: float ? '60%' : '50%', transform: 'translateY(-50%)',
          fontSize: 14, fontWeight: 600, color: 'var(--muted)',
          fontFamily: 'JetBrains Mono',
        }}>{prefix}</span>
      )}
      <InputTag
        type={multiline ? undefined : type}
        rows={multiline ? rows : undefined}
        value={value}
        placeholder={focused ? placeholder : ''}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          border: 0, outline: 'none', background: 'transparent', resize: 'none',
          fontSize: 14, fontFamily: 'inherit', color: 'var(--ink)',
          fontWeight: 600,
          paddingLeft: prefix ? 14 : 0,
          paddingTop: float ? (multiline ? 12 : 12) : 0,
          paddingRight: suffix ? 36 : 0,
          transition: 'padding-top .15s ease',
          minHeight: multiline ? rows * 18 : 'auto',
          lineHeight: multiline ? 1.4 : 'normal',
        }}
      />
      {suffix && (
        <span style={{
          position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
          fontSize: 12, fontWeight: 700, color: 'var(--muted)',
          fontFamily: 'JetBrains Mono', letterSpacing: '0.04em',
        }}>{suffix}</span>
      )}
    </div>
  );
};

const SelectField = ({ label, value, onChange, options, required }) => {
  const [open, setOpen] = useFS(false);
  const current = options.find(o => o.value === value);
  const has = !!current;
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', textAlign: 'left',
        background: 'var(--card)',
        border: `1.5px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 14,
        padding: '14px 14px',
        cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative',
      }}>
        <span style={{
          position: 'absolute',
          left: 14,
          top: has ? 6 : '50%',
          transform: has ? 'translateY(0)' : 'translateY(-50%)',
          fontSize: has ? 10 : 14,
          fontWeight: has ? 700 : 500,
          color: open ? 'var(--accent)' : 'var(--muted)',
          letterSpacing: has ? '0.06em' : 0,
          textTransform: has ? 'uppercase' : 'none',
          transition: 'all .15s',
        }}>
          {label}{required && <span style={{ color: '#E11D6B', marginLeft: 2 }}>*</span>}
        </span>
        <span style={{
          fontSize: 14, fontWeight: 600, color: 'var(--ink)',
          paddingTop: has ? 12 : 0,
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          {current && current.dot && (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: current.dot }}/>
          )}
          {current ? current.label : ''}
        </span>
        <window.Icons.chevronDown size={16}
          style={{ color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}/>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{
            position: 'fixed', inset: 0, zIndex: 4,
          }}/>
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: '0 18px 40px -10px rgba(0,0,0,0.18)',
            padding: 4, zIndex: 5,
            maxHeight: 220, overflowY: 'auto',
          }}>
            {options.map(o => (
              <button key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '10px 12px', borderRadius: 10,
                  background: value === o.value ? 'rgba(110,86,247,0.08)' : 'transparent',
                  border: 0, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 13, fontWeight: 600,
                  color: value === o.value ? 'var(--accent)' : 'var(--ink)',
                  textAlign: 'left',
                }}>
                {o.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.dot }}/>}
                <span style={{ flex: 1 }}>{o.label}</span>
                {value === o.value && <window.Icons.check size={14}/>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const ContextChip = ({ icon, label, accentColor }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: 'rgba(110,86,247,0.08)',
    border: '1px solid rgba(110,86,247,0.16)',
    color: 'var(--accent)',
    padding: '8px 12px', borderRadius: 12,
    fontSize: 12, fontWeight: 600,
  }}>
    {icon} {label}
  </div>
);

// ─────────────────────────────────────────────────────────────
// NEW PRODUCT — full-screen sheet
// ─────────────────────────────────────────────────────────────
function NewProductSheet({ onClose, branch = 'Tudunfulani Branch' }) {
  const [name, setName] = useFS('');
  const [sku, setSku] = useFS('');
  const [sell, setSell] = useFS('');
  const [cost, setCost] = useFS('');
  const [disc, setDisc] = useFS('');
  const [vat, setVat] = useFS('7.5');
  const [stock, setStock] = useFS('');
  const [alert, setAlert] = useFS('10');
  const [cat, setCat] = useFS('');
  const [desc, setDesc] = useFS('');

  const valid = name.trim() && sku.trim() && sell;

  const cats = [
    { value: 'electronics', label: 'Electronics',     dot: '#6E56F7' },
    { value: 'alcoholic',   label: 'Alcoholic Drinks', dot: '#F59E0B' },
    { value: 'soft',        label: 'Soft Drinks',      dot: '#10B981' },
    { value: 'snacks',      label: 'Snacks',           dot: '#FB7185' },
  ];

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
      }}>
        <button onClick={onClose} style={window.iconBtn}><window.Icons.close size={20}/></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' }}>New Product</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Add to catalog</div>
        </div>
        <button style={{
          padding: '8px 14px', borderRadius: 12,
          background: 'transparent', border: '1px solid var(--border)',
          color: 'var(--muted)', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>Save draft</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 140px' }}>
        {/* Branch context */}
        <div style={{ marginBottom: 16 }}>
          <ContextChip
            icon={<window.Icons.branch size={14}/>}
            label={<>Creating for <span style={{ fontWeight: 800 }}>{branch}</span></>}
          />
        </div>

        {/* Identity */}
        <SectionLabel>Identity</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Product name" required value={name} onChange={setName}/>
          <Field label="SKU" required value={sku} onChange={setSku} placeholder="e.g. ELC-002"/>
        </div>

        {/* Pricing */}
        <SectionLabel>Pricing</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Selling price" required value={sell} onChange={setSell} type="number" prefix="₦"/>
          <Field label="Cost price" value={cost} onChange={setCost} type="number" prefix="₦"/>
          <Field label="Discount price" value={disc} onChange={setDisc} type="number" prefix="₦"/>
          <Field label="VAT" value={vat} onChange={setVat} type="number" suffix="%"/>
        </div>

        {/* Margin preview */}
        {sell && cost && (
          <div style={{
            marginTop: 10,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.18)',
            borderRadius: 12, padding: '10px 12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0F8A5B', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Gross margin
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0F8A5B', fontFamily: 'JetBrains Mono' }}>
              {sell > 0 ? Math.round(((+sell - +cost) / +sell) * 100) : 0}%
              <span style={{ opacity: 0.7, marginLeft: 6 }}>· ₦{(+sell - +cost).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Stock */}
        <SectionLabel>Stock</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Initial qty" value={stock} onChange={setStock} type="number" suffix="units"/>
          <Field label="Low-stock alert" value={alert} onChange={setAlert} type="number" suffix="units"/>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <window.Icons.bell size={12} style={{ flexShrink: 0, marginTop: 2 }}/>
          You'll be notified when stock drops below the alert threshold. Defaults to your store-wide rule.
        </div>

        {/* Categorize */}
        <SectionLabel>Categorize</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SelectField label="Category" required value={cat} onChange={setCat} options={cats}/>
          <Field label="Description" multiline rows={3} value={desc} onChange={setDesc}/>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
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
            flex: 2, padding: '14px', borderRadius: 14,
            background: valid ? 'var(--accent)' : 'var(--border)',
            color: valid ? 'var(--accent-fg)' : 'var(--muted)',
            border: 0, fontWeight: 700, fontSize: 14,
            cursor: valid ? 'pointer' : 'default', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: valid ? `0 10px 24px -8px var(--accent)` : 'none',
          }}>
          <window.Icons.check size={18}/> Save product
        </button>
      </div>
    </div>
  );
}

const SectionLabel = ({ children }) => (
  <div style={{
    fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: 'var(--muted)',
    margin: '20px 0 10px',
  }}>{children}</div>
);

// ─────────────────────────────────────────────────────────────
// NEW CATEGORY — bottom sheet (half-height)
// ─────────────────────────────────────────────────────────────
function NewCategorySheet({ onClose, branch = 'Tudunfulani Branch' }) {
  const [name, setName] = useFS('');
  const [desc, setDesc] = useFS('');
  const [color, setColor] = useFS('#6E56F7');

  const colors = ['#6E56F7', '#10B981', '#F59E0B', '#FB7185', '#3B82F6', '#1A1A22'];
  const valid = name.trim().length > 0;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, zIndex: 99,
        background: 'rgba(14,14,16,0.5)',
        backdropFilter: 'blur(2px)',
        animation: 'fadeIn .25s ease',
      }}/>
      {/* Sheet */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--bg)',
        borderRadius: '24px 24px 0 0',
        padding: '14px 20px 24px',
        animation: 'slideUp .3s cubic-bezier(.16,1,.3,1)',
        boxShadow: '0 -20px 60px -10px rgba(0,0,0,0.25)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }}/>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>New Category</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Group products together
            </div>
          </div>
          <button onClick={onClose} style={window.iconBtn}><window.Icons.close size={20}/></button>
        </div>

        {/* Context */}
        <div style={{ marginBottom: 14 }}>
          <ContextChip
            icon={<window.Icons.branch size={14}/>}
            label={<>For <span style={{ fontWeight: 800 }}>{branch}</span></>}
          />
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Category name" required value={name} onChange={setName}/>
          <Field label="Description (optional)" value={desc} onChange={setDesc}/>
        </div>

        {/* Color picker */}
        <div style={{ marginTop: 14 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8,
          }}>Color tag</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {colors.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width: 36, height: 36, borderRadius: 12, cursor: 'pointer',
                background: c, border: 0, padding: 0,
                position: 'relative',
                outline: color === c ? `2.5px solid var(--ink)` : 'none',
                outlineOffset: 2,
                transition: 'transform .15s',
                transform: color === c ? 'scale(1.05)' : 'scale(1)',
              }}>
                {color === c && (
                  <window.Icons.check size={16} style={{ color: '#fff' }}/>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div style={{
          marginTop: 18,
          padding: '12px 14px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: color + '20', color: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 16,
          }}>{(name[0] || '?').toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {name || 'Category preview'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {desc || '0 products'}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '13px', borderRadius: 14,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--ink)', fontWeight: 700, fontSize: 14,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button
            onClick={valid ? onClose : undefined}
            disabled={!valid}
            style={{
              flex: 1.4, padding: '13px', borderRadius: 14,
              background: valid ? 'var(--accent)' : 'var(--border)',
              color: valid ? 'var(--accent-fg)' : 'var(--muted)',
              border: 0, fontWeight: 700, fontSize: 14,
              cursor: valid ? 'pointer' : 'default', fontFamily: 'inherit',
              boxShadow: valid ? `0 10px 24px -8px var(--accent)` : 'none',
            }}>Create</button>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { NewProductSheet, NewCategorySheet });
