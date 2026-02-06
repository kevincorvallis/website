export interface StorySection {
  type:
    | "photo-full"
    | "photo-inset"
    | "photo-grid"
    | "text-block"
    | "video-inset"
    | "hscroll-strip"
    | "spacer";
  src?: string;
  poster?: string;
  caption?: string;
  location?: string;
  images?: { src: string; alt: string }[];
  content?: string;
  size?: "sm" | "md" | "lg";
}

export interface StoryChapter {
  number: string;
  title: string;
  tagline: string;
  sections: StorySection[];
}

export interface Story {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  heroImage: string;
  accent: string;
  chapters: StoryChapter[];
  epilogue: {
    title: string;
    text: string;
    images: { src: string; alt: string; caption?: string; location?: string }[];
  };
  footer: string;
}
