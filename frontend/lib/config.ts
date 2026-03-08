/**
 * ============================================================================
 * SITE CONFIGURATION
 * ============================================================================
 *
 * Customize your landing page by editing the values below.
 * All text, links, and settings are centralized here for easy editing.
 */

export const siteConfig = {
  name: "Ginie DAML",
  tagline: "AI-Powered Canton Smart Contracts",
  description:
    "Generate, compile, and deploy Canton DAML smart contracts from plain English. From idea to blockchain in minutes.",
  url: "https://ginie-daml.com",
  twitter: "@giniedaml",

  nav: {
    cta: {
      text: "Generate Contract",
      href: "/generate",
    },
    signIn: {
      text: "Sign in",
      href: "#",
    },
  },
} as const;

/**
 * ============================================================================
 * FEATURE FLAGS
 * ============================================================================
 *
 * Toggle features on/off without touching component code.
 */
export const features = {
  smoothScroll: true,
  darkMode: true,
} as const;

/**
 * ============================================================================
 * THEME CONFIGURATION
 * ============================================================================
 *
 * Colors are defined in globals.css using CSS custom properties.
 * This config controls which theme features are enabled.
 */
export const themeConfig = {
  defaultTheme: "dark" as "light" | "dark" | "system",
  enableSystemTheme: true,
} as const;
