/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Public Sans'", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
