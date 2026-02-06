export interface AdviceSubmission {
  id: string;
  image_url: string;
  cloudinary_id: string;
  ai_generated_text: string;
  submitter_note: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_at: string | null;
  created_at: string;
}
