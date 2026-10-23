import type { Product } from "@/types";

const VARIATIONS = [
  "a young woman with a sharp black bob and fringe",
  "a woman with a sleek slicked-back low bun and bold eyebrows",
  "a woman with short curly textured hair",
  "a woman with a long straight high ponytail",
  "a woman with a platinum pixie cut",
  "a woman with wavy shoulder-length chestnut hair",
  "a man with short cropped hair and a clean look",
  "a woman with braids pulled back",
  "a woman with a voluminous natural afro",
  "a woman with a sleek shoulder-length lob and a side parting",
  "a woman with a shaved side and a long fringe",
  "a woman with a soft low ponytail and natural makeup",
];

export function variationHint(i: number, noPeople: boolean) {
  if (noPeople) return `Variation ${i + 1}: no person in the image. Change small scene details (prop placement, shadow direction, camera tilt) while keeping the same concept.`;
  return `The human model: ${VARIATIONS[i % VARIATIONS.length]} (fictional person, clearly different from anyone in the inspiration).`;
}

/** Réalisme photo : évite le rendu « IA » (peau lisse, sourcils parfaits, brillance plastique). */
export const REALISM =
  "PHOTOGRAPHIC REALISM (critical): this must look like a real photograph shot by a professional photographer on a full-frame camera with an 85mm lens, NOT like an AI render and NOT like a retouched beauty filter. " +
  "Natural skin with clearly visible pores, fine skin texture, subtle unevenness in tone, tiny natural imperfections (a few freckles or beauty marks, faint redness, fine lines, peach fuzz), realistic specular highlights (never plastic, waxy, oily or airbrushed). " +
  "Eyebrows made of individual hairs, with natural asymmetry and a slightly irregular shape. Individual flyaway hairs, natural eyelashes, real lip texture. Slight natural film grain and subtle lens imperfections. " +
  "No airbrushing, no skin smoothing, no glow filter, no doll-like perfection, no perfectly symmetrical face.";

const numbered = (rules: string[]) => rules.map((r, i) => `${i + 1}. ${r}`).join("\n");
const textsBlock = (p: Product) => (p.texts ?? []).map((t) => `- ${t}`).join("\n");

export function buildPrompt(a: {
  product: Product; rules: string[]; userPrompt: string; aspect: string; analysis: string;
  variation: string; nProductImages: number; hasModelRef: boolean; modelDescription?: string; noPeople: boolean;
}) {
  const all = numbered([...a.rules, ...(a.product.rules ?? [])]);
  const people = a.noPeople
    ? "There is no person in the image."
    : a.hasModelRef
      ? `The person in the photo MUST be exactly the same fictional person as in the MODEL REFERENCE image: reproduce that exact face (face shape, eyes, eyebrows, nose, lips, freckles and marks), the same skin tone, age impression and hair colour${a.modelDescription ? `. Description: ${a.modelDescription}` : ""}. Only the outfit, pose and expression come from the brief. Never use the person from the inspiration images.`
      : a.variation;
  return [
    "You are a world-class advertising photographer producing a photorealistic campaign photo for the cosmetics brand Irizée.",
    `The FIRST ${a.nProductImages} image(s) are the REAL product reference photos (packshots) of "${a.product.name}".` +
      (a.hasModelRef ? " The next image is the MODEL REFERENCE (face sheet of a fictional model)." : "") +
      " The remaining image(s) are INSPIRATION references (mood only).",
    "",
    "NON-NEGOTIABLE RULES (apply to every image):",
    all,
    "",
    a.product.look ? `Product appearance: ${a.product.look}` : "",
    a.product.real_size ? `Real-world size: ${a.product.real_size}. Keep this exact scale versus hands and body.` : "",
    a.product.texts?.length ? `Exact printed texts on the product (must be legible and spelled exactly like this):\n${textsBlock(a.product)}` : "",
    "",
    a.analysis ? `Analysis of the inspiration photo (reproduce the concept, not the identity):\n${a.analysis}` : "",
    "",
    `Client brief: ${a.userPrompt}`,
    people,
    "",
    REALISM,
    `Output format: aspect ratio ${a.aspect}. Sharp, professional lighting, no watermark, no added text or captions.`,
  ].filter(Boolean).join("\n");
}

export function correctionPrompt(a: { product: Product; rules: string[]; feedback: string; mode: "edit" | "label" }) {
  const head = [
    "You are retouching an advertising photo for the cosmetics brand Irizée.",
    "Image 1 = the photo to correct. The following image(s) = the REAL product packshot(s).",
    "NON-NEGOTIABLE RULES:", numbered([...a.rules, ...(a.product.rules ?? [])]), "",
  ];
  const texts = a.product.texts?.length ? `Texts that must appear exactly:\n${textsBlock(a.product)}` : "";
  if (a.mode === "label") {
    return [...head,
      "TASK: keep the photo EXACTLY as it is (person, pose, background, lighting, product position, size and angle). Only fix the printed label of the product so that every word, logo and number matches the real packshot exactly, sharp and legible, with the same layout and colors.",
      texts].filter(Boolean).join("\n");
  }
  return [...head,
    `TASK: apply this correction requested by the client, and change nothing else: "${a.feedback}".`,
    "The product must remain identical to the packshot (shape, color, every printed text). Keep the composition and the person unless the correction says otherwise.",
    "Keep the natural photographic skin texture (visible pores, freckles, individual eyebrow hairs): never smooth or airbrush the skin.",
    texts].filter(Boolean).join("\n");
}

export function formatPrompt(a: { product: Product; rules: string[]; aspect: string }) {
  return [
    "You are adapting an approved advertising photo of the cosmetics brand Irizée to a new format.",
    "Image 1 = the approved photo. The following image(s) = the REAL product packshot(s).",
    "NON-NEGOTIABLE RULES:", numbered([...a.rules, ...(a.product.rules ?? [])]), "",
    `TASK: recreate this exact same photo (same person, same product, same styling, same lighting, same color palette, same mood) in aspect ratio ${a.aspect}.`,
    "Recompose and extend the scene naturally so that the whole product stays complete and fully visible, keeps the same relative scale to the person, and its label stays sharp and legible. Never crop the product. Do not add text or logos. Keep the natural photographic skin texture (visible pores, freckles, individual eyebrow hairs): never smooth or airbrush the skin.",
    a.product.texts?.length ? `Texts that must appear exactly on the product:\n${textsBlock(a.product)}` : "",
  ].filter(Boolean).join("\n");
}

export function modelSheetPrompt(a: { name: string; description: string }) {
  return [
    "Create a photorealistic studio portrait of a FICTIONAL person for a beauty brand casting sheet. This person must not resemble any real person or celebrity.",
    `Appearance to follow: ${a.description || "natural, modern beauty"}.`,
    "Head and shoulders, neutral confident expression, looking at the camera, soft even studio light, plain light-grey background, simple neutral clothing, no jewelry, no text, no watermark. Apply the makeup and styling only if the appearance description mentions it; otherwise bare natural skin.",
    REALISM,
  ].join("\n");
}

export function qcPrompt(p: Product) {
  return [
    "You are a strict quality inspector for a cosmetics brand.",
    "Image 1 = the REAL product packshot. Image 2 = a generated advertising photo that must show this exact product.",
    `Expected printed texts on the product: ${JSON.stringify(p.texts ?? [])}.`,
    p.look ? `Expected look: ${p.look}` : "",
    "For each expected text, read what is actually printed on the product in image 2 and answer 'ok' (exactly right), 'wrong' (misspelled, garbled, mirrored or different) or 'unreadable' (too small, blurred or hidden).",
    "Also judge: color/material/shape/cap versus the real packshot; any foreign brand logo; natural anatomy of hands/fingers/face; whether the skin looks like real photographed skin (visible pores, texture, natural brows) rather than airbrushed, plastic or AI-smooth skin; and composition (product height as % of the image height, product is a hero in the foreground, realistic scale versus hand/body, natural perspective).",
    'Return JSON only: {"texts":[{"expected":str,"status":"ok|wrong|unreadable","read":str}],"color_ok":bool,"shape_ok":bool,"foreign_logo":bool,"anatomy_ok":bool,"skin_natural":bool,"product_height_pct":int,"hero_foreground":bool,"proportion_ok":bool,"angle_ok":bool,"realism_0_10":int,"comment":str (one short sentence in French)}',
  ].filter(Boolean).join("\n");
}

export const EXTRACT_PROMPT =
  'This is a packshot of a cosmetics product. Return JSON only: {"name":str (product name as printed, short),"texts":[every distinct printed text on the product, exactly as printed, accents included. Join the lines that belong to the same sentence or title into ONE string. Include the volume line and the brand logo word],"look":str (one sentence in English describing shape, material, colors, cap),"realSize":str (estimated real-world size in English from the volume and shape, e.g. "about 9 cm tall, fits in the palm of one hand")}';

export const ANALYZE_PROMPT =
  "Describe this advertising photo in about 120 words, in English, as a brief for a photographer: camera angle and lens, composition, product placement and scale, lighting, color palette, props, background and graphic elements, styling and mood. Do NOT describe the identity of any person and do NOT mention any brand names or text printed in the image.";
