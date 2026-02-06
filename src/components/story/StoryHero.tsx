"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface StoryHeroProps {
  image: string;
  subtitle: string;
  title: string;
  description: string;
  ready: boolean;
}

export function StoryHero({ image, subtitle, title, description, ready }: StoryHeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready) return;

    const tl = gsap.timeline({ delay: 0.3 });
    tl.to(subtitleRef.current, { opacity: 1, duration: 0.8, ease: "power2.out" })
      .to(titleRef.current, { opacity: 1, duration: 1, ease: "power2.out" }, "-=0.4")
      .to(descRef.current, { opacity: 1, duration: 0.8, ease: "power2.out" }, "-=0.5")
      .to(hintRef.current, { opacity: 1, duration: 0.6, ease: "power2.out" }, "-=0.3");

    if (imgRef.current) {
      gsap.to(imgRef.current, {
        scale: 1.15,
        ease: "none",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    }

    gsap.to(hintRef.current, {
      opacity: 0,
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "15% top",
        end: "30% top",
        scrub: true,
      },
    });

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, [ready]);

  return (
    <section ref={sectionRef} className="relative h-dvh flex items-end justify-center p-6 md:p-12 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <Image
          ref={imgRef}
          src={image}
          alt={title}
          fill
          className="object-cover will-change-transform"
          priority
          sizes="100vw"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(10,10,10,0.9)] via-[rgba(10,10,10,0.3)] to-[rgba(10,10,10,0.05)] z-[1]" />
      <div className="relative z-[2] text-center pb-8 md:pb-16">
        <div ref={subtitleRef} className="text-[0.65rem] font-medium tracking-[0.2em] uppercase text-accent mb-4 opacity-0">
          {subtitle}
        </div>
        <h1 ref={titleRef} className="text-[clamp(2.5rem,11vw,5.5rem)] font-black tracking-[-0.04em] leading-[0.95] mb-4 text-[#f0f0ec] opacity-0">
          {title}
        </h1>
        <p ref={descRef} className="text-[0.95rem] font-normal text-[#7a7a75] leading-relaxed max-w-[320px] md:max-w-[420px] mx-auto opacity-0">
          {description}
        </p>
      </div>
      <div ref={hintRef} className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[2] flex flex-col items-center gap-2 opacity-0">
        <span className="text-[0.6rem] font-medium tracking-[0.15em] uppercase text-[#7a7a75]">Scroll</span>
        <div className="w-px h-8 bg-gradient-to-b from-[#7a7a75] to-transparent animate-[scrollPulse_2s_ease-in-out_infinite]" />
      </div>
    </section>
  );
}
