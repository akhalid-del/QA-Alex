/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dae6ff',
          200: '#bcd0ff',
          500: '#3b6fe0',
          600: '#2f59c4',
          700: '#274aa3',
          800: '#213f8a',
          900: '#1b3273',
        },
        // Soft steel-blue base; fine grain layered on top via .app-canvas.
        canvas: '#e4eaf5',
        paper: '#ffffff',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        // Brand-tinted so white cards feel lifted off the light body.
        soft: '0 1px 2px rgba(27,50,115,0.05), 0 6px 16px -8px rgba(27,50,115,0.12)',
        lift: '0 12px 28px -10px rgba(27,50,115,0.22), 0 2px 6px rgba(27,50,115,0.07)',
      },
      keyframes: {
        'pop-in': {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '60%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'fade-up': {
          '0%': { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        confetti: {
          '0%': { transform: 'translateY(0) rotate(0)', opacity: '1' },
          '100%': { transform: 'translateY(-90px) rotate(360deg)', opacity: '0' },
        },
      },
      animation: {
        'pop-in': 'pop-in 0.35s ease-out both',
        'fade-up': 'fade-up 0.3s ease-out both',
      },
    },
  },
  plugins: [],
};
