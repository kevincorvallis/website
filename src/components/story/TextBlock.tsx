"use client";

import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

interface TextBlockProps {
  content: string;
}

export function TextBlock({ content }: TextBlockProps) {
  return (
    <RevealOnScroll className="py-16 md:py-24 px-6 md:px-12 max-w-[520px] md:max-w-[600px] mx-auto text-center">
      <p
        className="text-base font-normal text-[#7a7a75] leading-[1.8] [&_strong]:text-[#f0f0ec] [&_strong]:font-medium"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </RevealOnScroll>
  );
}
