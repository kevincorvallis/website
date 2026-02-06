"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function ProgressBar({ color = "#d4a574" }: { color?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    gsap.to(el, {
      width: "100%",
      ease: "none",
      scrollTrigger: {
        trigger: document.body,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.3,
      },
    });

    return () => {
      ScrollTrigger.getAll()
        .filter((t) => t.trigger === document.body)
        .forEach((t) => t.kill());
    };
  }, []);

  return (
    <div
      ref={ref}
      className="fixed top-0 left-0 w-0 h-[2px] z-50"
      style={{ background: color }}
    />
  );
}
