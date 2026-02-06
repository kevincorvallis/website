"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface RevealOnScrollProps {
  children?: React.ReactNode;
  className?: string;
  direction?: "up" | "fade" | "scale";
  delay?: number;
  duration?: number;
  start?: string;
}

export function RevealOnScroll({
  children,
  className = "",
  direction = "up",
  delay = 0,
  duration = 0.8,
  start = "top 88%",
}: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) {
      gsap.set(el, { opacity: 1, y: 0, scale: 1 });
      return;
    }

    const from: gsap.TweenVars = { opacity: 0 };
    const to: gsap.TweenVars = {
      opacity: 1,
      duration,
      delay,
      ease: "power3.out",
      scrollTrigger: {
        trigger: el,
        start,
        once: true,
      },
    };

    if (direction === "up") {
      from.y = 30;
      to.y = 0;
    } else if (direction === "scale") {
      from.scale = 0.95;
      to.scale = 1;
      to.duration = 1.2;
    }

    gsap.fromTo(el, from, to);

    return () => {
      ScrollTrigger.getAll()
        .filter((t) => t.trigger === el)
        .forEach((t) => t.kill());
    };
  }, [direction, delay, duration, start]);

  return (
    <div ref={ref} className={className} style={{ opacity: 0 }}>
      {children}
    </div>
  );
}
