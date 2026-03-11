import { BottomCTA } from "@/components/bottom-cta";
import { FAQ } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { ImageReveal } from "@/components/image-reveal";
import { Pricing } from "@/components/pricing";
import { ShowcaseCards } from "@/components/showcase-cards";
import { Stats } from "@/components/stats";
import { Testimonials } from "@/components/testimonials";
import { TextReveal } from "@/components/text-reveal";
import { ThemeSwitch } from "@/components/theme-switch";
import { ToolsCarousel } from "@/components/tools-carousel";
import { TrustedBy } from "@/components/trusted-by";
import { createMetadata, siteConfig } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Ginie DAML - AI-Powered Canton Smart Contracts",
  description: `Welcome to ${siteConfig.name}. ${siteConfig.description}`,
  path: "/",
});

export default function HomePage(): ReactNode {
  return (
    <>
      <Header />
      <ThemeSwitch />
      <main id="main-content" className="flex-1">
        <Hero />
        
        {/* Text Reveal Section */}
        <section className="relative py-32 md:py-48">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <TextReveal
              text="Describe it in English. Deploy it on Canton. In minutes."
              className="text-4xl font-medium tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl"
            />
          </div>
        </section>

        {/* Image Reveal Gallery */}
        <ImageReveal />

        {/* Trusted By */}
        <TrustedBy />

        {/* Tools Carousel */}
        <ToolsCarousel />

        {/* Showcase Cards */}
        <ShowcaseCards />

        {/* Stats */}
        <Stats />

        {/* Testimonials */}
        <Testimonials />

        {/* Pricing */}
        <Pricing />

        {/* FAQ */}
        <FAQ />

        {/* Bottom CTA */}
        <BottomCTA />
      </main>

      <Footer />
    </>
  );
}
