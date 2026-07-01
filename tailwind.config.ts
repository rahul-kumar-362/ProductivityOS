import type { Config } from 'tailwindcss';

/** map a CSS var of raw RGB channels to an alpha-aware color */
const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['selector', "[data-theme='dark']"],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        surface: {
          DEFAULT: c('surface'),
          elevated: c('surface-elevated'),
          hover: c('surface-hover'),
        },
        border: { DEFAULT: c('border'), strong: c('border-strong') },
        primary: { DEFAULT: c('primary'), hover: c('primary-hover'), fg: c('primary-fg') },
        accent: c('accent'),
        success: c('success'),
        warning: c('warning'),
        danger: c('danger'),
        text: { primary: c('text-primary'), secondary: c('text-secondary'), muted: c('text-muted') },
        focus: c('focus-ring'),
        overlay: c('overlay'),
      },
      borderColor: { DEFAULT: c('border') },
      ringColor: { DEFAULT: c('focus-ring') },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      spacing: { '4.5': '1.125rem', '13': '3.25rem' },
      fontFamily: {
        sans: ['Inter var', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        display: ['2rem', { lineHeight: '2.5rem', fontWeight: '600' }],
        h1: ['1.5rem', { lineHeight: '2rem', fontWeight: '600' }],
        h2: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        h3: ['1rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        h4: ['0.875rem', { lineHeight: '1.25rem', fontWeight: '600' }],
        body: ['0.875rem', { lineHeight: '1.375rem' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.25rem' }],
        caption: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
        mono: ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '500' }],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        focus: 'var(--shadow-focus)',
      },
      transitionTimingFunction: { out: 'var(--ease-out)', 'in-out': 'var(--ease-in-out)' },
      transitionDuration: { fast: '120ms', base: '180ms', slow: '260ms' },
    },
  },
  plugins: [],
} satisfies Config;
