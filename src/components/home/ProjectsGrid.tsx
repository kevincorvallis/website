"use client";

import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

const projects = [
  {
    href: "https://shredders-bay.vercel.app",
    icon: "🏔",
    tag: "Web + iOS",
    title: "Shredders",
    desc: "Real-time ski conditions and AI powder predictions for Pacific Northwest resorts.",
    tech: "Next.js · SwiftUI · Supabase",
  },
  {
    href: "https://daybyday.klee.page",
    icon: "📔",
    tag: "Web + iOS",
    title: "Day by Day",
    desc: "A daily journaling platform for reflection, gratitude, and staying connected.",
    tech: "AWS · DynamoDB · Cognito",
  },
  {
    href: "https://ai-atc-sigma.vercel.app",
    icon: "✈️",
    tag: "Web App",
    title: "AI ATC",
    desc: "Interactive air traffic control radio trainer with AI-powered pilot responses.",
    tech: "JavaScript · OpenAI · GSAP",
  },
  {
    href: "https://github.com/kevincorvallis/iwbh-support",
    icon: "💛",
    tag: "iOS",
    title: "IWBH",
    desc: "AI relationship coaching with habit tracking and partner sync for iOS.",
    tech: "SwiftUI · Node.js · DynamoDB",
  },
];

export function ProjectsGrid() {
  return (
    <section className="px-5 py-20 md:px-10 md:py-32 border-t border-border" id="projects">
      <RevealOnScroll>
        <h2 className="text-xs font-medium tracking-[0.12em] uppercase text-text-muted mb-12">
          Projects
        </h2>
      </RevealOnScroll>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {projects.map((project) => (
          <RevealOnScroll key={project.title}>
            <a
              href={project.href}
              target="_blank"
              rel="noopener"
              className="group flex flex-col gap-3 p-6 no-underline text-inherit rounded-xl border border-border bg-bg hover:translate-y-[-2px] hover:border-text-muted hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            >
              <span className="text-2xl leading-none">{project.icon}</span>
              <div className="flex flex-col gap-1">
                <span className="text-[0.7rem] font-medium tracking-[0.1em] uppercase text-text-muted">
                  {project.tag}
                </span>
                <h3 className="text-lg font-bold tracking-tight">{project.title}</h3>
              </div>
              <p className="text-[0.9rem] text-text-secondary leading-relaxed">
                {project.desc}
              </p>
              <div className="flex items-center justify-between mt-auto pt-2">
                <span className="text-xs font-medium text-text-muted">{project.tech}</span>
                <svg
                  className="text-text-muted opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M3 8h10m0 0l-4-4m4 4l-4 4" />
                </svg>
              </div>
            </a>
          </RevealOnScroll>
        ))}
      </div>
    </section>
  );
}
