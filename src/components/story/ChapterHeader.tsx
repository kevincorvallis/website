"use client";

import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

interface ChapterHeaderProps {
  number: string;
  title: string;
  tagline: string;
}

export function ChapterHeader({ number, title, tagline }: ChapterHeaderProps) {
  return (
    <RevealOnScroll className="h-[60vh] md:h-[70vh] flex flex-col items-center justify-center text-center px-6">
      <div className="text-[0.6rem] font-medium tracking-[0.2em] uppercase text-accent mb-5">
        {number}
      </div>
      <h2 className="text-[clamp(2rem,10vw,4.5rem)] font-black tracking-[-0.04em] leading-[0.95] mb-4 text-[#f0f0ec]">
        {title}
      </h2>
      <p className="text-[0.9rem] font-normal text-[#7a7a75] leading-relaxed max-w-[360px]">
        {tagline}
      </p>
    </RevealOnScroll>
  );
}
