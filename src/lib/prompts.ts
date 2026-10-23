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

/** Qualité peau & détails : rendu campagne beauté/mode glamour, mais peau réelle (pas de lissage « IA »). */
export const REALISM =
  "SKIN & DETAIL QUALITY: high-end beauty and fashion editorial photograph with professional retouching: polished, glamorous and luminous, BUT real skin: fine pores and natural skin texture stay visible, with dimensional highlights and soft shadows. " +
  "Never plastic, waxy, blurred or over-smoothed (no beauty-filter look, no AI-smooth skin). Natural freckles and peach fuzz where described. " +
  "Eyebrows groomed and sharply defined, built from individual hair strokes (visible hair direction, slightly feathered edges), never painted-on, flat or uniformly smooth. Lips with real texture and specular gloss. Crisp individual eyelashes and hair strands. " +
  "Keep every styling detail exactly as described: makeup, hairstyle, jewelry, nails, eyewear, outfit.";

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
  // Le nombre de produits suit l'inspiration (un produit héros, ou plusieurs copies), sauf consigne contraire du client.
  const copies =
    "PRODUCT ARRANGEMENT: reproduce the arrangement of the product(s) seen in the inspiration (a single hero product, or several repeated / floating copies at different scales), unless the client brief says otherwise. " +
    "EVERY copy of the product, even small, blurred or in the background, must be an exact replica of the real packshot: same proportions, same label layout, same text direction along the product, same cap and colors. Never invent a different product shape and never add look-alike products that are not the packshot.";
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
    copies,
    "PRODUCT FIDELITY: the product must be a pixel-faithful copy of the packshot: same silhouette and proportions, same cap, same finish and colors, same label layout, and the same direction of the printed text (if the text runs along the length of the product, it must keep running along the length, never rotated across it). Never redesign, restyle or reinterpret the product.",
    `Client brief: ${a.userPrompt}`,
    people,
    "",
    REALISM,
    `Output format: aspect ratio ${a.aspect}. Sharp, professional lighting, no watermark, no added text or captions.`,
  ].filter(Boolean).join("\n");
}

export function correctionPrompt(a: { product: Product; rules: string[]; feedback: string; mode: "edit" | "label"; zone?: { x: number; y: number; w: number; h: number } | null }) {
  const head = [
    "You are retouching an advertising photo for the cosmetics brand Irizée.",
    a.zone
      ? "Image 1 = the photo to correct. Image 2 = a zoomed crop of the AREA TO MODIFY. The following image(s) = the REAL product packshot(s)."
      : "Image 1 = the photo to correct. The following image(s) = the REAL product packshot(s).",
    "NON-NEGOTIABLE RULES:", numbered([...a.rules, ...(a.product.rules ?? [])]), "",
  ];
  const zoneTxt = a.zone
    ? `AREA: the client circled a rectangle located at ${Math.round(a.zone.x * 100)}% from the left and ${Math.round(a.zone.y * 100)}% from the top of the image, ${Math.round(a.zone.w * 100)}% wide and ${Math.round(a.zone.h * 100)}% tall (image 2 shows it zoomed). Apply the change ONLY inside this area and keep everything outside it pixel-identical.`
    : "";
  const texts = a.product.texts?.length ? `Texts that must appear exactly:\n${textsBlock(a.product)}` : "";
  if (a.mode === "label") {
    return [...head,
      "TASK: keep the photo EXACTLY as it is (person, pose, background, lighting, product position, size and angle). Only fix the printed label of the product so that every word, logo and number matches the real packshot exactly, sharp and legible, with the same layout and colors.",
      texts].filter(Boolean).join("\n");
  }
  return [...head,
    `TASK: apply this correction requested by the client, and change nothing else: "${a.feedback}".`,
    zoneTxt,
    "The product must remain identical to the packshot (shape, color, every printed text). Keep the SAME person (same face, hair, eyewear, jewelry, outfit), the SAME background, the SAME camera framing and the SAME lighting: change only what the correction asks for, and keep every other element exactly as it is. If an object moves or is re-held, completely erase it from its old position (no ghost or duplicate).",
    "Keep the visible fine skin texture and individual eyebrow hair strokes: never smooth the skin.",
    texts].filter(Boolean).join("\n");
}

export function formatPrompt(a: { product: Product; rules: string[]; aspect: string }) {
  return [
    "You are adapting an approved advertising photo of the cosmetics brand Irizée to a new format.",
    "Image 1 = the approved photo. The following image(s) = the REAL product packshot(s).",
    "NON-NEGOTIABLE RULES:", numbered([...a.rules, ...(a.product.rules ?? [])]), "",
    `TASK: recreate this exact same photo (same person, same product, same styling, same lighting, same color palette, same mood) in aspect ratio ${a.aspect}.`,
    "Recompose and extend the scene naturally so that the whole product stays complete and fully visible, keeps the same relative scale to the person, and its label stays sharp and legible. Never crop the product. Do not add text or logos. Keep the visible fine skin texture and individual eyebrow hair strokes: never smooth the skin.",
    a.product.texts?.length ? `Texts that must appear exactly on the product:\n${textsBlock(a.product)}` : "",
  ].filter(Boolean).join("\n");
}

export function modelSheetPrompt(a: { name: string; description: string }) {
  return [
    "Create a photorealistic high-end beauty editorial portrait of a FICTIONAL person for a brand casting sheet. This person must not resemble any real person or celebrity.",
    `Follow this appearance description EXACTLY, including makeup, hairstyle, eyewear, jewelry, nails and expression:\n${a.description || "natural, modern beauty"}`,
    "Head and shoulders (include the hands near the face if the description mentions nails or rings), soft studio light, plain light-grey background, no text, no watermark.",
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
    "Also judge: color/material/shape/cap versus the real packshot; count how many product instances (bottles/tubes) are visible in total, and whether EVERY instance (including small, blurred or background ones) is an exact replica of the real packshot, with the same proportions and label layout; whether the printed text direction on the product matches the packshot (not rotated or restyled); any foreign brand logo; natural anatomy of hands/fingers/face; whether the skin looks like real photographed skin (fine pores and texture still visible, brows with individual hair strokes, even with glamorous makeup and polished retouching) rather than plastic, blurred or AI-smooth skin; and composition (product height as % of the image height, product is a hero in the foreground, realistic scale versus hand/body, natural perspective).",
    'Return JSON only: {"texts":[{"expected":str,"status":"ok|wrong|unreadable","read":str}],"color_ok":bool,"shape_ok":bool,"foreign_logo":bool,"anatomy_ok":bool,"skin_natural":bool,"product_count":int,"all_copies_exact":bool,"label_orientation_ok":bool,"product_height_pct":int,"hero_foreground":bool,"proportion_ok":bool,"angle_ok":bool,"realism_0_10":int,"comment":str (one short sentence in French)}',
  ].filter(Boolean).join("\n");
}

export const EXTRACT_PROMPT =
  'This is a packshot of a cosmetics product. Return JSON only: {"name":str (product name as printed, short),"texts":[every distinct printed text on the product, exactly as printed, accents included. Join the lines that belong to the same sentence or title into ONE string. Include the volume line and the brand logo word],"look":str (2 sentences in English: shape, material, colors, cap; and the layout of the printed text, including its direction relative to the product axis: horizontal, or vertical along the length, and the reading direction of the large logo),"realSize":str (estimated real-world size in English from the volume and shape, e.g. "about 9 cm tall, fits in the palm of one hand")}';

export const ANALYZE_PROMPT =
  "Describe this advertising photo in about 120 words, in English, as a brief for a photographer: camera angle and lens, composition, lighting, color palette, background and graphic elements, styling and mood. " +
  "Say how the product(s) are arranged (a single hero product or several copies, their relative scale, whether they float or are held), but refer to them only as \"the product\": do NOT describe the product's type, shape or packaging. " +
  "Do NOT describe the identity of any person and do NOT mention any brand names or text printed in the image.";

export function interpretPrompt(a: { feedback: string; hasZone: boolean }) {
  return [
    "You help a photo retoucher understand a client's correction request on an advertising photo of a cosmetics product. The client writes casually in French.",
    "Image 1 = the photo." + (a.hasZone ? " Image 2 = a zoomed crop of the area the client circled." : ""),
    `Client request: "${a.feedback}"`,
    'Return JSON only: {"instruction": str, "understood": str, "scope": "local"|"global", "boxes": [[ymin, xmin, ymax, xmax], ...]}.',
    "instruction = a precise English instruction for the retoucher: what exactly to change, in which element (hand, product, outfit, background, light, skin...), the target result. Never ask to change the product's shape, label text or logo unless the client explicitly asks to fix them to match the packshot.",
    "understood = one short French sentence (max 20 words) restating what will be changed, in simple words, so the client can check it was understood.",
    "scope = \"local\" when the change concerns ONE identifiable element or region (a hand, a finger, a face part, glasses, jewelry, an outfit piece, an object, the product), \"global\" only when it must affect the whole image (overall lighting or color grade, the whole background, the whole composition).",
    "boxes = for a local scope, one bounding box for EVERY element involved in the change, in Image 1, with integer coordinates from 0 to 1000 relative to Image 1 (ymin, xmin, ymax, xmax). Include the ENTIRE product whenever it must move, be resized or be held differently (its current position will have to be erased), and the part of the body concerned (hand, arm, face part). Cover each element completely, never partially. Use [[0,0,1000,1000]] for a global scope.",
  ].join("\n");
}

/** Retouche locale : le modèle ne voit qu'un recadrage et ne doit rien changer d'autre. */
export function localEditPrompt(a: { product: Product; rules: string[]; instruction: string; mode: "edit" | "label" }) {
  const texts = a.product.texts?.length ? `Texts that must appear exactly on the product:\n${textsBlock(a.product)}` : "";
  return [
    "You are retouching a CROPPED region of an advertising photo for the cosmetics brand Irizée.",
    "Image 1 = the crop to edit. The following image(s) = the REAL product packshot(s).",
    "NON-NEGOTIABLE RULES:", numbered([...a.rules, ...(a.product.rules ?? [])]), "",
    a.mode === "label"
      ? "TASK: fix ONLY the printed label of the product visible in the crop so that every word, logo and number matches the real packshot exactly, sharp and legible, with the same layout, text direction and colors."
      : `TASK: ${a.instruction}`,
    "If the task moves, resizes or re-positions an object, you must COMPLETELY erase it from its previous position and rebuild the background and body parts that were behind it, so that no ghost, duplicate or leftover of the old object remains.",
    "HARD CONSTRAINTS: keep the exact same framing, camera angle, scale and position of every element, the same lighting, colors and background. Change ONLY what the task asks for. Everything that is not mentioned must stay pixel-identical to Image 1 (same person, same face, same outfit, same product, same text). Do not zoom, shift, crop or re-compose. Output the same crop with the same framing.",
    "Keep the visible fine skin texture and individual eyebrow hair strokes: never smooth the skin.",
    texts,
  ].filter(Boolean).join("\n");
}

/** Repérage du produit principal pour la réparation d'étiquette. */
export const LOCATE_PRODUCT_PROMPT =
  'Find the largest, most prominent cosmetic product (tube, bottle) in this advertising photo. Return JSON only: {"box": [ymin, xmin, ymax, xmax]} with integer coordinates from 0 to 1000 relative to the image, covering the whole product including its cap.';
