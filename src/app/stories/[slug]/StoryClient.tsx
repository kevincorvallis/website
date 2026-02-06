"use client";

import { useState, useCallback } from "react";
import { Story } from "@/types/story";
import { StoryLoader } from "@/components/story/StoryLoader";
import { ProgressBar } from "@/components/story/ProgressBar";
import { StoryHero } from "@/components/story/StoryHero";
import { ChapterHeader } from "@/components/story/ChapterHeader";
import { PhotoFull } from "@/components/story/PhotoFull";
import { PhotoInset } from "@/components/story/PhotoInset";
import { VideoInset } from "@/components/story/VideoInset";
import { PhotoGrid } from "@/components/story/PhotoGrid";
import { TextBlock } from "@/components/story/TextBlock";
import { HScrollStrip } from "@/components/story/HScrollStrip";
import { Spacer } from "@/components/story/Spacer";
import { Epilogue } from "@/components/story/Epilogue";
import { StoryFooter } from "@/components/story/StoryFooter";
import Link from "next/link";

interface StoryClientProps {
  story: Story;
}

export function StoryClient({ story }: StoryClientProps) {
  const [ready, setReady] = useState(false);
  const handleLoaded = useCallback(() => setReady(true), []);

  return (
    <div className="bg-[#0a0a0a] text-[#f0f0ec] min-h-screen" style={{ "--accent": story.accent } as React.CSSProperties}>
      <StoryLoader onComplete={handleLoaded} />
      <ProgressBar color={story.accent} />

      {/* Back link */}
      <Link
        href="/"
        className="fixed top-5 left-5 z-50 text-[0.7rem] font-medium tracking-[0.12em] uppercase text-[#f0f0ec] no-underline opacity-60 hover:opacity-100 transition-opacity duration-300 mix-blend-difference"
      >
        &larr; Back
      </Link>

      <StoryHero
        image={story.heroImage}
        subtitle={story.subtitle}
        title={story.title}
        description={story.description}
        ready={ready}
      />

      {story.chapters.map((chapter) => (
        <section key={chapter.title}>
          <ChapterHeader
            number={chapter.number}
            title={chapter.title}
            tagline={chapter.tagline}
          />
          {chapter.sections.map((section, i) => {
            switch (section.type) {
              case "photo-full":
                return (
                  <PhotoFull
                    key={`${chapter.title}-${i}`}
                    src={section.src!}
                    alt={section.images?.[0]?.alt}
                    caption={section.caption}
                    location={section.location}
                  />
                );
              case "photo-inset":
                return <PhotoInset key={`${chapter.title}-${i}`} src={section.src!} />;
              case "video-inset":
                return <VideoInset key={`${chapter.title}-${i}`} src={section.src!} poster={section.poster} />;
              case "photo-grid":
                return <PhotoGrid key={`${chapter.title}-${i}`} images={section.images!} />;
              case "text-block":
                return <TextBlock key={`${chapter.title}-${i}`} content={section.content!} />;
              case "hscroll-strip":
                return <HScrollStrip key={`${chapter.title}-${i}`} images={section.images!} />;
              case "spacer":
                return <Spacer key={`${chapter.title}-${i}`} size={section.size} />;
              default:
                return null;
            }
          })}
        </section>
      ))}

      <Epilogue
        title={story.epilogue.title}
        text={story.epilogue.text}
        images={story.epilogue.images}
      />

      <StoryFooter text={story.footer} />
    </div>
  );
}
