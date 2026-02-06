"use client";

import Image from "next/image";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

interface PhotoGridProps {
  images: { src: string; alt: string }[];
}

export function PhotoGrid({ images }: PhotoGridProps) {
  return (
    <RevealOnScroll className="grid grid-cols-2 gap-2 md:gap-4 px-4 md:px-12 max-w-[700px] md:max-w-[900px] lg:max-w-[1000px] mx-auto">
      {images.map((img) => (
        <Image
          key={img.src}
          src={img.src}
          alt={img.alt}
          width={500}
          height={667}
          className="w-full aspect-[3/4] object-cover rounded-[3px]"
          sizes="(max-width: 768px) 50vw, 450px"
        />
      ))}
    </RevealOnScroll>
  );
}
