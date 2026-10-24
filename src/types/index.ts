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
  id: string; project_id: string | null; product_id: string; model_id: string | null; model_ids?: string[]; prompt: string;
  aspect: string; size: string; engine: string; no_people: boolean; product_copies?: string; inspiration_paths: string[];
  analysis: string | null; created_by: string; created_at: string;
}
export interface QC {
  texts: { expected: string; status: "ok" | "wrong" | "unreadable"; read: string }[];
  color_ok: boolean; shape_ok: boolean; foreign_logo: boolean; anatomy_ok: boolean; skin_natural?: boolean; instruction_followed?: boolean; edit_quality_0_10?: number; unchanged?: boolean; human?: { present?: boolean; hands_ok?: boolean; fingers_count_ok?: boolean; grip_ok?: boolean; face_ok?: boolean; limbs_ok?: boolean; body_ok?: boolean; accessories_ok?: boolean }; face_matches_model?: boolean; artifacts_ok?: boolean; issues?: string[]; sharpness_ratio?: number; edit_defects?: string; matches_reference?: boolean; unwanted_changes?: string; ghost_or_duplicate?: boolean; product_count?: number; all_copies_exact?: boolean; label_orientation_ok?: boolean;
  product_height_pct: number; hero_foreground: boolean; proportion_ok: boolean; angle_ok: boolean;
  realism_0_10: number; comment: string;
}
export interface ImageRow {
  id: string; shoot_id: string; parent_id: string | null;
  kind: "generated" | "correction" | "label" | "format";
  version: number; variant_index: number; aspect: string | null; path: string | null; thumb_path?: string | null; deleted_at?: string | null;
  state: "generating" | "done" | "error"; model_used: string | null; params: Record<string, any>;
  qc: QC | null; verdict: "valid" | "review" | "rejected" | null; score: number | null;
  review_status: "draft" | "pending" | "approved" | "rejected";
  feedback: string | null; error: string | null; created_by: string; created_at: string;
}

export const FORMATS: Record<string, { label: string; short: string; usage: string }> = {
  "16:9": { label: "Bannière / hero (16:9)", short: "Hero 16:9", usage: "Site : hero d'accueil, newsletter, diagnostic peau · YouTube" },
  "4:5": { label: "Portrait (4:5)", short: "Portrait 4:5", usage: "Site : cartes produits, blocs image · Post Instagram / TikTok" },
  "1:1": { label: "Carré (1:1)", short: "Carré 1:1", usage: "Site : newsletter, diagnostic peau · fiche produit · pub carrée" },
  "3:4": { label: "Portrait allongé (3:4)", short: "Portrait 3:4", usage: "Site : diagnostic peau · Pinterest, print" },
  "9:16": { label: "Story / Reel (9:16)", short: "Story 9:16", usage: "Stories, Reels, TikTok · hero mobile" },
  "4:3": { label: "Paysage (4:3)", short: "Paysage 4:3", usage: "Diaporama, présentation" },
};

/** Packs prêts à cocher dans « Décliner ». */
export const FORMAT_PACKS: { label: string; hint: string; aspects: string[] }[] = [
  { label: "Pack site Irizée", hint: "hero, cartes produits, blocs image", aspects: ["16:9", "4:5", "1:1", "3:4"] },
  { label: "Pack réseaux", hint: "post, story, carré", aspects: ["4:5", "9:16", "1:1"] },
];
