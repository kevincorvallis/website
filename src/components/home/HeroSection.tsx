"use client";

import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

export function HeroSection() {
  return (
    <section className="min-h-screen flex flex-col justify-center px-5 md:px-10">
      <RevealOnScroll>
        <h1 className="text-[clamp(3rem,10vw,8rem)] font-black tracking-[-0.04em] leading-[0.95]">
          Kevin Lee
        </h1>
      </RevealOnScroll>
      <RevealOnScroll delay={0.1}>
        <p className="mt-6 text-[clamp(1rem,1.5vw,1.25rem)] font-normal text-text-secondary">
          Software Engineer &middot; Pilot &middot; Photographer
        </p>
      </RevealOnScroll>
    </section>
  );
}
