"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { MessageSquareText, Search, Code, Hammer, Shield, Rocket } from "lucide-react";
import type { ReactNode } from "react";

const steps = [
  {
    icon: MessageSquareText,
    title: "Describe your contract",
    description:
      "Write what you need in plain English — \"Create a bond contract between issuer and investor with a fixed coupon rate.\" Ginie's intent engine understands your requirements.",
  },
  {
    icon: Search,
    title: "AI finds matching patterns",
    description:
      "Ginie searches a curated RAG database of 500+ verified DAML patterns, signatures, and templates to find the best building blocks for your contract.",
  },
  {
    icon: Code,
    title: "Production DAML is generated",
    description:
      "GPT-4o writes idiomatic DAML code using the matched patterns as context — complete with templates, choices, signatories, and observers.",
  },
  {
    icon: Hammer,
    title: "Compiled & verified by DAML SDK",
    description:
      "The generated code is compiled with the official DAML SDK. If compilation fails, an automatic fix loop rewrites the code until it passes.",
  },
  {
    icon: Shield,
    title: "Security audit runs automatically",
    description:
      "A hybrid auditor checks for vulnerabilities, DAML best practices, and Canton compliance — producing a full security report before deployment.",
  },
  {
    icon: Rocket,
    title: "Deployed live on Canton",
    description:
      "The compiled DAR is uploaded, parties are allocated (or your registered party is used), and the contract goes live on the Canton ledger.",
  },
];

function StepItem({
  step,
  isLast,
}: {
  step: (typeof steps)[0];
  isLast: boolean;
}): ReactNode {
  const Icon = step.icon;

  return (
    <div className={`relative flex gap-5 ${isLast ? "" : "pb-32"}`}>
      <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent" aria-hidden="true">
        <Icon className="h-5 w-5 text-black" strokeWidth={2} />
      </div>

      <div className="pt-1">
        <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
          {step.title}
        </h3>
        <p className="mt-2 max-w-sm text-base leading-relaxed text-foreground/60">
          {step.description}
        </p>
      </div>
    </div>
  );
}

export function HowItWorks(): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.3", "end 0.7"],
  });

  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section
      ref={containerRef}
      className="relative w-full bg-background"
    >
      <div className="mx-auto grid max-w-5xl gap-12 px-6 py-20 sm:py-28 lg:grid-cols-2 lg:gap-20">
        <div className="lg:sticky lg:top-48 lg:h-fit lg:self-start">
          <h2 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            How <span style={{ color: '#22c55e' }}>Ginie</span> works
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-foreground/60">
            From a plain-English prompt to a deployed contract on{" "}
            <span className="font-medium text-foreground">Canton Network</span>
            — here&apos;s the six-step pipeline.
          </p>
          <motion.a
            href="/setup"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mt-8 inline-flex items-center rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            Try it now
          </motion.a>
        </div>

        <div className="relative">
          <div className="absolute left-6 top-6 h-[calc(100%-6rem)] w-0.5 -translate-x-1/2 bg-foreground/10" aria-hidden="true">
            <motion.div
              style={{ height: lineHeight, willChange: "height" }}
              className="w-full bg-accent"
            />
          </div>

          <ol className="relative list-none p-0 m-0">
            {steps.map((step, index) => (
              <li key={step.title}>
                <StepItem
                  step={step}
                  isLast={index === steps.length - 1}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
