import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f7f7f8',
          dark: '#212121',
          'dark-secondary': '#171717',
        },
        accent: {
          DEFAULT: '#10a37f',
          hover: '#0d8c6d',
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.4s infinite ease-in-out both',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 80%, 100%': { opacity: '0.3', transform: 'scale(0.8)' },
          '40%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [typography],
};
