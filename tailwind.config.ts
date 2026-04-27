import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        pill: '999px',
      },
      colors: {
        brand: {
          bg: '#f8fafc',
          ink: '#0f172a',
          soft: '#e2e8f0',
          accent: '#2563eb',
        },
      },
      boxShadow: {
        btn: '0 3px 0 rgba(15, 23, 42, 0.18)',
      },
    },
  },
  plugins: [],
};

export default config;
