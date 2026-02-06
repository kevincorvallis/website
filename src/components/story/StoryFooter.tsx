import Link from "next/link";

interface StoryFooterProps {
  text: string;
}

export function StoryFooter({ text }: StoryFooterProps) {
  return (
    <footer className="py-16 px-6 text-center border-t border-white/[0.06]">
      <p className="text-[0.7rem] font-normal text-[#7a7a75] tracking-[0.05em]">
        {text} &mdash; <Link href="/" className="text-accent no-underline">klee.page</Link>
      </p>
    </footer>
  );
}
