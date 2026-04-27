/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        charcoal: {
          DEFAULT: '#050505',
          light: '#0a0a0a',
          lighter: '#111111',
          border: '#ffffff10',
        },
        accent: {
          blue: '#1e3a8a',   // Dark Blue
          indigo: '#312e81', // Dark Indigo
          purple: '#4c1d95', // Dark Purple
          vibrant: '#8b5cf6', // Vibrant Purple for highlights
        }
      },
      keyframes: {
        scan: {
          'from': { transform: 'translateY(-100%)' },
          'to': { transform: 'translateY(500%)' },
        },
        'mesh-move': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(10%, 15%) scale(1.1)' },
          '66%': { transform: 'translate(-15%, 5%) scale(0.9)' },
        }
      },
      animation: {
        scan: 'scan 3s linear infinite',
        'mesh-slow': 'mesh-move 20s ease-in-out infinite',
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
