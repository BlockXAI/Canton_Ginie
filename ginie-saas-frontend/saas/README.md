# SaaS Landing Page Template

A premium, production-ready Next.js 16+ landing page template designed for SaaS products, startups, and digital products. Features modern animations, dark mode, full accessibility, and a beautiful design system.

## ✨ Highlights

- 🎨 **Premium Design** - Modern, polished UI with attention to every detail
- 🌙 **Dark Mode** - Seamless light/dark theme switching
- ⚡ **Blazing Fast** - Optimized for Core Web Vitals
- 📱 **Fully Responsive** - Looks great on all devices
- ♿ **Accessible** - WCAG 2.1 AA compliant
- 🔧 **Easy to Customize** - Centralized configuration file

## Features

- ✅ **Next.js 16+** with App Router
- ✅ **TypeScript** (strict mode)
- ✅ **Tailwind CSS v4** with design tokens
- ✅ **Smooth Scrolling** via Lenis
- ✅ **Motion** via motion/react with reduced-motion support
- ✅ **SEO Ready** - metadata, Open Graph, Twitter cards
- ✅ **Accessibility** - skip links, focus rings, ARIA labels
- ✅ **Edge Compatible** - deploy anywhere

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 3. Customize your site

Edit `lib/config.ts` to update all text, links, and settings in one place.

## 📁 Project Structure

```
├── app/
│   ├── globals.css        # Design tokens & theme colors
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Landing page
│   └── ...
├── components/
│   ├── hero.tsx           # Hero section with parallax
│   ├── features-bento.tsx # Bento grid features
│   ├── testimonials.tsx   # Auto-rotating testimonials
│   ├── how-it-works.tsx   # Steps with scroll progress
│   ├── pricing.tsx        # 3-tier pricing cards
│   ├── faq.tsx            # Accordion FAQ
│   ├── footer.tsx         # CTA card + footer links
│   └── ...
├── lib/
│   ├── config.ts          # ⭐ EDIT THIS - All site config
│   ├── metadata.ts        # SEO utilities
│   └── motion.tsx         # Motion components
└── public/
    ├── BG.jpg             # Hero background
    ├── dashboardmock.png  # Product screenshot
    └── mock-logos/        # Company logos
```

## 🎨 Customization Guide

### Step 1: Update Site Configuration

Edit `lib/config.ts` - this is your **single source of truth** for all text content:

```ts
export const siteConfig = {
  name: "Your Brand",
  tagline: "Your Tagline",
  description: "Your description",
  // ...
};

export const heroConfig = {
  headline: {
    line1: "Your Headline",
    line2: "Second Line",
    accent: "Accent Word",
  },
  // ...
};
```

### Step 2: Update Theme Colors

Edit `app/globals.css` to change your brand colors:

```css
:root {
  --accent: #a8d946;        /* Your primary brand color */
  --background: #f5f5f5;    /* Light mode background */
  --foreground: #0a0a0a;    /* Light mode text */
  /* ... */
}

.dark {
  --background: #141414;    /* Dark mode background */
  --foreground: #fafafa;    /* Dark mode text */
  /* ... */
}
```

### Step 3: Replace Assets

| File | Purpose | Dimensions |
|------|---------|------------|
| `public/BG.jpg` | Hero background | 1920×1080+ |
| `public/dashboardmock.png` | Product screenshot | 1920×1080 |
| `public/mock-logos/*.svg` | Company logos | ~120×40 |
| `app/icon.svg` | Favicon | 32×32 |
| `app/apple-icon.svg` | Apple touch icon | 180×180 |

### Step 4: Toggle Features

In `lib/config.ts`, enable/disable features:

```ts
export const features = {
  smoothScroll: true,      // Lenis smooth scrolling
  testimonialAutoplay: true, // Auto-rotate testimonials
  parallaxHero: true,      // Mouse parallax on hero
  blurInHeadline: true,    // Scroll blur animation
};
```

## 🎯 Section Components

Each section is a standalone component you can customize or remove:

| Component | Description |
|-----------|-------------|
| `Hero` | Full-width hero with parallax background, headline, CTA |
| `BlurInHeadline` | Scroll-driven text reveal animation |
| `FeaturesBento` | Bento grid with phone mockups and stats |
| `Testimonials` | Auto-rotating testimonials with avatars |
| `HowItWorks` | Sticky sidebar + scrolling steps |
| `Pricing` | 3-tier pricing cards with popular highlight |
| `FAQ` | Accordion with smooth animations |
| `Footer` | CTA email capture + link columns |

## 📱 Responsive Breakpoints

The template uses custom breakpoints for precise control:

- `max-[1200px]` - Tablet landscape
- `max-[850px]` - Tablet portrait / Mobile
- `sm:` / `md:` / `lg:` - Standard Tailwind breakpoints

## ♿ Accessibility Features

- Skip-to-content link
- Proper heading hierarchy (h1 → h2 → h3)
- ARIA labels on all interactive elements
- Keyboard navigation support
- Focus visible rings
- Reduced motion support
- Screen reader announcements for dynamic content

## 🚀 Deployment

The template is Edge-compatible and works with:

- **Vercel** (recommended)
- **Netlify**
- **Cloudflare Pages**
- Any static hosting

```bash
npm run build
```

## 📜 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript checks |

## 📄 License

This template is licensed for use in commercial projects. You may not resell or redistribute the template itself.

---

Built with ❤️ using Next.js, Tailwind CSS, and Motion
