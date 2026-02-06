"use client";

import Image from "next/image";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

interface PhotoInsetProps {
  src: string;
  alt?: string;
}

export function PhotoInset({ src, alt = "" }: PhotoInsetProps) {
  return (
    <RevealOnScroll className="px-4 md:px-8 lg:px-12 max-w-[600px] md:max-w-[700px] lg:max-w-[800px] mx-auto">
      <Image
        src={src}
        alt={alt}
        width={800}
        height={1000}
        className="w-full rounded-[4px] block"
        sizes="(max-width: 768px) 100vw, 800px"
      />
    </RevealOnScroll>
  );
}
