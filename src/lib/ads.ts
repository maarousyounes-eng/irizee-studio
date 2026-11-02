// Module Ads : constantes partagées (client + serveur).

export interface AdGoogle { headlines: string[]; long_headline: string; descriptions: string[] }
export interface AdTexts {
  name?: string;
  hook: string;
  headline: string;
  primary_text: string;
  cta: string;
  badge: string;
  bullets: string[];
  quote: string;
  quote_author: string;
  tiktok_caption: string;
  google: AdGoogle;
}
export interface AdRow {
  id: string; created_at: string; product_id: string | null; idea: string; source_path: string | null;
  angles: AdTexts[]; angle: number; texts: AdTexts; template: string; fonts: string; palette: string;
  focus: { x: number; y: number }; review_status: "draft" | "pending" | "approved" | "rejected";
}

export const EMPTY_TEXTS: AdTexts = {
  hook: "", headline: "", primary_text: "", cta: "Découvrir", badge: "", bullets: [], quote: "", quote_author: "",
  tiktok_caption: "", google: { headlines: [], long_headline: "", descriptions: [] },
};

export const CTAS = ["Découvrir", "Acheter", "Commander", "En savoir plus", "Essayer"];

/** Formats exportés. */
export const AD_FORMATS = [
  { key: "1x1", label: "Carré 1:1", w: 1080, h: 1080, use: "Meta fil · Google" },
  { key: "4x5", label: "Portrait 4:5", w: 1080, h: 1350, use: "Meta fil (recommandé)" },
  { key: "9x16", label: "Vertical 9:16", w: 1080, h: 1920, use: "Stories · Reels · TikTok" },
  { key: "191x1", label: "Paysage 1.91:1", w: 1200, h: 628, use: "Google Display · Meta lien" },
] as const;
export type AdFormat = (typeof AD_FORMATS)[number];

/** Fichiers du ZIP : format → noms par plateforme. */
export const EXPORTS: { format: AdFormat["key"]; file: string }[] = [
  { format: "1x1", file: "meta/fil-1x1.png" },
  { format: "4x5", file: "meta/fil-4x5.png" },
  { format: "9x16", file: "meta/stories-reels-9x16.png" },
  { format: "9x16", file: "tiktok/9x16.png" },
  { format: "191x1", file: "google/paysage-1.91x1.png" },
  { format: "1x1", file: "google/carre-1x1.png" },
];

export const FONT_PAIRS: Record<string, { label: string; title: string; titleWeight: number; body: string; desc: string }> = {
  elegant: { label: "Élégant", title: "'Playfair Display', serif", titleWeight: 700, body: "'Inter', sans-serif", desc: "Serif chic + texte net" },
  bold: { label: "Impact", title: "'Archivo Black', sans-serif", titleWeight: 400, body: "'Inter', sans-serif", desc: "Gros titre percutant" },
  soft: { label: "Doux", title: "'Fraunces', serif", titleWeight: 600, body: "'DM Sans', sans-serif", desc: "Arrondi et chaleureux" },
};

export const PALETTES: Record<string, { label: string; text: string; panel: string; accent: string; accentText: string; shade: string }> = {
  light: { label: "Blanc", text: "#0A0A0B", panel: "#FFFFFF", accent: "#0A0A0B", accentText: "#FFFFFF", shade: "rgba(255,255,255,0.92)" },
  dark: { label: "Noir", text: "#FFFFFF", panel: "#0A0A0B", accent: "#FFFFFF", accentText: "#0A0A0B", shade: "rgba(0,0,0,0.62)" },
  blue: { label: "Bleu", text: "#FFFFFF", panel: "#2B6EE8", accent: "#FFFFFF", accentText: "#2B6EE8", shade: "rgba(20,60,160,0.62)" },
  sand: { label: "Sable", text: "#2A2420", panel: "#F3EDE4", accent: "#2A2420", accentText: "#F3EDE4", shade: "rgba(243,237,228,0.92)" },
};

export const TEMPLATES: Record<string, { label: string; desc: string }> = {
  hook: { label: "Accroche", desc: "Grande accroche en haut, bouton en bas" },
  promo: { label: "Promo", desc: "Pastille (ex. -20 %) + bandeau titre" },
  benefits: { label: "Bénéfices", desc: "Photo + 3 bénéfices cochés" },
  review: { label: "Avis client", desc: "Carte avec un vrai avis (que vous fournissez)" },
  tiktok: { label: "Style TikTok", desc: "Sous-titre au centre, ton natif" },
};

/** Zones à éviter en 9:16 (interface d'Instagram / TikTok) : haut, bas, droite (boutons). */
export const SAFE_9x16 = { top: 0.14, bottom: 0.22, side: 0.06, right: 0.16 };
