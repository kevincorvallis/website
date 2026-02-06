import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArticleClient } from "./ArticleClient";

const articles: Record<string, { title: string; description: string }> = {
  advice: {
    title: "Timeless Advice",
    description: "Wisdom and reflections collected over the years.",
  },
};

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return Object.keys(articles).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = articles[slug];
  if (!article) return {};
  return {
    title: article.title,
    description: article.description,
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  if (!articles[slug]) notFound();
  return <ArticleClient slug={slug} />;
}
