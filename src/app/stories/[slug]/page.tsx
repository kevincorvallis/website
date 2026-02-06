import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { brockStory } from "@/data/stories/brock";
import { StoryClient } from "./StoryClient";

const stories = {
  brock: brockStory,
};

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return Object.keys(stories).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const story = stories[slug as keyof typeof stories];
  if (!story) return {};

  return {
    title: `${story.title} — ${story.subtitle}`,
    description: story.description,
    openGraph: {
      title: `${story.title} — ${story.subtitle}`,
      description: story.description,
      images: [story.heroImage],
    },
  };
}

export default async function StoryPage({ params }: Props) {
  const { slug } = await params;
  const story = stories[slug as keyof typeof stories];
  if (!story) notFound();

  return <StoryClient story={story} />;
}
