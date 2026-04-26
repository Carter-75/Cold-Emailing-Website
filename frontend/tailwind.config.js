/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      keyframes: {
        scan: {
          'from': { transform: 'translateY(-100%)' },
          'to': { transform: 'translateY(500%)' },
        }
      },
      animation: {
        scan: 'scan 3s linear infinite',
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
      }
    },
  },
  plugins: [
    require("tailwindcss-animate"),
  ],
}
