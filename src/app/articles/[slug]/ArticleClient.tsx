"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { RevealOnScroll } from "@/components/ui/RevealOnScroll";

const adviceData = {
  "2021": [
    "Stop worrying about the small, meaningless stresses in life. Make time for what matters.",
    "Find solace in nature. It's where creativity thrives.",
  ],
};

interface ApprovedAdvice {
  id: string;
  image_url: string;
  ai_generated_text: string;
  created_at: string;
}

export function ArticleClient({ slug }: { slug: string }) {
  const [approved, setApproved] = useState<ApprovedAdvice[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ advice: string } | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch approved advice
  useEffect(() => {
    fetch("/api/advice/approved")
      .then((res) => res.json())
      .then((data) => {
        if (data.advice) setApproved(data.advice);
      })
      .catch(() => {});
  }, []);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10MB.");
      return;
    }

    // Show preview
    const url = URL.createObjectURL(file);
    setPreview(url);
    setError("");
    setResult(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    if (note.trim()) formData.append("note", note.trim());

    try {
      const res = await fetch("/api/advice", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
      } else {
        setResult({ advice: data.advice });
        setNote("");
      }
    } catch {
      setError("Failed to submit. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const resetUpload = () => {
    setPreview(null);
    setResult(null);
    setError("");
    setNote("");
    if (fileInputRef.current) fileInputRef.current.value = "";
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

      {/* 2026 — AI-Generated Advice */}
      <section className="mb-16">
        <RevealOnScroll>
          <h2 className="text-xs font-medium tracking-[0.12em] uppercase text-text-muted mb-8">
            Timeless Advice from 2026
          </h2>
        </RevealOnScroll>

        {approved.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 mb-10">
            {approved.map((item) => (
              <RevealOnScroll key={item.id}>
                <div className="rounded-xl border border-border bg-bg-alt overflow-hidden">
                  <div className="aspect-[16/9] overflow-hidden">
                    <img
                      src={item.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-6">
                    <p className="text-lg leading-relaxed">
                      &ldquo;{item.ai_generated_text}&rdquo;
                    </p>
                  </div>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        ) : (
          <RevealOnScroll>
            <p className="text-text-secondary text-sm mb-10">
              No advice yet for 2026. Be the first to contribute!
            </p>
          </RevealOnScroll>
        )}

        {/* Upload Form */}
        <RevealOnScroll>
          <div className="p-6 rounded-xl border border-border bg-bg-alt">
            <h3 className="text-sm font-semibold mb-1">
              Submit a Photo for Advice
            </h3>
            <p className="text-xs text-text-secondary mb-5">
              Upload a meaningful photo and AI will generate timeless advice
              inspired by it. Submissions are reviewed before publishing.
            </p>

            {!preview ? (
              <>
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors duration-300 active:scale-[0.98] active:bg-bg min-h-[140px] flex flex-col items-center justify-center ${
                    dragOver
                      ? "border-text-primary bg-bg"
                      : "border-border hover:border-text-muted"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file);
                    }}
                  />
                  <div className="text-3xl mb-2 opacity-50">+</div>
                  <p className="text-text-secondary text-sm">
                    Drop an image here or tap to upload
                  </p>
                  <p className="text-text-muted text-xs mt-1">
                    JPG, PNG, or WebP &middot; Max 10MB
                  </p>
                </div>

                <div className="mt-4">
                  <label
                    htmlFor="noteInput"
                    className="block text-xs font-medium text-text-secondary mb-2"
                  >
                    Add a note (optional)
                  </label>
                  <input
                    id="noteInput"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What makes this photo meaningful to you?"
                    className="w-full px-4 py-2.5 rounded-lg bg-bg border border-border text-text-primary text-base focus:outline-none focus:border-text-muted transition-colors duration-300"
                  />
                </div>
              </>
            ) : (
              <div>
                {/* Preview */}
                <div className="rounded-xl overflow-hidden mb-4">
                  <img
                    src={preview}
                    alt="Upload preview"
                    className="w-full max-h-64 object-cover"
                  />
                </div>

                {uploading && (
                  <div className="flex items-center gap-3 py-4">
                    <div className="w-5 h-5 border-2 border-text-muted border-t-text-primary rounded-full animate-spin" />
                    <p className="text-sm text-text-secondary">
                      Analyzing your photo...
                    </p>
                  </div>
                )}

                {result && (
                  <div className="py-4">
                    <p className="text-xs font-medium tracking-[0.12em] uppercase text-text-muted mb-3">
                      AI-Generated Advice
                    </p>
                    <p className="text-lg leading-relaxed mb-4">
                      &ldquo;{result.advice}&rdquo;
                    </p>
                    <p className="text-xs text-text-secondary mb-4">
                      Your submission has been queued for review. Thank you!
                    </p>
                    <button
                      onClick={resetUpload}
                      className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-300 py-2 -my-2 active:opacity-70"
                    >
                      Submit another photo &rarr;
                    </button>
                  </div>
                )}

                {error && (
                  <div className="py-4">
                    <p className="text-sm text-red-500 mb-3">{error}</p>
                    <button
                      onClick={resetUpload}
                      className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-300 py-2 -my-2 active:opacity-70"
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </RevealOnScroll>
      </section>

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
    </div>
  );
}
