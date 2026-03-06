/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f172a',
        card: '#1e293b',
        card2: '#273549',
        border: '#334155',
        muted: '#94a3b8',
        accent: '#3b82f6',
        'accent-hover': '#2563eb',
      },
      fontFamily: {
        sans: ['-apple-system', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeSlideUp 0.22s cubic-bezier(.2,0,0,1)',
        'modal-in': 'modalIn 0.25s cubic-bezier(0,0,.2,1)',
        'pulse-slow': 'pulse 1.2s ease-in-out infinite',
        shimmer: 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeSlideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        modalIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
