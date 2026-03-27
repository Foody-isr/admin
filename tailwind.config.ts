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
      },
      backgroundColor: {
        page: 'var(--bg)',
      },
    },
  },
  plugins: [],
};
