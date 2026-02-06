"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import imageCompression from "browser-image-compression";
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

type UploadStep = "pick" | "preview" | "compressing" | "uploading" | "analyzing" | "result";

export function ArticleClient({ slug }: { slug: string }) {
  const [approved, setApproved] = useState<ApprovedAdvice[]>([]);
  const [step, setStep] = useState<UploadStep>("pick");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ advice: string } | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [statusText, setStatusText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/advice/approved")
      .then((res) => res.json())
      .then((data) => {
        if (data.advice) setApproved(data.advice);
      })
      .catch(() => {});
  }, []);

  const selectFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Image must be under 20MB.");
      return;
    }

    setError("");
    setPreview(URL.createObjectURL(file));
    setStep("preview");

    // Compress in background for faster upload later
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 2048,
        useWebWorker: true,
        fileType: "image/jpeg",
      });
      setSelectedFile(compressed);
    } catch {
      // Fallback to original if compression fails
      setSelectedFile(file);
    }
  };

  const submitPhoto = async () => {
    if (!selectedFile) return;
    setError("");

    // Upload phase
    setStep("uploading");
    setStatusText("Uploading your photo...");

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (note.trim()) formData.append("note", note.trim());

    try {
      // Switch to analyzing after a short delay (upload + analysis happen server-side)
      const analyzeTimer = setTimeout(() => {
        setStep("analyzing");
        setStatusText("Generating advice from your photo...");
      }, 2000);

      const res = await fetch("/api/advice", {
        method: "POST",
        body: formData,
      });
      clearTimeout(analyzeTimer);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setStep("preview");
      } else {
        setResult({ advice: data.advice });
        setStep("result");
      }
    } catch {
      setError("Failed to submit. Check your connection and try again.");
      setStep("preview");
    }
  };

  const resetUpload = () => {
    setStep("pick");
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    setError("");
    setNote("");
    setStatusText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) selectFile(file);
  };

  if (slug !== "advice") return null;

  const isProcessing = step === "compressing" || step === "uploading" || step === "analyzing";

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="pt-24 pb-6 px-5 md:px-10 max-w-2xl mx-auto">
        <RevealOnScroll>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.12em] uppercase text-text-muted no-underline hover:text-text-primary transition-colors duration-300 mb-10 py-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Home
          </Link>
        </RevealOnScroll>

        <RevealOnScroll>
          <h1 className="text-[2.5rem] md:text-5xl font-black tracking-tight leading-[1.1] mb-3">
            Timeless Advice
          </h1>
          <p className="text-text-secondary text-[1.05rem] leading-relaxed">
            Wisdom collected over the years — now with AI.
          </p>
        </RevealOnScroll>
      </div>

      {/* 2026 — Storyboard */}
      <section className="mt-10 mb-12">
        <div className="px-5 md:px-10 max-w-2xl mx-auto mb-6">
          <RevealOnScroll>
            <h2 className="text-[0.65rem] font-semibold tracking-[0.18em] uppercase text-text-muted">
              2026
            </h2>
          </RevealOnScroll>
        </div>

        {approved.length > 0 ? (
          <div className="space-y-3 md:space-y-5 md:px-10 md:max-w-2xl md:mx-auto">
            {approved.map((item, i) => (
              <RevealOnScroll key={item.id}>
                <div className="relative overflow-hidden md:rounded-2xl group">
                  {/* Full-bleed image — portrait on mobile, landscape on desktop */}
                  <div className="aspect-[3/4] sm:aspect-[4/3] md:aspect-[16/10]">
                    <img
                      src={item.image_url}
                      alt=""
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                      loading={i === 0 ? "eager" : "lazy"}
                    />
                  </div>
                  {/* Gradient text overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent flex items-end">
                    <div className="p-5 md:p-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-10 w-full">
                      <p className="text-white/90 text-[1.1rem] md:text-xl leading-[1.5] font-medium drop-shadow-lg">
                        &ldquo;{item.ai_generated_text}&rdquo;
                      </p>
                    </div>
                  </div>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        ) : (
          <div className="px-5 md:px-10 max-w-2xl mx-auto">
            <RevealOnScroll>
              <p className="text-text-muted text-sm">
                No advice yet for 2026. Be the first to contribute.
              </p>
            </RevealOnScroll>
          </div>
        )}
      </section>

      {/* Upload Card */}
      <div className="px-5 md:px-10 max-w-2xl mx-auto mb-20">
        <RevealOnScroll>
          <div className="rounded-2xl border border-border bg-bg-alt overflow-hidden">

            {/* ── Step: Pick ── */}
            {step === "pick" && (
              <div className="p-5 md:p-8">
                <h3 className="text-[0.95rem] font-semibold mb-0.5">
                  Submit a Photo
                </h3>
                <p className="text-[0.8rem] text-text-secondary leading-relaxed mb-6">
                  Upload a meaningful photo and AI will generate timeless advice
                  inspired by it. Reviewed before publishing.
                </p>

                {/* Hidden inputs */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) selectFile(file);
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) selectFile(file);
                  }}
                />

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-3 min-h-[52px] py-3.5 px-5 rounded-xl border border-border bg-bg text-text-primary text-[0.875rem] font-medium active:scale-[0.97] active:bg-bg-alt transition-all duration-150"
                  >
                    <svg className="w-5 h-5 text-text-secondary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                    </svg>
                    Choose from Library
                  </button>
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-3 min-h-[52px] py-3.5 px-5 rounded-xl border border-border bg-bg text-text-primary text-[0.875rem] font-medium active:scale-[0.97] active:bg-bg-alt transition-all duration-150 sm:hidden"
                  >
                    <svg className="w-5 h-5 text-text-secondary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                    </svg>
                    Take a Photo
                  </button>
                </div>

                {/* Desktop drag-and-drop */}
                <div
                  className={`hidden sm:flex mt-3 border-2 border-dashed rounded-xl py-5 text-center cursor-pointer transition-colors duration-200 flex-col items-center justify-center ${
                    dragOver
                      ? "border-text-primary bg-bg"
                      : "border-border hover:border-text-muted"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <p className="text-text-muted text-xs">
                    or drag and drop an image here
                  </p>
                </div>

                {error && (
                  <p className="text-[0.8rem] text-red-500 mt-4">{error}</p>
                )}
              </div>
            )}

            {/* ── Step: Preview ── */}
            {step === "preview" && preview && (
              <div>
                <div className="relative bg-black">
                  <div className="aspect-[3/4] sm:aspect-[4/3]">
                    <img
                      src={preview}
                      alt="Selected photo"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  {/* iOS-style back chevron */}
                  <button
                    onClick={resetUpload}
                    className="absolute top-4 left-4 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center bg-black/40 backdrop-blur-md rounded-full text-white active:bg-black/60 transition-colors"
                    aria-label="Go back"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                </div>

                <div className="p-5 md:p-6">
                  <div className="mb-5">
                    <label
                      htmlFor="noteInput"
                      className="block text-[0.75rem] font-medium text-text-secondary mb-2"
                    >
                      Add a note (optional)
                    </label>
                    <input
                      id="noteInput"
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="What makes this photo meaningful?"
                      className="w-full px-4 py-3.5 rounded-xl bg-bg border border-border text-text-primary text-base leading-normal focus:outline-none focus:border-text-muted transition-colors duration-200"
                    />
                  </div>

                  {error && (
                    <p className="text-[0.8rem] text-red-500 mb-4">{error}</p>
                  )}

                  <button
                    onClick={submitPhoto}
                    className="w-full min-h-[50px] py-3.5 bg-text-primary text-bg rounded-xl font-semibold text-[0.875rem] active:scale-[0.98] active:opacity-90 transition-all duration-150"
                  >
                    Generate Advice
                  </button>
                </div>
              </div>
            )}

            {/* ── Step: Processing (uploading / analyzing) ── */}
            {isProcessing && preview && (
              <div>
                <div className="relative bg-black">
                  <div className="aspect-[3/4] sm:aspect-[4/3]">
                    <img
                      src={preview}
                      alt="Processing"
                      className="w-full h-full object-contain opacity-50 transition-opacity duration-500"
                    />
                  </div>
                  {/* Centered spinner */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
                    <div className="relative w-12 h-12">
                      <div className="absolute inset-0 border-[2.5px] border-white/15 rounded-full" />
                      <div className="absolute inset-0 border-[2.5px] border-transparent border-t-white rounded-full animate-spin" />
                    </div>
                    <p className="text-white/90 text-sm font-medium">
                      {statusText || "Processing..."}
                    </p>
                  </div>
                </div>
                {/* Step indicator */}
                <div className="p-5">
                  <div className="flex gap-1.5">
                    <div className="flex-1 h-1 rounded-full bg-text-primary" />
                    <div className={`flex-1 h-1 rounded-full transition-colors duration-500 ${
                      step === "analyzing" ? "bg-text-primary" : "bg-border"
                    }`} />
                    <div className="flex-1 h-1 rounded-full bg-border" />
                  </div>
                  <p className="text-[0.7rem] text-text-muted mt-2.5 text-center">
                    {step === "uploading" ? "Step 1 of 3 — Uploading" :
                     step === "analyzing" ? "Step 2 of 3 — AI is thinking" :
                     "Processing..."}
                  </p>
                </div>
              </div>
            )}

            {/* ── Step: Result — storyboard frame ── */}
            {step === "result" && preview && result && (
              <div>
                <div className="relative">
                  <div className="aspect-[3/4] sm:aspect-[4/3]">
                    <img
                      src={preview}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent flex items-end">
                    <div className="p-5 md:p-8 pb-6 md:pb-10 w-full">
                      <p className="text-[0.6rem] font-semibold tracking-[0.18em] uppercase text-white/50 mb-2.5">
                        AI-Generated Advice
                      </p>
                      <p className="text-white/90 text-[1.1rem] md:text-xl leading-[1.55] font-medium drop-shadow-lg">
                        &ldquo;{result.advice}&rdquo;
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-5 md:p-6 flex flex-col items-center">
                  {/* Success indicator */}
                  <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <p className="text-[0.8rem] text-text-secondary text-center mb-5">
                    Queued for review. Thank you!
                  </p>
                  <button
                    onClick={resetUpload}
                    className="min-h-[44px] py-2.5 px-6 rounded-xl border border-border text-[0.875rem] font-medium text-text-primary active:scale-[0.97] active:bg-bg transition-all duration-150"
                  >
                    Submit another photo
                  </button>
                </div>
              </div>
            )}

          </div>
        </RevealOnScroll>
      </div>

      {/* 2021 Advice */}
      <section className="px-5 md:px-10 max-w-2xl mx-auto mb-20">
        <RevealOnScroll>
          <h2 className="text-[0.65rem] font-semibold tracking-[0.18em] uppercase text-text-muted mb-6">
            2021
          </h2>
        </RevealOnScroll>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {adviceData["2021"].map((item, i) => (
            <RevealOnScroll key={i}>
              <div className="p-5 rounded-xl border border-border bg-bg-alt">
                <p className="text-[1.05rem] leading-[1.6]">&ldquo;{item}&rdquo;</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>
    </div>
  );
}
