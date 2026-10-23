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

const originalNote = "The image after Image 1 is the ORIGINAL version of this photo before earlier corrections: use it to restore any element the client says has disappeared or changed by mistake, copying it exactly as it was.";
const refNote = (n: number) =>
  `The next ${n} image(s) are REFERENCE image(s) supplied by the client to show what they want (a pose, a grip, an arrangement, a style, an element). Reproduce the IDEA they show (pose, arrangement, shape) in the requested change, but never copy any person, face, brand, logo or text from them: the person, the product and everything else stay as in Image 1.`;

export function correctionPrompt(a: { product: Product; rules: string[]; feedback: string; mode: "edit" | "label"; refCount?: number; hasOriginal?: boolean }) {
  const head = [
    "You are retouching an advertising photo for the cosmetics brand Irizée.",
    "Image 1 = the photo to correct." + (a.hasOriginal ? ` ${originalNote}` : "") + (a.refCount ? ` ${refNote(a.refCount)}` : "") + " The following image(s) = the REAL product packshot(s).",
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
    "ANATOMY: the person has exactly two arms and two hands. Never add an extra hand, arm, finger or limb, and never leave the old hand pose behind: modify the EXISTING hand and fingers only.",
    "THE REQUESTED CHANGE MUST BE CLEARLY VISIBLE in the result: never return an unchanged copy of Image 1. If the request is a pose change (a hand holding an object, a different gesture), actually redraw the hand and fingers in the new pose and move the object accordingly, while everything else stays as it is.",
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

export function qcPrompt(p: Product, correction?: { instruction: string }) {
  return [
    "You are a strict quality inspector for a cosmetics brand.",
    "Image 1 = the REAL product packshot. Image 2 = a generated advertising photo that must show this exact product." + (correction ? " Image 3 = the same photo BEFORE a correction was applied." : ""),
    correction ? `A correction was requested: "${correction.instruction}". Compare image 3 (before) and image 2 (after): set instruction_followed to true ONLY if the requested change is clearly and convincingly visible in image 2 (for example, if a hand must hold the product, the fingers must visibly wrap around it and it must not float). List in unwanted_changes every element that changed although it was NOT requested (face, outfit, background, product shape or text, framing...), or an empty string if none. Set ghost_or_duplicate to true if a leftover, ghost or duplicate of a moved or removed object is visible.` : "",
    `Expected printed texts on the product: ${JSON.stringify(p.texts ?? [])}.`,
    p.look ? `Expected look: ${p.look}` : "",
    "Judge the texts ONLY on the largest, most prominent product of image 2 (the hero product): ignore small, distant, blurred or partially hidden copies for the text check. For each expected text, read what is actually printed on that hero product and answer 'ok' (exactly right), 'wrong' (misspelled, garbled, mirrored or different) or 'unreadable' (too small, blurred or hidden).",
    "Also judge: color/material/shape/cap versus the real packshot; count how many product instances (bottles/tubes) are visible in total, and whether the other instances are faithful copies: set all_copies_exact to false ONLY if a copy has a clearly different silhouette, color, cap or logo layout than the real packshot; illegible or tiny text on small, blurred or background decorative copies is acceptable and must NOT cause a failure; whether the printed text direction on the product matches the packshot (not rotated or restyled); any foreign brand logo; natural anatomy of hands/fingers/face; whether the skin looks like real photographed skin (fine pores and texture still visible, brows with individual hair strokes, even with glamorous makeup and polished retouching) rather than plastic, blurred or AI-smooth skin; and composition (product height as % of the image height, product is a hero in the foreground, realistic scale versus hand/body, natural perspective).",
    `Return JSON only: {"texts":[{"expected":str,"status":"ok|wrong|unreadable","read":str}],"color_ok":bool,"shape_ok":bool,"foreign_logo":bool,"anatomy_ok":bool,"skin_natural":bool,"product_count":int,"all_copies_exact":bool,"label_orientation_ok":bool,"product_height_pct":int,"hero_foreground":bool,"proportion_ok":bool,"angle_ok":bool,"realism_0_10":int,"comment":str (one short sentence in French)${correction ? ",\"instruction_followed\":bool,\"unwanted_changes\":str,\"ghost_or_duplicate\":bool" : ""}}`,
  ].filter(Boolean).join("\n");
}

export const EXTRACT_PROMPT =
  'This is a packshot of a cosmetics product. Return JSON only: {"name":str (product name as printed, short),"texts":[every distinct printed text on the product, exactly as printed, accents included. Join the lines that belong to the same sentence or title into ONE string. Include the volume line and the brand logo word],"look":str (2 sentences in English: shape, material, colors, cap; and the layout of the printed text, including its direction relative to the product axis: horizontal, or vertical along the length, and the reading direction of the large logo),"realSize":str (estimated real-world size in English from the volume and shape, e.g. "about 9 cm tall, fits in the palm of one hand")}';

export const ANALYZE_PROMPT =
  "Describe this advertising photo in about 120 words, in English, as a brief for a photographer: camera angle and lens, composition, lighting, color palette, background and graphic elements, styling and mood. " +
  "Say how the product(s) are arranged (a single hero product or several copies, their relative scale, whether they float or are held), but refer to them only as \"the product\": do NOT describe the product's type, shape or packaging. " +
  "Do NOT describe the identity of any person and do NOT mention any brand names or text printed in the image.";

const RECIPES = [
  "RETOUCH RECIPES (apply the ones that fit the request, and write them into the instruction):",
  "- Holding the product: the hand pose MUST change (an open or spread hand must close and curl around the product): the fingers wrap naturally around the BODY of the product (thumb on one side, the other fingers on the opposite side, some fingertips visible in front), the product stays upright or slightly tilted, its label faces the camera and stays fully visible and unobstructed, at its real size compared with the hand; erase the product from its old position (no ghost, no duplicate) and add a soft contact shadow. Never turn it into a different object.",
  "- Hand anatomy: exactly five fingers, natural joints and proportions, consistent nails with the same polish.",
  "- Product too big / too small: resize it to its real-world size relative to the hand and body, keep the label legible.",
  "- Removing an element: erase it completely and rebuild what was behind it (skin, fabric, background) with the same lighting.",
  "- Changing a color: change only the named element, keep fabric folds, shadows and highlights.",
  "- Skin too smooth: restore visible fine pores and natural texture while keeping the glamorous makeup.",
].join("\n");

export function interpretPrompt(a: { feedback: string; hasZone: boolean; avoid?: string; refCount?: number; hasOriginal?: boolean }) {
  return [
    "You help a photo retoucher understand a client's correction request on an advertising photo of a cosmetics product. The client writes casually in French and is not a technician: infer what they obviously mean.",
    "Image 1 = the photo to correct." + (a.hasOriginal ? " The next image is the ORIGINAL version of this photo, before any earlier correction." : "") + (a.hasZone ? " The next image is a zoomed crop of the area the client circled." : ""),
    "STRICT FIDELITY TO THE REQUEST: the instruction must contain ONLY what the client asked for, interpreted generously but never extended. Do NOT add any other change: no new clothes, shoes or accessories, no spelling fixes, no retouching or improvement that the client did not mention. If the client says that something disappeared, changed, or is missing compared to the main/original photo, the task is to RESTORE ONLY that named element exactly as it was in the ORIGINAL image. Every other difference between the current photo and the original is an intentional earlier correction and MUST be kept as it is.",
    a.refCount ? `The LAST ${a.refCount} image(s) are REFERENCE image(s) the client supplied only to EXPLAIN what they want (a pose, a grip, an arrangement, a style, an element). IMPORTANT: the retoucher will NEVER see these references and nothing from them must be pasted or copied into the photo. Describe in the instruction, in precise words, everything to reproduce: where the hand and each finger are, how they wrap around the object, the angle, the orientation, the arrangement, the proportions. Never describe or reuse the person's identity, brand, logo, text or background of the reference.` : "",
    `Client request: "${a.feedback}"`,
    a.avoid ? `A previous attempt FAILED because: ${a.avoid}. Write the instruction so that this mistake does not happen again, with more explicit and concrete details.` : "",
    'Return JSON only: {"instruction": str, "understood": str, "scope": "local"|"global", "boxes": [[ymin, xmin, ymax, xmax], ...]}.',
    "instruction = a precise, concrete English instruction for the retoucher: what exactly to change, in which element (hand, product, outfit, background, light, skin...), the exact target result, and what must stay unchanged. Never ask to change the product's shape, label text or logo unless the client explicitly asks to fix them to match the packshot.",
    RECIPES,
    "understood = one short French sentence (max 20 words) restating what will be changed, in simple words, so the client can check it was understood.",
    "scope = \"local\" when the change concerns ONE identifiable element or region (a hand, a finger, a face part, glasses, jewelry, an outfit piece, an object, the product), \"global\" only when it must affect the whole image (overall lighting or color grade, the whole background, the whole composition).",
    "boxes = for a local scope, one bounding box for EVERY element involved in the change, in Image 1, with integer coordinates from 0 to 1000 relative to Image 1 (ymin, xmin, ymax, xmax). Include the ENTIRE product whenever it must move, be resized or be held differently (its current position will have to be erased), and the part of the body concerned (hand, arm, face part). Cover each element completely, never partially. Use [[0,0,1000,1000]] for a global scope.",
  ].filter(Boolean).join("\n");
}

/** Retouche locale : le modèle ne voit qu'un recadrage et ne doit rien changer d'autre. */
export function localEditPrompt(a: { product: Product; rules: string[]; instruction: string; mode: "edit" | "label"; refCount?: number; hasOriginal?: boolean }) {
  const texts = a.product.texts?.length ? `Texts that must appear exactly on the product:\n${textsBlock(a.product)}` : "";
  return [
    "You are retouching a CROPPED region of an advertising photo for the cosmetics brand Irizée.",
    "Image 1 = the crop to edit." + (a.hasOriginal ? " The next image is the same crop taken from the ORIGINAL version of the photo before earlier corrections: use it to restore any element that disappeared or changed by mistake." : "") + (a.refCount ? ` ${refNote(a.refCount)}` : "") + " The following image(s) = the REAL product packshot(s).",
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
