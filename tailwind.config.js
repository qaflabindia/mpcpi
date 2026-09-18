/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./extension/panel/**/*.{html,js}', './extension/options/**/*.{html,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        brand: { 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2' },
      },
    },
  },
  plugins: [],
};
