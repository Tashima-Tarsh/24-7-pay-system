import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./app/**/*.{tsx,ts}', './components/**/*.{tsx,ts}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter Variable', 'system-ui', 'sans-serif'] },
      colors: {
        canvas: '#11121a',
        panel: '#191a25',
        outline: '#323445',
        ink: '#f3f3fa',
        muted: '#b3b5c7',
        brand: '#4f46e5',
      },
    },
  },
  plugins: [],
} satisfies Config
