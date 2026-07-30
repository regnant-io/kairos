/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Kairos brand colors — inspired by Tanzania
        primary: {
          DEFAULT: '#1B4F72',
          50: '#EAF2F8',
          100: '#D6E4F0',
          200: '#AEC9E1',
          300: '#85AED2',
          400: '#5D93C3',
          500: '#3478B4',
          600: '#1B4F72',
          700: '#153D58',
          800: '#0F2B3E',
          900: '#091924'
        },
        accent: {
          DEFAULT: '#F39C12',
          50: '#FEF9EC',
          100: '#FDF3D9',
          200: '#FBE7B3',
          300: '#F9DB8D',
          400: '#F7CF67',
          500: '#F5C341',
          600: '#F39C12',
          700: '#C07D0E',
          800: '#8D5D0B',
          900: '#5A3D07'
        },
        success: '#27AE60',
        warning: '#F39C12',
        danger: '#E74C3C',
        // Theme-reactive semantic tokens (resolve to CSS variables)
        background: 'var(--bg-page)',
        surface: 'var(--bg-card)',
        'surface-hover': 'var(--bg-card-hover)',
        border: 'var(--border-color)',
        muted: 'var(--text-secondary)',
        'content-primary': 'var(--text-primary)',
        'content-secondary': 'var(--text-secondary)',
        'content-tertiary': 'var(--text-tertiary)'
      },
      fontFamily: {
        sans: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
        heading: ['Fraunces', 'Georgia', 'serif']
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-lg': 'var(--shadow-card-lg)'
      },
      borderRadius: {
        card: '14px'
      },
      animation: {
        'blink': 'blink 1s step-end infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out'
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' }
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      }
    }
  },
  plugins: []
}
