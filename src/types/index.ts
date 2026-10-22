export type Role = "admin" | "employee" | "creator";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: Role;
  monthly_quota: number;
}
export interface Product {
  id: string; name: string; texts: string[]; look: string; real_size: string; rules: string[];
  product_images?: { id: string; path: string; position: number }[];
}
export interface Model {
  id: string; name: string; description: string; path: string | null;
  is_brand_model: boolean; state: "draft" | "generating" | "ready" | "error"; error: string | null;
}
export interface Concept {
  id: string; name: string; prompt: string; aspect: string; inspiration_paths: string[]; analysis: string | null;
}
export interface Project { id: string; name: string; description: string }
export interface Shoot {
  id: string; project_id: string | null; product_id: string; model_id: string | null; prompt: string;
  aspect: string; size: string; engine: string; no_people: boolean; inspiration_paths: string[];
  analysis: string | null; created_by: string; created_at: string;
}
export interface QC {
  texts: { expected: string; status: "ok" | "wrong" | "unreadable"; read: string }[];
  color_ok: boolean; shape_ok: boolean; foreign_logo: boolean; anatomy_ok: boolean;
  product_height_pct: number; hero_foreground: boolean; proportion_ok: boolean; angle_ok: boolean;
  realism_0_10: number; comment: string;
}
export interface ImageRow {
  id: string; shoot_id: string; parent_id: string | null;
  kind: "generated" | "correction" | "label" | "format";
  version: number; variant_index: number; aspect: string | null; path: string | null;
  state: "generating" | "done" | "error"; model_used: string | null; params: Record<string, any>;
  qc: QC | null; verdict: "valid" | "review" | "rejected" | null; score: number | null;
  review_status: "draft" | "pending" | "approved" | "rejected";
  feedback: string | null; error: string | null; created_by: string; created_at: string;
}

export const FORMATS: Record<string, { label: string; short: string; usage: string }> = {
  "4:5": { label: "Post Instagram (4:5)", short: "Post 4:5", usage: "Feed Instagram / TikTok" },
  "9:16": { label: "Story / Reel (9:16)", short: "Story 9:16", usage: "Stories, Reels, TikTok" },
  "1:1": { label: "Carré (1:1)", short: "Carré 1:1", usage: "Fiche produit, pub carrée" },
  "16:9": { label: "Bannière site (16:9)", short: "Bannière 16:9", usage: "Site web, en-têtes, YouTube" },
  "3:4": { label: "Portrait (3:4)", short: "Portrait 3:4", usage: "Pinterest, print" },
  "4:3": { label: "Paysage (4:3)", short: "Paysage 4:3", usage: "Diaporama, présentation" },
};
