import daisyui from "daisyui";
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: { extend: {} },
  plugins: [daisyui],
  daisyui: { themes: ["light", "dark"] },
};
