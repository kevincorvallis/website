"use client";

import Image from "next/image";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

const workImages = [
  { src: "/images/kevi394-053.jpg", alt: "Photography work", priority: true },
  { src: "/images/kevi394-084.jpg", alt: "Photography work" },
  { src: "/images/KEVI554-009.jpg", alt: "Photography work" },
  { src: "/images/KEVI554-056.jpg", alt: "Photography work" },
  { src: "/images/kevi742-032.jpg", alt: "Photography work" },
  { src: "/images/kevi742-050.jpg", alt: "Photography work" },
  { src: "/images/kevi742-064.jpg", alt: "Photography work" },
  { src: "/images/kevi742-070.jpg", alt: "Photography work" },
];

export function WorkGrid() {
  return (
    <section className="px-5 py-20 md:px-10 md:py-32" id="work">
      <RevealOnScroll>
        <h2 className="text-xs font-medium tracking-[0.12em] uppercase text-text-muted mb-12">
          Selected Work
        </h2>
      </RevealOnScroll>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {workImages.map((img, i) => (
          <RevealOnScroll
            key={img.src}
            className={`relative overflow-hidden rounded-lg bg-bg-alt group ${
              i === 0 ? "md:col-span-2" : ""
            }`}
          >
            <Image
              src={img.src}
              alt={img.alt}
              width={1200}
              height={i === 0 ? 675 : 800}
              className={`w-full h-full object-cover block transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03] ${
                i === 0 ? "aspect-video" : "aspect-[3/2]"
              }`}
              priority={img.priority}
              sizes={i === 0 ? "100vw" : "(max-width: 768px) 100vw, 50vw"}
            />
          </RevealOnScroll>
        ))}
      </div>
    </section>
  );
}
