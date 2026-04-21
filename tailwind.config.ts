/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#F18A47', // Foody primary orange (matches foodypos)
          600: '#E07A3A',
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
