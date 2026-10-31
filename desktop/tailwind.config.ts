import type { Config } from 'tailwindcss';

/*
 * JayPOS design tokens (handoff §7). Core shadcn colors come from CSS variables
 * (app/globals.css) so components/ui/* inherit the theme. The extended brand +
 * semantic palette is declared here as raw hex, used by bespoke markup.
 */
const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' }
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: '#5A43E8',
          active: '#4F3BD9',
          ink: '#3D2EC4',
          soft: '#F1EEFF',
          ring: '#E9E4FE',
          border: '#B9AEFB'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        /* Extended brand/semantic palette (raw hex, §7) */
        surface: { DEFAULT: '#FFFFFF', subtle: '#FAF9FD' },
        divider: '#EFEEF4',
        'border-strong': '#E1DFEA',
        ink: { DEFAULT: '#0E0E10', 2: '#1D1B26' },
        text: { DEFAULT: '#4A4858', muted: '#77758A', faint: '#9A98AB' },
        success: { DEFAULT: '#11734F', soft: '#E6F5EE' },
        warning: { DEFAULT: '#94570A', soft: '#FFF2DB' },
        danger: { DEFAULT: '#B42334', soft: '#FCE9EB', border: '#F3C5CB' }
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      fontSize: {
        /* §7 type scale (px → rem-ish). Tailwind defaults still available. */
        '2xs': ['11px', { lineHeight: '1.3' }],
        xs: ['12px', { lineHeight: '1.4' }],
        sm: ['13px', { lineHeight: '1.45' }],
        base: ['13.5px', { lineHeight: '1.5' }],
        md: ['14.5px', { lineHeight: '1.5' }],
        lg: ['16px', { lineHeight: '1.4' }],
        xl: ['18px', { lineHeight: '1.3' }],
        '2xl': ['20px', { lineHeight: '1.25' }],
        '3xl': ['22px', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        kpi: ['26px', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        total: ['36px', { lineHeight: '1.05', letterSpacing: '-0.02em' }]
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        chip: '6px',
        seg: '10px',
        card: '12px',
        modal: '14px'
      },
      boxShadow: {
        focus: '0 0 0 3px #E9E4FE',
        'card-hover': '0 16px 40px rgba(30,20,90,.14)',
        drawer: '-12px 0 40px rgba(20,16,60,.18)',
        modal: '0 24px 60px rgba(20,16,60,.3)',
        segment: '0 1px 2px rgba(20,16,60,.14)'
      },
      transitionDuration: { 180: '180ms' }
    }
  },
  plugins: []
};

export default config;
