"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface HScrollStripProps {
  images: { src: string; alt: string }[];
}

export function HScrollStrip({ images }: HScrollStripProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || window.innerWidth < 768) return;

    const totalWidth = strip.scrollWidth;
    const viewportWidth = window.innerWidth;

    const ctx = gsap.context(() => {
      gsap.to(strip, {
        x: -(totalWidth - viewportWidth),
        ease: "none",
        scrollTrigger: {
          trigger: wrapperRef.current,
          start: "top 20%",
          end: () => "+=" + (totalWidth - viewportWidth),
          scrub: 1,
          pin: true,
          anticipatePin: 1,
        },
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <div ref={wrapperRef} className="overflow-hidden relative">
      <div
        ref={stripRef}
        className="grid grid-cols-1 gap-2 px-4 md:flex md:flex-nowrap md:w-max md:gap-0 md:px-0"
      >
        {images.map((img) => (
          <div key={img.src} className="aspect-[4/5] md:aspect-auto md:flex-[0_0_55vw] md:h-[75vh] lg:flex-[0_0_45vw] lg:h-[80vh] md:px-2">
            <Image
              src={img.src}
              alt={img.alt}
              width={800}
              height={1000}
              className="w-full h-full object-cover rounded-md"
              sizes="(max-width: 768px) 100vw, 55vw"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
