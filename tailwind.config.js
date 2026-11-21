/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#008B44', // Nova FreshMart Green
          secondary: '#10B981', // Nova FreshMart Mint Leaf
          accent: '#F97316', // Nova FreshMart Tangerine Orange
          dark: '#0F291E', // Nova FreshMart Deep Forest
          bg: '#F4F8F5',
          surface: '#FFFFFF',
        }
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        }
      },
      animation: {
        fadeIn: 'fadeIn 0.5s ease-out forwards',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
