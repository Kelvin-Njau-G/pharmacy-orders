/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Mulish', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT:    '#006CB5',
          dark:       '#00508a',
          light:      '#e6f2fb',
          red:        '#E63323',
          'red-dark': '#c02a1c',
          'red-light':'#fdf0ee',
          navy:       '#557DB1',
          'navy-light':'#eef2f8',
        },
      },
    },
  },
  plugins: [],
}
