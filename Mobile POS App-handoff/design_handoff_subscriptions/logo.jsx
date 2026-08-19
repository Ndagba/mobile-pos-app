// JayPOS brand: <Logo> mark + <Wordmark> + <Lockup> (mark + wordmark stacked).
//
// Mark design rationale:
//   - Rounded squircle (~rx 22 on 80×80) — sits comfortably as an app icon.
//   - Diagonal indigo gradient — depth, modern fintech feel.
//   - Bold white "J" — instantly readable, brand-anchoring.
//   - Subtle top-edge highlight — references the gloss on a payment card.
//   - Small accent pip in the upper-right — doubles as a transaction "ping"
//     and breaks the symmetry just enough to feel hand-tuned, not generated.

const Logo = ({ size = 56, accent, fg = '#FFFFFF', cart = true }) => {
  const id = 'jaypos-grad-' + size + '-' + Math.round(Math.random() * 9999);
  const start = (accent && accent[0]) || '#6E56F7';
  const end   = (accent && accent[1]) || '#3D2EC4';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      style={{ display: 'block', filter: `drop-shadow(0 ${size*0.12}px ${size*0.25}px ${start}55)` }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={start}/>
          <stop offset="1" stopColor={end}/>
        </linearGradient>
        <linearGradient id={id + '-gloss'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0"   stopColor="#FFFFFF" stopOpacity="0.28"/>
          <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="22" fill={`url(#${id})`}/>
      <rect width="80" height="80" rx="22" fill={`url(#${id}-gloss)`}/>

      {/* Background cart watermark — sits behind the letters */}
      {cart && (
        <g transform="translate(11 11) scale(2.55)" opacity="0.22">
          <path
            d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6"
            stroke={fg} fill="none"
            strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ strokeWidth: 2.4 }}
          />
          <circle cx="9"  cy="20" r="1.4" fill={fg}/>
          <circle cx="18" cy="20" r="1.4" fill={fg}/>
        </g>
      )}

      {/* JP letters — foreground */}
      <text
        x="40" y="54"
        textAnchor="middle"
        fontSize="34"
        fontWeight="800"
        fill={fg}
        fontFamily='"Plus Jakarta Sans", system-ui, sans-serif'
        style={{ letterSpacing: '-0.05em' }}
      >JP</text>
    </svg>
  );
};

const Wordmark = ({ size = 28, color = 'var(--ink)', accent = 'var(--accent)' }) => (
  <span style={{
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    fontWeight: 800,
    fontSize: size,
    letterSpacing: '-0.03em',
    color,
    display: 'inline-flex',
    alignItems: 'baseline',
  }}>
    <span>Jay</span>
    <span style={{ color: accent }}>POS</span>
  </span>
);

const Lockup = ({ markSize = 48, wordSize = 22, gap = 12, color, accent, pip = true }) => (
  <div style={{
    display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap,
  }}>
    <Logo size={markSize} accent={accent && [accent[0], accent[1]]} pip={pip}/>
    <Wordmark size={wordSize} color={color}/>
  </div>
);

Object.assign(window, { Logo, Wordmark, Lockup });
