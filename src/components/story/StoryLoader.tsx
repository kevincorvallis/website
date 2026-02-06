"use client";

import { useState, useEffect } from "react";

interface StoryLoaderProps {
  onComplete: () => void;
}

export function StoryLoader({ onComplete }: StoryLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const images = document.querySelectorAll("img");
    let loaded = 0;
    const total = images.length || 1;

    function updateProgress() {
      loaded++;
      setProgress(Math.round((loaded / total) * 100));
      if (loaded >= total) {
        setTimeout(() => {
          setHidden(true);
          setTimeout(onComplete, 800);
        }, 400);
      }
    }

    images.forEach((img) => {
      if (img.complete) {
        updateProgress();
      } else {
        img.addEventListener("load", updateProgress);
        img.addEventListener("error", updateProgress);
      }
    });

    // Fallback timeout
    const fallback = setTimeout(() => {
      if (!hidden) {
        setHidden(true);
        setTimeout(onComplete, 800);
      }
    }, 5000);

    return () => clearTimeout(fallback);
  }, [onComplete, hidden]);

  return (
    <div
      className={`fixed inset-0 z-[100] bg-[#0a0a0a] flex items-center justify-center flex-col gap-4 transition-[opacity,visibility] duration-800 ease-in-out ${
        hidden ? "opacity-0 invisible" : ""
      }`}
    >
      <div className="text-[0.75rem] font-medium tracking-[0.15em] uppercase text-[#7a7a75]">
        Loading Story
      </div>
      <div className="w-[120px] h-[2px] bg-white/[0.08] rounded-sm overflow-hidden">
        <div
          className="h-full bg-[#f0f0ec] rounded-sm transition-[width] duration-300 ease-in-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
