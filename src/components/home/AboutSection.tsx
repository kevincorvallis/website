"use client";

import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

export function AboutSection() {
  return (
    <section className="px-5 py-20 md:px-10 md:py-32 border-t border-border" id="about">
      <div className="max-w-[640px]">
        <RevealOnScroll>
          <h2 className="text-xs font-medium tracking-[0.12em] uppercase text-text-muted mb-12">
            About
          </h2>
        </RevealOnScroll>
        <RevealOnScroll>
          <p className="text-[clamp(1.05rem,1.5vw,1.2rem)] text-text-secondary leading-relaxed mb-6">
            I&apos;m Kevin — a software engineer at Microsoft AI, where I build and ship
            Copilot experiences and design large-scale Azure data pipelines processing
            40TB+ daily. USC Computer Science, Army veteran, former NASA JPL intern.
          </p>
        </RevealOnScroll>
        <RevealOnScroll>
          <p className="text-[clamp(1.05rem,1.5vw,1.2rem)] text-text-secondary leading-relaxed mb-6">
            Outside of work, I&apos;m a student pilot pursuing my private pilot license
            and volunteer with Angel Flight West providing medical transport flights
            in the Pacific Northwest. I also shoot photos, surf, and build apps
            about things I care about.
          </p>
        </RevealOnScroll>
        <RevealOnScroll>
          <p>
            <a
              href="/assets/kevin-lee-resume.docx"
              download
              className="text-text-primary no-underline text-[0.9rem] font-medium pb-px border-b border-text-muted hover:border-text-primary transition-colors duration-300"
            >
              Download Resume ↓
            </a>
          </p>
        </RevealOnScroll>
      </div>
    </section>
  );
}
