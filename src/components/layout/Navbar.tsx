"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "@/providers/ThemeProvider";

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { toggleTheme } = useTheme();

  const handleLinkClick = () => {
    setMenuOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-[1000] flex items-center justify-between px-5 py-4 md:px-10 md:py-6">
      <Link href="/" className="font-bold text-[0.9rem] tracking-tight text-text-primary no-underline">
        Kevin Lee
      </Link>

      {/* Hamburger */}
      <button
        className="md:hidden flex flex-col justify-center gap-[6px] w-9 h-9 bg-transparent border-none p-2 z-[1001]"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
      >
        <span
          className={`w-full h-[1.5px] bg-text-primary transition-all duration-300 origin-center ${
            menuOpen ? "translate-y-[3.75px] rotate-45" : ""
          }`}
        />
        <span
          className={`w-full h-[1.5px] bg-text-primary transition-all duration-300 origin-center ${
            menuOpen ? "-translate-y-[3.75px] -rotate-45" : ""
          }`}
        />
      </button>

      {/* Nav Links */}
      <div
        className={`
          md:flex md:items-center md:gap-8 md:static md:w-auto md:h-auto md:bg-transparent md:flex-row
          fixed top-0 w-full h-screen bg-bg flex-col items-center justify-center gap-8 z-[1000]
          transition-[right] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${menuOpen ? "flex right-0" : "hidden md:flex right-[-100%]"}
        `}
      >
        <a href="#work" onClick={handleLinkClick} className="text-text-secondary no-underline text-[0.8rem] font-medium tracking-wide hover:text-text-primary transition-colors duration-300 md:text-[0.8rem] text-xl">
          Work
        </a>
        <a href="#about" onClick={handleLinkClick} className="text-text-secondary no-underline text-[0.8rem] font-medium tracking-wide hover:text-text-primary transition-colors duration-300 md:text-[0.8rem] text-xl">
          About
        </a>
        <a href="#projects" onClick={handleLinkClick} className="text-text-secondary no-underline text-[0.8rem] font-medium tracking-wide hover:text-text-primary transition-colors duration-300 md:text-[0.8rem] text-xl">
          Projects
        </a>
        <a href="#connect" onClick={handleLinkClick} className="text-text-secondary no-underline text-[0.8rem] font-medium tracking-wide hover:text-text-primary transition-colors duration-300 md:text-[0.8rem] text-xl">
          Connect
        </a>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-full border border-border bg-transparent flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-text-muted transition-all duration-300"
          aria-label="Toggle dark mode"
        >
          <svg className="w-4 h-4 hidden dark:block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <svg className="w-4 h-4 block dark:hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
