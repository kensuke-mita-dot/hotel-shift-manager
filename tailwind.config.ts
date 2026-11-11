import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // ── shadcn/ui のデザインシステム変数（既存）──
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // ── ホテルシフト デザイントークン ──
        hs: {
          // メイン（選択中・主ボタン）
          blue:        "#2b8fe0",
          "blue-hover": "#1f72b8",
          "blue-dark":  "#195d96",
          "blue-bg":    "#eaf4fd",
          "blue-bg2":   "#d6eafb",
          "blue-border":"#a9d2f5",
          // 文字
          text:         "#333333",
          "text-sub":   "#5f646b",
          "text-light":  "#80858c",
          "text-lighter":"#9a9ea5",
          // 罫線・背景
          border:       "#e3e5e8",
          "input-border":"#d5d8dc",
          surface:      "#ffffff",
          "gray-light":  "#f0f1f3",
          "gray-lighter":"#f7f8f9",
          // 警告（欠員・NG）
          danger:       "#e5484d",
          "danger-bg":  "#fdeeee",
          "danger-border":"#f4b4b6",
          // 注意（休み・兼任先・延長）
          warn:         "#e0661a",
          "warn-bg":    "#fdf0e6",
          // 配置済みチップ
          chip:         "#5a5f66",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // ホテルシフト固有
        chip: "4px",
        card: "8px",
        btn:  "6px",
      },
      fontFamily: {
        sans: ["'Hiragino Sans'", "'Hiragino Kaku Gothic ProN'", "'Noto Sans JP'", "sans-serif"],
      },
      minHeight: {
        tap: "44px",
      },
      minWidth: {
        tap: "44px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
