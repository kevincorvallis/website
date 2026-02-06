"use client";

import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

const links = [
  { href: "mailto:contact@klee.page", label: "Email" },
  { href: "https://github.com/kevincorvallis", label: "GitHub" },
  { href: "https://www.linkedin.com/in/kevin0813/", label: "LinkedIn" },
];

export function ConnectSection() {
  return (
    <section className="px-5 py-20 md:px-10 md:py-32 border-t border-border" id="connect">
      <RevealOnScroll>
        <h2 className="text-xs font-medium tracking-[0.12em] uppercase text-text-muted mb-12">
          Let&apos;s Connect
        </h2>
      </RevealOnScroll>
      <RevealOnScroll>
        <div className="flex flex-col md:flex-row gap-5 md:gap-10">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.href.startsWith("mailto") ? undefined : "_blank"}
              rel={link.href.startsWith("mailto") ? undefined : "noopener"}
              className="relative text-text-primary no-underline text-base font-medium after:content-[''] after:absolute after:bottom-[-2px] after:left-0 after:w-full after:h-px after:bg-text-muted after:scale-x-0 after:origin-right after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.16,1,0.3,1)] hover:after:scale-x-100 hover:after:origin-left"
            >
              {link.label}
            </a>
          ))}
        </div>
      </RevealOnScroll>
    </section>
  );
}
