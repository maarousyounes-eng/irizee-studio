// Types de visuel du Shooting : partagé entre le formulaire (client) et la génération (serveur).

export type VisualType = "photo" | "social" | "ad" | "carousel" | "ba" | "free";

export const VISUAL_TYPES: { id: VisualType; name: string; desc: string }[] = [
  { id: "photo", name: "Shooting photo", desc: "Photos produit ou mannequin, comme avant." },
  { id: "social", name: "Visuel réseaux", desc: "Post organique : naturel, esthétique, sans air de pub." },
  { id: "ad", name: "Visuel pub", desc: "Pub payante : produit en vedette, zone vide pour le texte." },
  { id: "carousel", name: "Carrousel", desc: "3 à 10 images qui se suivent, même style et même mannequin." },
  { id: "ba", name: "Avant / après", desc: "Même personne, même cadrage : seule la peau change." },
  { id: "free", name: "Libre", desc: "Décrivez n'importe quelle image, avec ou sans produit." },
];

export const isVisualType = (x: unknown): x is VisualType => VISUAL_TYPES.some((t) => t.id === x);
export const typeName = (x: string | null | undefined) => VISUAL_TYPES.find((t) => t.id === x)?.name ?? "Shooting photo";

export const SOCIAL_STYLES: { id: string; label: string; en: string }[] = [
  { id: "feed", label: "Feed esthétique", en: "an aesthetic, curated Instagram feed photo: natural soft light, harmonious colours, authentic and elegant, never a studio advertising look" },
  { id: "ugc", label: "Spontané, style smartphone", en: "a spontaneous smartphone photo (UGC style): shot on a phone, candid, natural slightly imperfect framing, real home setting, still sharp and flattering" },
  { id: "life", label: "Lifestyle", en: "a lifestyle photo: a real moment of daily life in a natural setting, candid and warm" },
  { id: "flat", label: "Flat lay (vue du dessus)", en: "a flat lay: top-down view of objects arranged on a surface, graphic, balanced and aesthetic" },
];

export const TEXT_ZONES: { id: string; label: string; en: string }[] = [
  { id: "top", label: "Haut", en: "the top third" },
  { id: "bottom", label: "Bas", en: "the bottom third" },
  { id: "left", label: "Gauche", en: "the left side" },
  { id: "right", label: "Droite", en: "the right side" },
  { id: "none", label: "Pas de zone", en: "" },
];

export const BA_CHANGES: { id: string; label: string; before: string; after: string }[] = [
  { id: "terne", label: "Teint terne → lumineux", before: "a dull, tired, uneven-looking complexion lacking radiance", after: "a fresh, radiant, luminous complexion" },
  { id: "taches", label: "Taches → teint unifié", before: "visible dark spots and uneven pigmentation", after: "a more even skin tone with the dark spots faded (still natural, not erased)" },
  { id: "imperf", label: "Imperfections → peau nette", before: "a few visible blemishes and some redness", after: "clearer, calmer skin with less redness" },
  { id: "autre", label: "Autre (à décrire)", before: "", after: "" },
];

export interface TypeParams {
  socialStyle?: string;
  textZone?: string;
  slides?: string[];
  baChange?: string;
  baBefore?: string;
  baAfter?: string;
}

/** Libellé d'une image selon le type du shooting (Slide 3, Avant, Après…). */
export function imageLabel(type: string | null | undefined, variantIndex: number) {
  if (type === "carousel") return `Slide ${variantIndex + 1}`;
  if (type === "ba") return `${variantIndex % 2 === 0 ? "Avant" : "Après"} · paire ${Math.floor(variantIndex / 2) + 1}`;
  return null;
}
