/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: "#071912",
        "forest-2": "#12362a",
        gold: "#c4a35a",
        "gold-deep": "#b07d1a",
        teal: "#3d9b74",
        canvas: "#efe8d8",
        paper: "#fbf7ee",
        ink: "#14160f",
        muted: "#6a6458",
        review: "#d4a03a",
        ok: "#3d9b74",
        warn: "#c45c2a",
        alert: "#b33a32",
        signal: "#4a8fbf",
      },
      fontFamily: {
        display: ['Fraunces', "Palatino", "serif"],
        sans: ['Outfit', '"Segoe UI"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.65) inset, 0 18px 40px -24px rgba(7,25,18,0.35)",
        glow: "0 0 120px rgba(212,160,58,0.22)",
        lift: "0 22px 50px -28px rgba(7,25,18,0.45)",
      },
      letterSpacing: {
        kicker: "0.22em",
      },
    },
  },
  plugins: [],
};
