import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  plugins: [
    require("@tailwindcss/typography"),
  ],
} satisfies Config;