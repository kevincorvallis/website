"use client";

import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

interface VideoInsetProps {
  src: string;
  poster?: string;
}

export function VideoInset({ src, poster }: VideoInsetProps) {
  return (
    <RevealOnScroll className="px-4 md:px-8 lg:px-12 max-w-[600px] md:max-w-[700px] lg:max-w-[800px] mx-auto">
      <video
        src={src}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        className="w-full rounded-[4px] block"
      />
    </RevealOnScroll>
  );
}
