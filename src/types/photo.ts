export interface Photo {
  id: string;
  cloudinary_id: string;
  cloudinary_url: string;
  title: string | null;
  alt_text: string | null;
  section: "hero" | "featured" | "gallery" | "bento" | "projects";
  category: string | null;
  featured: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}
