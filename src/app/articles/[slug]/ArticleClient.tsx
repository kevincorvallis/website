"use client";

import { useState } from "react";
import Link from "next/link";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

const adviceData = {
  "2021": [
    "Stop worrying about the small, meaningless stresses in life. Make time for what matters.",
    "Find solace in nature. It's where creativity thrives.",
  ],
};

export function ArticleClient({ slug }: { slug: string }) {
  const [advice, setAdvice] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advice.trim()) return;
    // Placeholder for future API integration
    setSubmitted(true);
    setAdvice("");
    setTimeout(() => setSubmitted(false), 3000);
  };

  if (slug !== "advice") return null;

  return (
    <div className="min-h-screen pt-24 pb-16 px-5 md:px-10 max-w-2xl mx-auto">
      <RevealOnScroll>
        <Link
          href="/"
          className="text-xs font-medium tracking-[0.12em] uppercase text-text-muted no-underline hover:text-text-primary transition-colors duration-300 mb-12 block"
        >
          &larr; Back to Home
        </Link>
      </RevealOnScroll>

      <RevealOnScroll>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
          Timeless Advice
        </h1>
        <p className="text-text-secondary text-lg mb-16">
          Wisdom collected over the years.
        </p>
      </RevealOnScroll>

      {/* 2021 Advice */}
      <section className="mb-16">
        <RevealOnScroll>
          <h2 className="text-xs font-medium tracking-[0.12em] uppercase text-text-muted mb-8">
            Timeless Advice from 2021
          </h2>
        </RevealOnScroll>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {adviceData["2021"].map((item, i) => (
            <RevealOnScroll key={i}>
              <div className="p-6 rounded-xl border border-border bg-bg-alt">
                <p className="text-lg leading-relaxed">&ldquo;{item}&rdquo;</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      {/* Submit Form */}
      <section>
        <RevealOnScroll>
          <h2 className="text-xs font-medium tracking-[0.12em] uppercase text-text-muted mb-8">
            Add Your Own Timeless Advice
          </h2>
        </RevealOnScroll>
        <RevealOnScroll>
          <form
            onSubmit={handleSubmit}
            className="p-6 rounded-xl border border-border bg-bg-alt"
          >
            <label htmlFor="adviceInput" className="block text-sm font-medium mb-3">
              Your Advice
            </label>
            <textarea
              id="adviceInput"
              value={advice}
              onChange={(e) => setAdvice(e.target.value)}
              className="w-full p-4 rounded-lg bg-bg border border-border text-text-primary resize-none focus:outline-none focus:border-text-muted transition-colors duration-300"
              rows={4}
              required
              placeholder="Share your wisdom..."
            />
            <button
              type="submit"
              className="mt-4 w-full py-3 rounded-lg bg-text-primary text-bg font-medium hover:opacity-90 transition-opacity duration-300"
            >
              Submit Advice
            </button>
            {submitted && (
              <p className="mt-4 text-sm text-text-secondary text-center">
                Thank you for sharing your wisdom!
              </p>
            )}
          </form>
        </RevealOnScroll>
      </section>
    </div>
  );
}
