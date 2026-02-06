"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getCloudinaryUrl, PHOTO_CATEGORIES, PHOTO_SECTIONS } from "@/lib/cloudinary";
import type { Photo } from "@/types/photo";
import type { AdviceSubmission } from "@/types/advice";

export default function AdminPage() {
  const [session, setSession] = useState<{ user: { email: string } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sectionFilter, setSectionFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editPhoto, setEditPhoto] = useState<Photo | null>(null);
  const [deletePhoto, setDeletePhoto] = useState<Photo | null>(null);
  const [adviceQueue, setAdviceQueue] = useState<AdviceSubmission[]>([]);
  const [editAdvice, setEditAdvice] = useState<AdviceSubmission | null>(null);
  const [activeTab, setActiveTab] = useState<"photos" | "advice">("photos");

  // Check session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession({ user: { email: data.session.user.email || "" } });
      }
      setLoading(false);
    });
  }, []);

  // Load photos
  const loadPhotos = useCallback(async () => {
    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .order("section")
      .order("display_order");
    if (!error && data) setPhotos(data);
  }, []);

  // Load advice submissions
  const loadAdvice = useCallback(async () => {
    const { data, error } = await supabase
      .from("advice_submissions")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setAdviceQueue(data);
  }, []);

  useEffect(() => {
    if (session) {
      loadPhotos();
      loadAdvice();
    }
  }, [session, loadPhotos, loadAdvice]);

  // Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoginError(error.message);
      return;
    }
    setSession({ user: { email: data.user.email || "" } });
  };

  // Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setPhotos([]);
  };

  // Upload
  const handleUpload = async (files: FileList, section: string, category: string) => {
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "portfolio_unsigned");
      formData.append("folder", "portfolio");

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
      );
      const data = await res.json();

      await supabase.from("photos").insert({
        cloudinary_id: data.public_id,
        cloudinary_url: data.secure_url,
        title: file.name.replace(/\.[^.]+$/, ""),
        section: section || "gallery",
        category: category || null,
        display_order: photos.length,
      });
    }
    loadPhotos();
  };

  // Delete
  const confirmDelete = async () => {
    if (!deletePhoto) return;
    await supabase.from("photos").delete().eq("id", deletePhoto.id);
    setDeletePhoto(null);
    loadPhotos();
  };

  // Save edit
  const saveEdit = async () => {
    if (!editPhoto) return;
    await supabase
      .from("photos")
      .update({
        title: editPhoto.title,
        alt_text: editPhoto.alt_text,
        section: editPhoto.section,
        category: editPhoto.category,
        featured: editPhoto.featured,
      })
      .eq("id", editPhoto.id);
    setEditPhoto(null);
    loadPhotos();
  };

  // Advice actions
  const handleAdviceAction = async (id: string, status: "approved" | "rejected") => {
    await supabase
      .from("advice_submissions")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    loadAdvice();
  };

  const saveAdviceEdit = async () => {
    if (!editAdvice) return;
    await supabase
      .from("advice_submissions")
      .update({ ai_generated_text: editAdvice.ai_generated_text })
      .eq("id", editAdvice.id);
    setEditAdvice(null);
    loadAdvice();
  };

  const deleteAdvice = async (id: string) => {
    await supabase.from("advice_submissions").delete().eq("id", id);
    loadAdvice();
  };

  const pendingAdvice = adviceQueue.filter((a) => a.status === "pending");
  const reviewedAdvice = adviceQueue.filter((a) => a.status !== "pending");

  // Filtered photos
  const filtered = photos.filter((p) => {
    if (sectionFilter && p.section !== sectionFilter) return false;
    if (categoryFilter && p.category !== categoryFilter) return false;
    return true;
  });

  const stats = {
    total: photos.length,
    gallery: photos.filter((p) => p.section === "gallery").length,
    bento: photos.filter((p) => p.section === "bento").length,
    featured: photos.filter((p) => p.featured).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-[#7a7a75]">Loading...</p>
      </div>
    );
  }

  // Login screen
  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold mb-2">Kevin Lee Admin</h1>
          <p className="text-[#7a7a75] text-sm mb-8">Sign in to manage your portfolio photos</p>
          {loginError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {loginError}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-[#a0a0a0]">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#111] border border-[#222] rounded-lg text-[#f0f0f0] focus:outline-none focus:border-[#3b82f6] transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-[#a0a0a0]">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#111] border border-[#222] rounded-lg text-[#f0f0f0] focus:outline-none focus:border-[#3b82f6] transition-colors"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-[#3b82f6] text-white rounded-lg font-medium hover:bg-[#2563eb] transition-colors"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-8 pb-4 border-b border-[#222]">
        <h1 className="text-xl font-semibold">Portfolio Admin</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#7a7a75]">{session.user.email}</span>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-sm border border-[#222] rounded-lg hover:border-[#444] transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          { label: "Total Photos", value: stats.total },
          { label: "Gallery", value: stats.gallery },
          { label: "Bento Grid", value: stats.bento },
          { label: "Featured", value: stats.featured },
          { label: "Pending Advice", value: pendingAdvice.length },
        ].map((stat) => (
          <div key={stat.label} className={`p-4 bg-[#111] border rounded-xl ${stat.label === "Pending Advice" && stat.value > 0 ? "border-amber-500/40" : "border-[#222]"}`}>
            <p className="text-xs text-[#7a7a75] mb-1">{stat.label}</p>
            <p className="text-2xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-[#222]">
        <button
          onClick={() => setActiveTab("photos")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors -mb-px ${
            activeTab === "photos"
              ? "text-[#f0f0f0] border-b-2 border-[#3b82f6]"
              : "text-[#7a7a75] hover:text-[#a0a0a0]"
          }`}
        >
          Photos
        </button>
        <button
          onClick={() => setActiveTab("advice")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors -mb-px flex items-center gap-2 ${
            activeTab === "advice"
              ? "text-[#f0f0f0] border-b-2 border-[#3b82f6]"
              : "text-[#7a7a75] hover:text-[#a0a0a0]"
          }`}
        >
          Advice Review
          {pendingAdvice.length > 0 && (
            <span className="px-1.5 py-0.5 text-[0.65rem] bg-amber-500/20 text-amber-400 rounded-full">
              {pendingAdvice.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "advice" && (
        <>
          {/* Pending Queue */}
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-4">Pending Submissions</h2>
            {pendingAdvice.length === 0 ? (
              <div className="text-center py-12 bg-[#111] border border-[#222] rounded-xl">
                <p className="text-[#7a7a75]">No pending submissions</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingAdvice.map((item) => (
                  <div key={item.id} className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
                    <div className="flex flex-col md:flex-row">
                      <div className="md:w-64 flex-shrink-0">
                        <img
                          src={item.image_url}
                          alt=""
                          className="w-full h-48 md:h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 p-5">
                        <div className="flex items-start justify-between mb-3">
                          <p className="text-xs text-[#7a7a75]">
                            {new Date(item.created_at).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <span className="text-[0.65rem] px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full">
                            pending
                          </span>
                        </div>
                        <p className="text-[#f0f0f0] leading-relaxed mb-2">
                          &ldquo;{item.ai_generated_text}&rdquo;
                        </p>
                        {item.submitter_note && (
                          <p className="text-xs text-[#7a7a75] mb-3">
                            Note: {item.submitter_note}
                          </p>
                        )}
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={() => handleAdviceAction(item.id, "approved")}
                            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAdviceAction(item.id, "rejected")}
                            className="px-4 py-2 text-sm bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => setEditAdvice({ ...item })}
                            className="px-4 py-2 text-sm border border-[#222] rounded-lg hover:border-[#444] transition-colors"
                          >
                            Edit Text
                          </button>
                          <button
                            onClick={() => deleteAdvice(item.id)}
                            className="px-4 py-2 text-sm text-[#555] hover:text-red-400 transition-colors ml-auto"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Previously Reviewed */}
          {reviewedAdvice.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4">Previously Reviewed</h2>
              <div className="space-y-3">
                {reviewedAdvice.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 bg-[#111] border border-[#222] rounded-xl p-4">
                    <img
                      src={item.image_url}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#f0f0f0] truncate">{item.ai_generated_text}</p>
                      <p className="text-xs text-[#7a7a75] mt-1">
                        {item.reviewed_at && new Date(item.reviewed_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`text-[0.65rem] px-2 py-0.5 rounded-full flex-shrink-0 ${
                      item.status === "approved"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                    }`}>
                      {item.status}
                    </span>
                    <button
                      onClick={() => deleteAdvice(item.id)}
                      className="text-xs text-[#555] hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {activeTab === "photos" && (
        <>
      {/* Upload */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Upload Photos</h2>
        <div
          className="border-2 border-dashed border-[#222] rounded-xl p-8 text-center hover:border-[#444] transition-colors cursor-pointer"
          onClick={() => document.getElementById("fileInput")?.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-[#3b82f6]"); }}
          onDragLeave={(e) => { e.currentTarget.classList.remove("border-[#3b82f6]"); }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove("border-[#3b82f6]");
            if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files, "gallery", "");
          }}
        >
          <input
            type="file"
            id="fileInput"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleUpload(e.target.files, "gallery", "");
            }}
          />
          <p className="text-2xl mb-2">📷</p>
          <p className="text-[#a0a0a0]">Drop images here or click to upload</p>
          <p className="text-xs text-[#555] mt-1">Supports JPG, PNG, WebP (max 10MB each)</p>
        </div>
      </section>

      {/* Filter & Photos */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Manage Photos</h2>
          <div className="flex gap-2">
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#111] border border-[#222] rounded-lg text-sm text-[#f0f0f0] focus:outline-none"
            >
              <option value="">All Sections</option>
              {PHOTO_SECTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#111] border border-[#222] rounded-lg text-sm text-[#f0f0f0] focus:outline-none"
            >
              <option value="">All Categories</option>
              {PHOTO_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-2xl mb-2">📷</p>
            <p className="text-[#7a7a75]">No photos yet</p>
            <p className="text-xs text-[#555]">Upload some photos to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((photo) => (
              <div key={photo.id} className="group relative bg-[#111] border border-[#222] rounded-xl overflow-hidden">
                <div className="aspect-[4/3] overflow-hidden">
                  <img
                    src={getCloudinaryUrl(photo.cloudinary_id, { width: 400, height: 300, crop: "fill" })}
                    alt={photo.alt_text || photo.title || ""}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium truncate">{photo.title || "Untitled"}</p>
                  <div className="flex gap-1.5 mt-1.5">
                    <span className="text-[0.65rem] px-2 py-0.5 bg-[#1a1a1a] rounded-full text-[#a0a0a0]">{photo.section}</span>
                    {photo.category && (
                      <span className="text-[0.65rem] px-2 py-0.5 bg-[#1a1a1a] rounded-full text-[#a0a0a0]">{photo.category}</span>
                    )}
                  </div>
                </div>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditPhoto({ ...photo })}
                    className="p-1.5 bg-[#111]/80 backdrop-blur-sm rounded-lg text-xs hover:bg-[#222] transition-colors"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setDeletePhoto(photo)}
                    className="p-1.5 bg-[#111]/80 backdrop-blur-sm rounded-lg text-xs hover:bg-red-500/20 transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
        </>
      )}

      {/* Edit Advice Modal */}
      {editAdvice && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setEditAdvice(null)}>
          <div className="bg-[#111] border border-[#222] rounded-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Edit Advice Text</h2>
              <button onClick={() => setEditAdvice(null)} className="text-[#7a7a75] hover:text-white text-xl">&times;</button>
            </div>
            <img
              src={editAdvice.image_url}
              alt=""
              className="w-full h-48 object-cover rounded-xl mb-4"
            />
            <textarea
              value={editAdvice.ai_generated_text}
              onChange={(e) => setEditAdvice({ ...editAdvice, ai_generated_text: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-lg text-[#f0f0f0] focus:outline-none focus:border-[#3b82f6] resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditAdvice(null)}
                className="px-4 py-2 text-sm border border-[#222] rounded-lg hover:border-[#444] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveAdviceEdit}
                className="px-4 py-2 text-sm bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editPhoto && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setEditPhoto(null)}>
          <div className="bg-[#111] border border-[#222] rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Edit Photo</h2>
              <button onClick={() => setEditPhoto(null)} className="text-[#7a7a75] hover:text-white text-xl">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[#a0a0a0]">Title</label>
                <input
                  type="text"
                  value={editPhoto.title || ""}
                  onChange={(e) => setEditPhoto({ ...editPhoto, title: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-lg text-[#f0f0f0] focus:outline-none focus:border-[#3b82f6]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[#a0a0a0]">Alt Text</label>
                <textarea
                  value={editPhoto.alt_text || ""}
                  onChange={(e) => setEditPhoto({ ...editPhoto, alt_text: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-lg text-[#f0f0f0] focus:outline-none focus:border-[#3b82f6] resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[#a0a0a0]">Section</label>
                <select
                  value={editPhoto.section}
                  onChange={(e) => setEditPhoto({ ...editPhoto, section: e.target.value as Photo["section"] })}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-lg text-[#f0f0f0] focus:outline-none"
                >
                  {PHOTO_SECTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[#a0a0a0]">Category</label>
                <select
                  value={editPhoto.category || ""}
                  onChange={(e) => setEditPhoto({ ...editPhoto, category: e.target.value || null })}
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-lg text-[#f0f0f0] focus:outline-none"
                >
                  <option value="">None</option>
                  {PHOTO_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editPhoto.featured}
                  onChange={(e) => setEditPhoto({ ...editPhoto, featured: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Featured Photo</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setEditPhoto(null)}
                className="px-4 py-2 text-sm border border-[#222] rounded-lg hover:border-[#444] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="px-4 py-2 text-sm bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletePhoto && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setDeletePhoto(null)}>
          <div className="bg-[#111] border border-[#222] rounded-2xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-3xl mb-3">⚠️</p>
            <h3 className="text-lg font-semibold mb-2">Delete Photo</h3>
            <p className="text-sm text-[#7a7a75] mb-6">
              Are you sure you want to delete <strong className="text-[#f0f0f0]">{deletePhoto.title || "Untitled"}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setDeletePhoto(null)}
                className="px-4 py-2 text-sm border border-[#222] rounded-lg hover:border-[#444] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
