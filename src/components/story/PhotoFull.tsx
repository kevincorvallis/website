"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface PhotoFullProps {
  src: string;
  alt?: string;
  caption?: string;
  location?: string;
}

export function PhotoFull({ src, alt = "", caption, location }: PhotoFullProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;

    // Reveal scale
    gsap.fromTo(
      container,
      { opacity: 0, scale: 0.95 },
      {
        opacity: 1,
        scale: 1,
        duration: 1.2,
        ease: "power2.out",
        scrollTrigger: { trigger: container, start: "top 80%", once: true },
      }
    );

    // Ken Burns
    gsap.fromTo(
      img,
      { scale: 1.05 },
      {
        scale: 1.12,
        ease: "none",
        scrollTrigger: {
          trigger: container,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      }
    );

    return () => {
      ScrollTrigger.getAll()
        .filter((t) => t.trigger === container)
        .forEach((t) => t.kill());
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-dvh overflow-hidden" style={{ opacity: 0 }}>
      <Image
        ref={imgRef}
        src={src}
        alt={alt}
        fill
        className="object-cover will-change-transform"
        sizes="100vw"
      />
      {caption && (
        <div className="absolute bottom-8 left-6 right-6 z-[2] text-[0.85rem] font-normal text-[#f0f0ec] leading-relaxed">
          {location && (
            <span className="block text-[0.6rem] font-medium tracking-[0.12em] uppercase text-accent mb-1">
              {location}
            </span>
          )}
          {caption}
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 h-[40%] bg-gradient-to-t from-[rgba(10,10,10,0.7)] to-transparent z-[1] pointer-events-none" />
    </div>
  );
}
