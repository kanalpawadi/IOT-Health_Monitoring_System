/** @type {import('tailwindcss').Config} */

/**
 * Colours are declared as CSS custom properties holding "R G B" triples, so a
 * single `data-theme` attribute on <html> reskins the whole app without any
 * component knowing a theme exists.
 *
 * Two of these overrides are deliberate and worth understanding before editing:
 *
 *   white → --c-tint    Every `bg-white/[0.04]`, `border-white/10` and
 *                       `text-white` in the codebase is a *contrast* request,
 *                       not literally white. Binding white to the tint colour
 *                       makes those read as light-on-dark in the dark theme and
 *                       dark-on-cream in the light one, automatically.
 *
 *   slate-* → --c-t*    The slate ramp is used for text hierarchy. In the light
 *                       theme the ramp is inverted so slate-200 stays "most
 *                       prominent" and slate-600 stays "least".
 */
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      screens: {
        xs: '380px',
        '3xl': '1920px',
      },
      fontFamily: {
        // Claude-like pairing: a text serif for display, a warm grotesque for UI.
        display: ['"Source Serif 4"', 'Georgia', 'ui-serif', 'serif'],
        sans: ['"Hanken Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        white: withAlpha('--c-tint'),
        black: withAlpha('--c-shadow'),

        ink: {
          950: withAlpha('--c-ink-950'),
          900: withAlpha('--c-ink-900'),
          850: withAlpha('--c-ink-850'),
          800: withAlpha('--c-ink-800'),
          700: withAlpha('--c-ink-700'),
          600: withAlpha('--c-ink-600'),
        },

        slate: {
          200: withAlpha('--c-t200'),
          300: withAlpha('--c-t300'),
          400: withAlpha('--c-t400'),
          500: withAlpha('--c-t500'),
          600: withAlpha('--c-t600'),
          700: withAlpha('--c-t700'),
        },

        accent: withAlpha('--c-accent'),

        status: {
          normal: withAlpha('--c-status-normal'),
          warning: withAlpha('--c-status-warning'),
          critical: withAlpha('--c-status-critical'),
        },

        vital: {
          hr: withAlpha('--c-vital-hr'),
          spo2: withAlpha('--c-vital-spo2'),
          temp: withAlpha('--c-vital-temp'),
          move: withAlpha('--c-vital-move'),
        },
      },
      boxShadow: {
        glow: '0 0 40px -12px rgb(var(--c-accent) / 0.45)',
        card: 'var(--shadow-card)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        sweep: {
          '0%': { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
        drift: {
          '0%, 100%': { transform: 'translate(0,0) scale(1)' },
          '50%': { transform: 'translate(2%, -3%) scale(1.06)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 7s ease-in-out infinite',
        shimmer: 'shimmer 2s infinite',
        sweep: 'sweep 2.5s ease-out forwards',
        drift: 'drift 18s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
