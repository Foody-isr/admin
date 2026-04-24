/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Tailwind default orange ramp (matches Figma Make palette exactly).
        // orange-500 = #f97316, orange-600 = #ea580c.
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        status: {
          pending: '#F18A47',
          accepted: '#60A5FA',
          inKitchen: '#D89B35',
          ready: '#77BA4B',
          rejected: '#F73838',
          served: '#34D399',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          subtle: 'var(--surface-subtle)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        fg: {
          DEFAULT: 'var(--fg)',
          muted: 'var(--fg-muted)',
          subtle: 'var(--fg-subtle)',
        },
        success: { DEFAULT: 'var(--success-500)', 50: 'var(--success-50)' },
        warning: { DEFAULT: 'var(--warning-500)', 50: 'var(--warning-50)' },
        danger: { DEFAULT: 'var(--danger-500)', 50: 'var(--danger-50)' },
        info: { DEFAULT: 'var(--info-500)', 50: 'var(--info-50)' },
        cat: {
          1: 'var(--cat-1)', 2: 'var(--cat-2)', 3: 'var(--cat-3)', 4: 'var(--cat-4)',
          5: 'var(--cat-5)', 6: 'var(--cat-6)', 7: 'var(--cat-7)', 8: 'var(--cat-8)',
        },
        divider: 'var(--divider)',
        'fg-primary': 'var(--text-primary)',
        'fg-secondary': 'var(--text-secondary)',
        sidebar: {
          bg: 'var(--sidebar-bg)',
          active: 'var(--sidebar-active)',
          hover: 'var(--sidebar-hover)',
        },
        topbar: {
          DEFAULT: 'var(--topbar-bg)',
          fg: 'var(--topbar-fg)',
        },
        // shadcn/ui tokens — use `/alpha` modifiers by including <alpha-value>
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
      },
      spacing: {
        micro: '6px',
        xsmall: '10px',
        small: '14px',
        medium: '20px',
        large: '28px',
        xlarge: '36px',
        // Foody design-token spacing (4pt grid) — alongside Tailwind's 1..16 scale
        's-1': 'var(--s-1)',
        's-2': 'var(--s-2)',
        's-3': 'var(--s-3)',
        's-4': 'var(--s-4)',
        's-5': 'var(--s-5)',
        's-6': 'var(--s-6)',
        's-8': 'var(--s-8)',
        's-10': 'var(--s-10)',
        's-12': 'var(--s-12)',
        's-16': 'var(--s-16)',
      },
      borderRadius: {
        standard: '8px',
        card: '8px',
        chip: '8px',
        modal: '16px',
        // shadcn radius scale
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // Foody design-token radii — 'r-*' prefix to avoid clashing with Tailwind's sm/md/lg
        'r-xs': 'var(--r-xs)',
        'r-sm': 'var(--r-sm)',
        'r-md': 'var(--r-md)',
        'r-lg': 'var(--r-lg)',
        'r-xl': 'var(--r-xl)',
        'r-full': 'var(--r-full)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
      },
      fontSize: {
        // Foody design-token sizes — 'fs-*' prefix to avoid clashing with Tailwind's xs/sm/base
        'fs-micro': ['11px', { lineHeight: 'var(--lh-snug)' }],
        'fs-xs':    ['12px', { lineHeight: 'var(--lh-snug)' }],
        'fs-sm':    ['13px', { lineHeight: 'var(--lh-base)' }],
        'fs-md':    ['14px', { lineHeight: 'var(--lh-base)' }],
        'fs-lg':    ['16px', { lineHeight: 'var(--lh-base)' }],
        'fs-xl':    ['18px', { lineHeight: 'var(--lh-snug)' }],
        'fs-2xl':   ['22px', { lineHeight: 'var(--lh-snug)' }],
        'fs-3xl':   ['28px', { lineHeight: 'var(--lh-tight)', letterSpacing: '-0.02em' }],
        'fs-4xl':   ['36px', { lineHeight: 'var(--lh-tight)', letterSpacing: '-0.02em' }],
        'fs-5xl':   ['48px', { lineHeight: 'var(--lh-tight)', letterSpacing: '-0.02em' }],
      },
      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        3: 'var(--shadow-3)',
        ring: 'var(--focus-ring)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
      backgroundColor: {
        page: 'var(--bg)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
