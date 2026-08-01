import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#102033',
        coral: '#ff8552',
        sky: '#b8e1ff',
        mint: '#d6f7e3',
        sun: '#ffe7a3',
      },
      boxShadow: {
        card: '0 18px 50px rgba(16, 32, 51, 0.12)',
      },
      backgroundImage: {
        'hero-glow':
          'radial-gradient(circle at top, rgba(255, 231, 163, 0.9), transparent 35%), radial-gradient(circle at 20% 20%, rgba(184, 225, 255, 0.85), transparent 30%), linear-gradient(180deg, #fffdf8 0%, #f3fbff 100%)',
      },
      fontFamily: {
        sans: ['Nunito', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
