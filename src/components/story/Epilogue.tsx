"use client";

import { RevealOnScroll } from "@/components/ui/RevealOnScroll";
import { PhotoFull } from "./PhotoFull";

interface EpilogueProps {
  title: string;
  text: string;
  images: { src: string; alt: string; caption?: string; location?: string }[];
}

export function Epilogue({ title, text, images }: EpilogueProps) {
  return (
    <section>
      <div className="h-40" />
      <RevealOnScroll direction="fade" className="w-10 h-px bg-accent/40 mx-auto" />
      <RevealOnScroll className="py-24 px-6 text-center">
        <h2 className="text-[clamp(1.8rem,8vw,3.5rem)] font-black tracking-[-0.03em] leading-[1.05] mb-6 text-[#f0f0ec]">
          {title}
        </h2>
        <p className="text-base font-normal text-[#7a7a75] leading-[1.8] max-w-[400px] mx-auto mb-12">
          {text}
        </p>
      </RevealOnScroll>
      {images.map((img, i) => (
        <div key={img.src}>
          <PhotoFull src={img.src} alt={img.alt} caption={img.caption} location={img.location} />
          {i < images.length - 1 && <div className="h-40" />}
        </div>
      ))}
    </section>
  );
}
