import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#F4F4F5",
        card: "#ffffff",
        ink: "#0A0A0B",
        muted: "#6B6B72",
        accent: {
          DEFAULT: "#2B6EE8",
          soft: "#EBF2FF",
        },
        irizee: {
          sand: "#F4F4F5",
          blue: "#2B6EE8",
          "blue-light": "#EBF2FF",
          brown: "#2B6EE8",
          "brown-light": "#EBF2FF",
          ink: "#0A0A0B",
          muted: "#6B6B72",
          doing: "#F59E0B",
          done: "#16A249",
          high: "#E8444A",
          mid: "#F59E0B",
          low: "#A0A0A8",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
