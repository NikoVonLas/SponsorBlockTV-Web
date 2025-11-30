/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#161b22",
          100: "#161b22",
          200: "#1f242d",
        },
        border: "#2b3138",
        accent: "#1f6feb",
        fg: "#f0f6fc",
        muted: "#8b949e",
        canvas: "#0d1117",
      },
    },
  },
  plugins: [],
};
