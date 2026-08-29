/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Semantic colours backed by the CSS custom properties in index.css.
      // Each name maps to one role, and the light/dark value swaps under
      // [data-theme]. They hold complete colour values, so Tailwind's opacity
      // modifier (bg-panel/50) does NOT work on them — add a token instead of
      // reaching for an alpha suffix.
      colors: {
        surface: 'var(--surface-base)',
        panel: 'var(--surface-panel)',
        raised: 'var(--surface-raised)',
        sunken: 'var(--surface-sunken)',
        input: 'var(--surface-input)',
        overlay: 'var(--surface-overlay)',
        header: 'var(--surface-header)',
        scrim: 'var(--scrim)',

        control: 'var(--control-bg)',
        'control-hover': 'var(--control-bg-hover)',

        fg: 'var(--text-primary)',
        'fg-secondary': 'var(--text-secondary)',
        'fg-muted': 'var(--text-muted)',
        'fg-subtle': 'var(--text-subtle)',
        'fg-faint': 'var(--text-faint)',

        primary: 'var(--primary-bg)',
        'primary-hover': 'var(--primary-bg-hover)',
        'primary-fg': 'var(--primary-fg)',

        line: 'var(--border-subtle)',
        'line-strong': 'var(--border-default)',
        'line-hover': 'var(--border-hover)',

        'ok-fg': 'var(--ok-fg)',
        'ok-fg-soft': 'var(--ok-fg-soft)',
        'ok-bg': 'var(--ok-bg)',
        'ok-bg-strong': 'var(--ok-bg-strong)',
        'ok-line': 'var(--ok-line)',
        'ok-line-strong': 'var(--ok-line-strong)',
        'ok-solid': 'var(--ok-solid)',

        'warn-fg': 'var(--warn-fg)',
        'warn-fg-soft': 'var(--warn-fg-soft)',
        'warn-bg': 'var(--warn-bg)',
        'warn-bg-strong': 'var(--warn-bg-strong)',
        'warn-line': 'var(--warn-line)',
        'warn-line-strong': 'var(--warn-line-strong)',
        'warn-solid': 'var(--warn-solid)',

        'danger-fg': 'var(--danger-fg)',
        'danger-bg': 'var(--danger-bg)',
        'danger-bg-strong': 'var(--danger-bg-strong)',
        'danger-line': 'var(--danger-line)',
        'danger-line-strong': 'var(--danger-line-strong)',
        'danger-solid': 'var(--danger-solid)',

        'meter-track': 'var(--meter-track)',
        'meter-peak': 'var(--meter-peak)',
        'spark': 'var(--spark-stroke)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.35s ease-out both',
      },
    },
  },
  plugins: [],
};
