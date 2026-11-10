import type { Product } from "@/types";
import { SOCIAL_STYLES, TEXT_ZONES, BA_CHANGES, CAROUSEL_STYLES, SLIDE_ZONES, normalizeSlides, type TypeParams } from "./visualTypes";

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
  "PHOTOGRAPHIC QUALITY: this must be indistinguishable from a real photograph taken by an expert commercial beauty photographer on a real set, with a full-frame camera and a prime lens (35, 50, 85 or 100 mm macro as the shot requires), real light sources (window light, large softbox, bounce, a subtle rim light) and correct exposure. " +
  "Natural depth of field and focus fall-off, true-to-life colours with a subtle editorial colour grade, fine natural grain, physically correct shadows, contact shadows and reflections. " +
  "REAL SKIN: visible pores, fine texture, natural micro-imperfections, slight unevenness and peach fuzz, only the light retouch a professional retoucher would do; never plastic, waxy, airbrushed, overly glossy or doll-like; no beauty filter; natural asymmetry of a real face. " +
  "Eyebrows built from individual hairs, real eyelashes and flyaway hair strands, real fabric weave and folds. " +
  "THE PRODUCT IS PHYSICALLY IN THE SCENE: lit by the same light as everything around it, with matching reflections, correct perspective and contact shadows, held with real pressure by the fingers; it must never look pasted, floating, cut out or composited. " +
  "AVOID EVERY AI TELL: over-smoothed skin, oversaturated glow, HDR look, perfect symmetry, melted details, warped hands, objects merging, glossy CGI rendering. " +
  "Keep every styling detail exactly as described: makeup, hairstyle, jewelry, nails, eyewear, outfit.";

/** Style voulu par le client (inspiration avec interface de téléphone) : le contrôle ne doit pas le refuser. */
/** Interface de téléphone voulue : vraiment visible sur l'inspiration, ou demandée dans la consigne. */
export const wantsPhoneUi = (analysis: string, brief: string) =>
  /PHONE UI:\s*yes/i.test(analysis) || /interface (du |de |d'un )?t[ée]l[ée]phone|mode photo|appareil photo de l'iphone|écran de l'appareil photo|grille (de l'appareil|photo)/i.test(brief);
const OVERLAY_OK = "INTENDED STYLE: the client deliberately asked for a phone camera interface overlay (viewfinder grid, camera icons, phone frame). It is NOT a defect: never count it as added text, graphic element, artifact or issue, and do not lower any score for it.";
/** Le texte imprimé ne doit jamais sortir à l'envers (effet miroir des selfies). */
export const NO_MIRROR = "Every text printed on the product reads normally, left to right, NEVER mirrored or reversed, even in a selfie, a front-camera shot or a mirror reflection.";
/** Pendant une retouche, le produit ne change jamais. */
const PRODUCT_LOCK = "The product keeps exactly its packshot design and colours: the logo, the printed texts, the tube and the cap colours never change (a black logo stays black).";

const numbered = (rules: string[]) => rules.map((r, i) => `${i + 1}. ${r}`).join("\n");
const textsBlock = (p: Product) => (p.texts ?? []).map((t) => `- ${t}`).join("\n");

export function buildPrompt(a: {
  product: Product; rules: string[]; userPrompt: string; aspect: string; analysis: string;
  others?: { product: Product; n: number }[]; variation: string; nProductImages: number; hasModelRef: boolean; modelDescription?: string; noPeople: boolean; noProduct?: boolean;
  nModelRefs?: number; seriesRef?: boolean; typeLine?: string; realism?: string; hasStyleRef?: boolean; hasTexture?: boolean; shot?: string;
}) {
  const nModels = a.hasModelRef ? Math.max(1, a.nModelRefs ?? 1) : 0;
  // Version courte et cohérente : chaque consigne n'apparaît qu'une fois, sans ordres contradictoires.
  const oth = a.others ?? [];
  const products = [a.product, ...oth.map((o) => o.product)];
  const productBlock = (p: Product) => [
    `"${p.name}"${p.look ? `: ${p.look}` : ""}`,
    p.real_size ? `Real size: ${p.real_size.replace(/\n/g, ", ")}.` : "Real size: a standard hand-held cosmetic of this kind (a tube of about 15 cm): in a hand it is no longer than the hand itself, clearly smaller than the face.",
    p.applied_look ? `The formula itself (out of the tube or applied on skin): ${p.applied_look}. Always show this exact colour and texture.` : "",
    p.texts?.length ? `Printed texts, spelled exactly:\n${textsBlock(p)}` : "",
  ].filter(Boolean).join("\n");
  const roles = [
    a.noProduct ? "" : (a.nProductImages > 1 ? `Images 1 to ${a.nProductImages}: packshots` : "Image 1: packshot") + ` of the real product "${a.product.name}".`,
    ...oth.map((o) => `Next ${o.n} image(s): packshot of the real product "${o.product.name}".`),
    a.hasTexture ? "Next image: TEXTURE REFERENCE = how the formula of the product looks (colour, finish) out of the tube or on skin. Use it only for the formula, never as packaging." : "",
    nModels === 1 ? "Next image: the MODEL REFERENCE (the person to show)." : nModels > 1 ? `Next ${nModels} images: the MODEL REFERENCES (the ${nModels} persons to show, one image per person).` : "",
    a.seriesRef ? "Next image: the SERIES REFERENCE = the first image of the same series: match its art direction, colour grade and photographic quality (and its person, if a person appears in both), but NEVER copy its subject, set or composition: this image shows what is described for it below." : "",
    a.hasStyleRef === false ? "" : "Last image(s): the STYLE REFERENCE.",
  ].filter(Boolean).join(" ");
  const person = a.noPeople
    ? "There is no person in the image."
    : nModels > 1
      ? `PEOPLE: exactly the ${nModels} persons of the MODEL REFERENCES, each appearing once (same faces, skin tones, hair colours and hairstyles)${a.modelDescription ? `: ${a.modelDescription}` : ""}. Take only poses, gestures and expressions from the style reference, never the faces or hair of the people shown there.`
      : a.hasModelRef
      ? `PERSON: exactly the person of the MODEL REFERENCE (same face, skin tone, hair colour and hairstyle)${a.modelDescription ? `: ${a.modelDescription}` : ""}. Take only the pose, gesture and expression from the style reference, never the face or hair of the person shown there.`
      : `PERSON: ${a.variation}`;
  return [
    "You are an expert commercial beauty photographer shooting for the cosmetics brand Irizée. Create the photograph exactly as you would shoot it on a real professional set: real camera, real lens, real light, real model.",
    roles,
    "",
    "BRAND RULES:", numbered([...a.rules, ...products.flatMap((p) => p.rules ?? [])]),
    "",
    ...(a.noProduct
      ? ["NO PRODUCT: this image shows no product at all: no bottle, tube, jar, packaging, cosmetic container, brand name or logo, even if the style reference shows one."]
      : [
        products.length > 1
          ? `PRODUCTS: EXACTLY ONE of each of these ${products.length} products appears, ${products.length} product objects in total. Never show the same product twice, never add any other bottle, tube, jar or look-alike product, even if the style reference shows more products.`
          : "PRODUCT:",
        products.map(productBlock).join("\n\n"),
        "The product is an exact copy of its packshot: same silhouette, proportions, cap, material, colours, label layout and text direction. Products visible in the style reference belong to other brands: take their place and position, never their design.",
      ]),
    "",
    a.noProduct ? "STYLE: reproduce the style reference: composition, camera angle and lens, pose, lighting, colour palette, background and mood." : (products.length > 1 ? "STYLE: reproduce the style reference: composition, camera angle and lens, pose, lighting, colour palette, background and mood, and how the products are placed (held, standing, floating), but with exactly one of each product, at a realistic scale." : "STYLE: reproduce the style reference: composition, camera angle and lens, pose, lighting, colour palette, background, mood, and the way the product is placed (held, floating, number of copies), at a realistic scale for the product."),
    a.analysis ? `Description of the style reference:\n${a.analysis}` : "",
    wantsPhoneUi(a.analysis, a.userPrompt)
      ? "PHONE INTERFACE: the client wants the smartphone camera interface shown on the style reference (or described in the brief): reproduce exactly that interface, as described, and nothing more."
      : "The result is ONE single photograph: never add a phone interface, camera mode labels, shutter button, viewfinder grid, icons, frame or collage layout.",
    "",
    `CLIENT BRIEF (priority over the style reference when they differ): ${a.userPrompt}`,
    a.typeLine ? `\n${a.typeLine}` : "",
    a.shot ? `\nPHOTOGRAPHER'S SHOT SPEC for this image (lens, framing, light and pose; the client brief always wins if they differ): ${a.shot}` : "",
    "",
    person,
    a.noPeople ? "" : a.noProduct ? "Hands are anatomically correct: five fingers per hand, natural joints." : "Hands are anatomically correct: five fingers per hand, natural joints and a firm, plausible grip on the product.",
    "",
    a.realism ?? REALISM,
    `Format: aspect ratio ${a.aspect}. Do NOT add any text, letters, words, typography, logo or watermark to the image: the only text allowed is what is printed on the real products${wantsPhoneUi(a.analysis, a.userPrompt) ? " (and the labels of the wanted phone camera interface)" : ""}.`,
    a.noProduct ? "" : NO_MIRROR,
  ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n");
}

const originalNote = "The image after Image 1 is the ORIGINAL version of this photo before earlier corrections: use it to restore any element the client says has disappeared or changed by mistake, copying it exactly as it was.";
const refNote = (n: number) =>
  `The next ${n} image(s) are REFERENCE image(s) supplied by the client to show what they want (a pose, a grip, an arrangement, a style, an element). Reproduce the IDEA they show (pose, arrangement, shape) in the requested change, but never copy any person, face, brand, logo or text from them: the person, the product and everything else stay as in Image 1.`;

export const sizeLine = (p: Product) => p.real_size ? `REAL SIZE of the product: ${p.real_size.replace(/\n/g, ", ")}. Respect this real scale relative to the hands and body (a hand-held product of this size is only about as long as the model's hand).` : "";

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
    PRODUCT_LOCK, NO_MIRROR,
    "The product must remain identical to the packshot (shape, color, every printed text). Keep the SAME person (same face, hair, eyewear, jewelry, outfit), the SAME background, the SAME camera framing and the SAME lighting: change only what the correction asks for, and keep every other element exactly as it is. If an object moves or is re-held, completely erase it from its old position (no ghost or duplicate).",
    sizeLine(a.product),
    "Keep the visible fine skin texture and individual eyebrow hair strokes: never smooth the skin.",
    texts].filter(Boolean).join("\n");
}

export function formatPrompt(a: { product: Product; rules: string[]; aspect: string }) {
  return [
    "You are adapting an approved advertising photo of the cosmetics brand Irizée to a new format.",
    "Image 1 = the approved photo. The following image(s) = the REAL product packshot(s).",
    "NON-NEGOTIABLE RULES:", numbered([...a.rules, ...(a.product.rules ?? [])]), "",
    `TASK: recreate this exact same photo in aspect ratio ${a.aspect}, with exactly the same subjects, styling, lighting, color palette and mood as Image 1.`,
    "ADD NOTHING that is not visible in Image 1: if Image 1 has no person there must be NO person, no hand, no face and no body part in the result; never add props, objects, textures or products that are not already there. Only extend or trim the background and surroundings to fit the new shape.",
    "Recompose and extend the scene naturally so that the whole product stays complete and fully visible, keeps the same relative scale to the person, and its label stays sharp and legible. Never crop the product. Do not add text or logos. Keep the visible fine skin texture and individual eyebrow hair strokes: never smooth the skin.",
    "The result must be ONE single continuous photograph that fills the whole frame: NO collage, NO split panels, NO inset or picture-in-picture photos, NO duplicated person or product, NO borders or empty bands. To fit a different shape, extend the background and surroundings naturally around the same subject; the person and the product are never repeated or tiled.",
    PRODUCT_LOCK, NO_MIRROR,
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

/** Contrôle qualité d'une image SANS produit (peau, texture, ambiance…). */
export function qcPromptNoProduct(correction?: { instruction: string; refCount?: number }, opts?: { modelRef?: boolean; overlay?: boolean }) {
  return [
    opts?.overlay ? OVERLAY_OK : "",
    "You are a strict quality inspector for the advertising photos of a cosmetics brand.",
    "Image 1 = a generated advertising photo that must contain NO product: no bottle, tube, jar, packaging, brand name or logo." + (correction ? " Image 2 = the same photo BEFORE a correction was applied." + (correction.refCount ? ` The next ${correction.refCount} image(s) are REFERENCE image(s) supplied by the client.` : "") : ""),
    correction ? `A correction was requested: "${correction.instruction}". Set instruction_followed to true ONLY if the requested change is clearly visible in image 1 compared with image 2. List in unwanted_changes what changed without being requested (empty string if none). ghost_or_duplicate = true if a leftover or duplicate of a moved or removed element is visible. edit_quality_0_10 = how natural the modification is (8+ only if publishable as is); edit_defects = short French sentence (empty if none).` : "",
    opts?.modelRef ? "The LAST image is the MODEL REFERENCE: face_matches_model = true only if the person in image 1 is clearly the same person." : "",
    "foreign_logo = true if ANY product, packaging, brand name or logo is visible in image 1.",
    "TOLERANCE: judge like a professional photo editor: shallow depth of field, shadows, cropping and natural skin texture are normal. Only flag what a client would call an error.",
    "HUMAN CHECK (if a person is visible; otherwise human.present=false and every other human field true): exactly 5 fingers per visible hand with natural joints, symmetric natural face, eyes, lips and teeth, no extra or missing limb, plausible body, coherent hair, jewellery and clothing. artifacts_ok = false if you see melted textures, merged or floating objects or strange shapes.",
    "REALISM (be very demanding): realism_0_10 = would an expert photo editor believe this is a REAL photograph shot by a professional photographer? Give 8+ only if nothing betrays AI; give 5 or less for plastic, waxy or airbrushed skin, doll-like faces, an over-glossy CGI look, oversaturated glow, perfect symmetry, a product that looks pasted, floating or wrongly lit, missing contact shadows, or melted details. skin_natural = false if the skin has no visible pores and texture.",
    `Return JSON only: {"foreign_logo":bool,"added_text":bool,"anatomy_ok":bool,"skin_natural":bool,"human":{"present":bool,"hands_ok":bool,"fingers_count_ok":bool,"grip_ok":bool,"face_ok":bool,"limbs_ok":bool,"body_ok":bool,"accessories_ok":bool},"artifacts_ok":bool,"issues":[str] (short French sentences, max 5, empty if none)${opts?.modelRef ? ',"face_matches_model":bool' : ""},"realism_0_10":int,"comment":str (one short sentence in French)${correction ? ',"instruction_followed":bool,"unwanted_changes":str,"ghost_or_duplicate":bool,"edit_quality_0_10":int,"edit_defects":str' : ""}}`,
  ].filter(Boolean).join("\n");
}

export function qcPrompt(p: Product, correction?: { instruction: string; refCount?: number }, opts?: { modelRef?: boolean; others?: Product[]; overlay?: boolean }) {
  return [
    opts?.overlay ? OVERLAY_OK : "",
    "You are a strict quality inspector for a cosmetics brand.",
    "Image 1 = the REAL product packshot. Image 2 = a generated advertising photo that must show this exact product." + (correction ? " Image 3 = the same photo BEFORE a correction was applied." + (correction.refCount ? ` The last ${correction.refCount} image(s) are REFERENCE image(s) supplied by the client showing what they wanted.` : "") : ""),
    correction ? `A correction was requested: "${correction.instruction}". Compare image 3 (before) and image 2 (after): set instruction_followed to true ONLY if the requested change is clearly and convincingly visible in image 2 (for example, if a hand must hold the product, the fingers must visibly wrap around it and it must not float). List in unwanted_changes every element that changed although it was NOT requested (face, outfit, background, product shape or text, framing...), or an empty string if none. Set ghost_or_duplicate to true if a leftover, ghost or duplicate of a moved or removed object is visible. BE A DEMANDING ART DIRECTOR about the quality of the modified or added element: edit_quality_0_10 = how natural and well executed it is (correct proportions and scale, perspective, lighting, shadows, depth of field and sharpness consistent with the scene, clean edges, no distortion, no artifacts, realistic like a real photograph). Give 8 or more ONLY if you would publish it without any retouching; give 4 or less if it looks fake, pasted, deformed or badly drawn. List the visible defects of the modification in edit_defects (short French sentence, empty if none).${correction.refCount ? " Set matches_reference to false if the result clearly does not look like what the reference shows (same kind, style, shape, colors); otherwise true." : ""}` : "",
    opts?.others?.length ? `MULTI-PRODUCT PHOTO: ${1 + opts.others.length} different products must appear together. After the reference images (if any), ${opts.others.length} extra packshot image(s) follow, one per product, in this order: ${opts.others.map((o) => `"${o.name}"`).join(", ")}. Judge EACH product separately against its own packshot (texts, shape, color, cap) and include in "texts" the expected texts of ALL products, not only the first. In this multi-product photo judge every product that is clearly visible, not only one hero product. Expected texts of the other products: ${JSON.stringify(opts.others.map((o) => ({ name: o.name, texts: o.texts ?? [] })))}. Their appearance: ${opts.others.map((o) => `${o.name}: ${o.look ?? ""}`).join(" | ")}. set shape_ok and all_copies_exact to false if any product is missing, merged with another, swapped or redesigned. EXACTLY ONE of each product must be visible: product_count = the number of product objects you see; set all_copies_exact to false and add an issue if a product appears twice or more, or if an extra bottle, tube or product appears.` : "",
    opts?.modelRef ? "The LAST image is the MODEL REFERENCE sheet of the person who must appear in the photo: set face_matches_model to true only if the person in image 2 is clearly the same person (same face shape, eyes, nose, lips, skin tone, hair colour)." : "",
    "TOLERANCE: judge like a professional photo editor, not like a pixel scanner. Natural photographic situations are NORMAL and must NEVER be flagged as defects: partial occlusion of the product by a hand, fingers, hair or arm; the product cropped by the frame edge on purpose; shallow depth-of-field blur on background or distant items; specular highlights and reflections on glossy packaging; the label foreshortened or partly invisible because the product is curved or seen from the side; natural shadows; motion or lens effects; the product shown at an angle. Only flag what a real client would call an error: wrong or invented words that are clearly visible, a distorted or invented product shape, impossible anatomy, objects that merge or float unnaturally, a wrong or missing mannequin identity. When in doubt about something you cannot see clearly, do NOT flag it.",
    "HUMAN CHECK (if a person is visible; otherwise human.present=false and every other human field true). Inspect very carefully and count: each visible hand has exactly 5 fingers (4 fingers + thumb) with natural joints, lengths and nails, and no fused, missing, extra, twisted or bent-backwards finger (fingers_count_ok / hands_ok); the grip on the product is physically plausible: fingers wrap around it, the thumb is opposed, the product does not float and no hand passes through an object (grip_ok); face: both eyes the same size, aligned and looking coherently, symmetrical features, natural lips and teeth with no extra or merged teeth, normal ears and brows (face_ok); at most two arms and two hands, no extra or missing limb (limbs_ok); neck, shoulders and body proportions are plausible (body_ok); glasses, earrings, hair and clothing are coherent: no merging into skin or hair, no duplicated or asymmetrical accessory, no melted texture (accessories_ok). Also artifacts_ok = false if you see garbled or melted textures, objects that float or merge, a cropped or cut product, or strange shapes in the background.",
    `Expected printed texts on the product: ${JSON.stringify(p.texts ?? [])}.`,
    p.real_size ? `Real size of the product: ${p.real_size.replace(/\n/g, ", ")}. proportion_ok must be false if it looks oversized or tiny compared with the hand and body.` : "",
    p.look ? `Expected look: ${p.look}` : "",
    "Judge the texts ONLY on the largest, most prominent product of image 2 (the hero product): ignore small, distant, blurred or partially hidden copies for the text check. For each expected text, answer: 'ok' (visible and exactly right), 'wrong' (visible and legible but misspelled, garbled, mirrored or different), 'unreadable' (visible but too small or blurred to read), or 'hidden' (that part of the label is NOT visible in the photo, which is NORMAL and must never count against the image: covered by a hand, finger, hair or object, turned away from the camera, wrapped around the curve of the tube or bottle, cut by the edge of the frame, or lost in shadow or glare). Only a visible and legible text that is spelled differently counts as 'wrong'. Ignore differences of capitalization (upper/lower case), line breaks, spacing, hyphenation and apostrophe style when comparing with the expected text: only different, missing or invented letters or words count, and never report capitalization as an issue. Never mark 'wrong' a text you simply cannot see.",
    "added_text = true if the image contains text, letters, typography, a big logo or graphic shapes that are NOT printed on a real product label (slogans, giant brand letters, captions, watermarks). Also judge: color/material/shape/cap versus the real packshot (shape_ok must be false if the bottle, cap, neck, collar or pipette differ from the packshot, for example a different cap shape, a transparent neck where the packshot is opaque, or a redesigned bottle: then say so in issues); count how many product instances (bottles/tubes) are visible in total, and whether the other instances are faithful copies: set all_copies_exact to false ONLY if a copy has a clearly different silhouette, color, cap or logo layout than the real packshot; illegible or tiny text on small, blurred or background decorative copies is acceptable and must NOT cause a failure; whether the printed text direction on the product matches the packshot (not rotated or restyled); any foreign brand logo; natural anatomy of hands/fingers/face; whether the skin looks like real photographed skin (fine pores and texture still visible, brows with individual hair strokes, even with glamorous makeup and polished retouching) rather than plastic, blurred or AI-smooth skin; and composition (product height as % of the image height, product is a hero in the foreground, realistic scale versus hand/body, natural perspective).",
    "REALISM (be very demanding): realism_0_10 = would an expert photo editor believe this is a REAL photograph shot by a professional photographer? Give 8+ only if nothing betrays AI; give 5 or less for plastic, waxy or airbrushed skin, doll-like faces, an over-glossy CGI look, oversaturated glow, perfect symmetry, a product that looks pasted, floating or wrongly lit, missing contact shadows, or melted details. skin_natural = false if the skin has no visible pores and texture.",
    `Return JSON only: {"texts":[{"expected":str,"status":"ok|wrong|unreadable|hidden","read":str}],"color_ok":bool,"shape_ok":bool,"foreign_logo":bool,"anatomy_ok":bool,"skin_natural":bool,"product_count":int,"all_copies_exact":bool,"label_orientation_ok":bool,"product_height_pct":int,"hero_foreground":bool,"proportion_ok":bool,"angle_ok":bool,"human":{"present":bool,"hands_ok":bool,"fingers_count_ok":bool,"grip_ok":bool,"face_ok":bool,"limbs_ok":bool,"body_ok":bool,"accessories_ok":bool},"artifacts_ok":bool,"issues":[str] (every visible defect you found about the texts, proportions, anatomy, artifacts or product, as short French sentences, max 5, empty array if none)${opts?.modelRef ? ",\"face_matches_model\":bool" : ""},"realism_0_10":int,"comment":str (one short sentence in French)${correction ? ",\"instruction_followed\":bool,\"unwanted_changes\":str,\"ghost_or_duplicate\":bool,\"edit_quality_0_10\":int,\"edit_defects\":str" + (correction.refCount ? ",\"matches_reference\":bool" : "") : ""}}`,
  ].filter(Boolean).join("\n");
}

export const EXTRACT_PROMPT =
  'This is a packshot of a cosmetics product. Return JSON only: {"name":str (product name as printed, short),"texts":[every distinct printed text on the product, exactly as printed, accents included. Join the lines that belong to the same sentence or title into ONE string. Include the volume line and the brand logo word],"look":str (2 sentences in English: shape, material, colors, cap; and the layout of the printed text, including its direction relative to the product axis: horizontal, or vertical along the length, and the reading direction of the large logo),"realSize":str (estimated real-world size in English from the volume and shape, e.g. "about 9 cm tall, fits in the palm of one hand")}';

export const ANALYZE_PROMPT =
  "Describe this advertising photo in about 120 words, in English, as a brief for a photographer: camera angle and lens, composition, lighting, color palette, background, styling and mood. " +
  "PHONE INTERFACE: ONLY if a smartphone camera app interface is clearly drawn ON the image (camera mode labels such as PHOTO / VIDEO / PORTRAIT, a round shutter button, a thumbnail of the last photo, viewfinder grid lines), describe it precisely and END your answer with the exact line \"PHONE UI: yes\". Snow, particles, rain, light leaks, grain, filters, blur or a frame of the photo itself are part of the PHOTOGRAPH, not an interface: in that case, and in every other case, end with \"PHONE UI: no\". " +
  "Say how the product(s) are arranged (a single hero product or several copies, whether they float or are held) and how big the object appears relative to the person (for example \"about a third of the face height\", \"fits in the palm\", \"covers the chin\"), but refer to them only as \"the product\": do NOT describe the product's type, shape or packaging. " +
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

export function interpretPrompt(a: { realSize?: string; feedback: string; hasZone: boolean; avoid?: string; refCount?: number; hasOriginal?: boolean }) {
  return [
    "You help a photo retoucher understand a client's correction request on an advertising photo of a cosmetics product. The client writes casually in French and is not a technician: infer what they obviously mean.",
    "Image 1 = the photo to correct." + (a.hasOriginal ? " The next image is the ORIGINAL version of this photo, before any earlier correction." : "") + (a.hasZone ? " The next image is a zoomed crop of the area the client circled." : ""),
    "STRICT FIDELITY TO THE REQUEST: the instruction must contain ONLY what the client asked for, interpreted generously but never extended. Do NOT add any other change: no new clothes, shoes or accessories, no spelling fixes, no retouching or improvement that the client did not mention. If the client says that something disappeared, changed, or is missing compared to the main/original photo, the task is to RESTORE ONLY that named element exactly as it was in the ORIGINAL image. Every other difference between the current photo and the original is an intentional earlier correction and MUST be kept as it is.",
    a.refCount ? `The LAST ${a.refCount} image(s) are REFERENCE image(s) the client supplied only to EXPLAIN what they want (a pose, a grip, an arrangement, a style, an element). IMPORTANT: the retoucher will NEVER see these references and nothing from them must be pasted or copied into the photo. Describe in the instruction, in precise words, everything to reproduce: where the hand and each finger are, how they wrap around the object, the angle, the orientation, the arrangement, the proportions. Never describe or reuse the person's identity, brand, logo, text or background of the reference.` : "",
    a.realSize ? `REAL SIZE of the product: ${a.realSize.replace(/\n/g, ", ")}. If the request concerns the size or scale of the product, write the instruction with concrete proportions based on this real size (for example: the tube must be about as long as the model's hand, from wrist to fingertips, and clearly smaller than her face and shoulders).` : "",
    `Client request: "${a.feedback}"`,
    "READING COMPLAINTS: a complaint states the goal. \"On dirait pas un selfie\" means \"make it look MORE like a real selfie\"; \"ça fait faux\" means \"make it look more real\"; \"le tube est trop gros\" means \"make it smaller\". Never do the opposite of what the complaint implies.",
    a.avoid ? `A previous attempt FAILED because: ${a.avoid}. Write the instruction so that this mistake does not happen again, with more explicit and concrete details.` : "",
    'Return JSON only: {"instruction": str, "understood": str, "scope": "local"|"global", "intent": "edit"|"label", "use_original": bool, "redo": bool, "clarify": str, "boxes": [[ymin, xmin, ymax, xmax], ...]}.',
    "clarify = a short French question (max 30 words) ONLY when the request is too vague to know WHAT to change (e.g. \"tout est faux\", \"c'est nul\", \"refais\", \"pas bien\" with nothing specific); offer 3 or 4 concrete options seen in the photo (e.g. \"Qu'est-ce qui est faux : le tube (taille, forme), la main, la peau trop lisse, la lumière, le décor ?\"). Otherwise an empty string. Never guess a vague request.",
    "redo = true when the request changes the pose, the camera angle or viewpoint, the framing or composition, the setting or decor, or many big elements at once: a retouch cannot do that and the photo must be shot again with these changes. Otherwise false. When redo is true, the instruction describes the NEW photo to create (what to change and what to keep: same person, same product, same style).",
    "use_original = true ONLY when the client explicitly asks to bring back, undo or restore something that existed in the original version (for example \"remets la bague\", \"reviens à comme avant\", \"le mannequin d'origine\"). For any other request (change the background, the light, a pose, an object, a color...) use_original MUST be false: the retoucher must then work on Image 1 only and never copy back the original version.",
    "instruction = a precise, concrete English instruction for the retoucher: what exactly to change, in which element (hand, product, outfit, background, light, skin...), the exact target result, and what must stay unchanged. Never ask to change the product's shape, label text or logo unless the client explicitly asks to fix them to match the packshot.",
    RECIPES,
    "intent = \"label\" ONLY when the request is solely about fixing the printed text, spelling or logo on the product so that it matches the packshot (e.g. \"corrige les erreurs d'écriture\", \"le texte du produit est faux\"); otherwise \"edit\".",
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
      ? "TASK: fix ONLY the printed label of the product visible in the crop so that every word, logo and number matches the real packshot exactly, sharp and legible, with the same layout, text direction and colors." + (a.instruction ? ` ${a.instruction}` : "")
      : `TASK: ${a.instruction}`,
    "If the task moves, resizes or re-positions an object, you must COMPLETELY erase it from its previous position and rebuild the background and body parts that were behind it, so that no ghost, duplicate or leftover of the old object remains.",
    "HARD CONSTRAINTS: keep the exact same framing, camera angle, scale and position of every element, the same lighting, colors and background. Change ONLY what the task asks for. Everything that is not mentioned must stay pixel-identical to Image 1 (same person, same face, same outfit, same product, same text). Do not zoom, shift, crop or re-compose. Output the same crop with the same framing.",
    a.mode === "edit" ? sizeLine(a.product) : "",
    PRODUCT_LOCK, NO_MIRROR,
    "Keep the visible fine skin texture and individual eyebrow hair strokes: never smooth the skin.",
    texts,
  ].filter(Boolean).join("\n");
}

/** Repérage du produit principal pour la réparation d'étiquette. */
/** Lecture des textes imprimés sur le produit (contrôle bon marché de la réparation d'étiquette). */
export const READ_LABEL_PROMPT =
  'Read ALL the printed text visible on the cosmetic tube/product in this image, exactly letter by letter as printed, including small text. Do not correct spelling, do not guess: write what you actually see. Return JSON only: {"lines": [str, ...]}.';

export const LOCATE_PRODUCT_PROMPT =
  'Find the largest, most prominent cosmetic product (tube, bottle) in this advertising photo. Return JSON only: {"box": [ymin, xmin, ymax, xmax]} with integer coordinates from 0 to 1000 relative to the image, covering the whole product including its cap.';

/** Textes publicitaires : plusieurs angles, longueurs adaptées à Meta, TikTok et Google. */
export function adCopyPrompt(a: { product: Product; rules: string[]; idea: string; n: number; hasImage: boolean }) {
  return [
    "You are a senior performance copywriter for the French cosmetics brand Irizée. Write ad copy IN FRENCH for Meta (Instagram/Facebook), TikTok and Google.",
    a.hasImage ? "The attached image is the visual that will be used for the ad: write copy that matches it." : "",
    `Product: "${a.product.name}".`,
    a.product.texts?.length ? `Facts printed on the product (the ONLY product facts you may use): ${a.product.texts.join(" | ")}` : "",
    a.rules.length ? `Brand rules (mandatory):\n${a.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}` : "",
    `Client's idea for this ad: "${a.idea}"`,
    "COMPLIANCE (mandatory): no medical or therapeutic claims, no guaranteed results, no before/after promises, no body shaming. NEVER invent a price, a discount, a promo code, a number of customers, a rating, an ingredient, a percentage or a customer review: use them only if the client's idea gives them, word for word. If the idea contains a customer review, put it verbatim in quote (and the author if given), otherwise quote and quote_author are empty strings. badge is a very short sticker text (max 12 characters, e.g. \"-20 %\", \"Nouveau\") ONLY if the idea mentions a promo or a launch, otherwise an empty string.",
    `Write ${a.n} DIFFERENT angles (for example: benefit, emotion/self-care, routine, social proof only if given, offer only if given, curiosity).`,
    "Length limits (hard): hook ≤ 45 characters (big text on the image, punchy, no hashtags); headline ≤ 40; primary_text ≤ 300 with the key message in the first 125 characters, may include 1–2 emojis; bullets: exactly 3 short benefits ≤ 32 characters each, taken from the product facts; tiktok_caption ≤ 100 characters with 2–3 relevant hashtags; google.headlines: 5 different headlines ≤ 30 characters; google.long_headline ≤ 90; google.descriptions: 2 descriptions ≤ 90.",
    'cta is one of: "Découvrir", "Acheter", "Commander", "En savoir plus", "Essayer".',
    'Return JSON only: {"angles":[{"name":str (2-4 words in French describing the angle),"hook":str,"headline":str,"primary_text":str,"cta":str,"badge":str,"bullets":[str,str,str],"quote":str,"quote_author":str,"tiktok_caption":str,"google":{"headlines":[str,str,str,str,str],"long_headline":str,"descriptions":[str,str]}}]}',
  ].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------- Types de visuel


/** Consigne propre au type de visuel (ajoutée après la consigne du client). */
export function typeLine(type: string, tp: TypeParams, vi: number, nSlides: number) {
  if (type === "social") {
    const s = SOCIAL_STYLES.find((x) => x.id === tp.socialStyle) ?? SOCIAL_STYLES[0];
    return `VISUAL TYPE: an ORGANIC social media post (not an advertisement): ${s.en}.`;
  }
  if (type === "ad") {
    const z = TEXT_ZONES.find((x) => x.id === tp.textZone);
    return [
      "VISUAL TYPE: a PAID SOCIAL AD visual: the product is the clear hero, bold and simple scroll-stopping composition, premium and clean, strong contrast.",
      z?.en ? `Keep ${z.en} of the frame calm and uncluttered (simple background, no important element, no person's face) so that a headline can be added there later. Do not write anything there.` : "",
    ].filter(Boolean).join(" ");
  }
  if (type === "carousel") {
    const sl = normalizeSlides(tp.slides)[vi];
    const z = SLIDE_ZONES.find((x) => x.id === sl?.zone)?.en ?? "the top third";
    const hasText = !!sl && (sl.title || sl.body);
    return [
      `CAROUSEL: this image is slide ${vi + 1} of ${nSlides} of an Instagram carousel. All slides share the same art direction, colour world and photographic quality (and the same person when a person appears), but each slide has its own subject, framing and set, exactly as described for this slide.`,
      sl?.photo ? `This slide shows: ${sl.photo}` : "",
      hasText && sl!.layout === "band" ? `A solid colour band will cover ${z} of the frame later: keep the main subject and the whole product out of ${z}.` : "",
      hasText && sl!.layout !== "band" ? `A headline will be added later in ${z}: keep that area calm and simple (plain background, no face, no product, no important detail). Do not write anything there.` : "",
      "Show the product at a natural distance: never an extreme close-up of its label unless the slide asks for it.",
    ].filter(Boolean).join(" ");
  }
  if (type === "ba") {
    const c = BA_CHANGES.find((x) => x.id === tp.baChange) ?? BA_CHANGES[0];
    const before = (c.id === "autre" ? tp.baBefore : c.before) || "skin before the skincare routine";
    return `BEFORE PHOTO of a before/after pair: a natural, front-facing beauty portrait, neutral even lighting, simple background. The skin shows ${before}. Realistic and natural, no makeup, no retouching.`;
  }
  return "";
}

/** Pour l'avant d'un avant/après : peau réelle, non retouchée. */
export const REALISM_NATURAL =
  "SKIN & DETAIL QUALITY: realistic, unretouched skin with natural pores and texture, true-to-life colours, crisp detail. Never plastic, waxy or blurred. Keep every styling detail exactly as described.";

/** L'après : la même photo, seule la peau change. */
export function baAfterPrompt(a: { tp: TypeParams; rules: string[]; hasProduct: boolean; aspect: string }) {
  const c = BA_CHANGES.find((x) => x.id === a.tp.baChange) ?? BA_CHANGES[0];
  const after = (c.id === "autre" ? a.tp.baAfter : c.after) || "healthier, more radiant skin";
  return [
    "You are creating the AFTER photo of a before/after pair for the cosmetics brand Irizée.",
    "Image 1 = the BEFORE photo." + (a.hasProduct ? " The following image(s) = the REAL product packshot(s)." : ""),
    a.rules.length ? `BRAND RULES:\n${numbered(a.rules)}` : "",
    "TASK: recreate EXACTLY the same photo: same person (same face, features, hair, expression), same pose, same framing and camera angle, same background, same lighting, same clothes" + (a.hasProduct ? ", same product placement (the product stays identical to its packshot)" : "") + ".",
    `ONLY the skin changes: it now shows ${after}. The improvement is realistic and credible, never exaggerated: real pores and natural texture stay visible, no beauty filter, no added makeup.`,
    `Format: aspect ratio ${a.aspect}. Do NOT add any text, letters, arrows, labels or graphic elements.`,
  ].filter(Boolean).join("\n");
}

/** Plan d'un carrousel : pour chaque slide, la photo à créer, ses textes et sa mise en page. */
export function slidesPlanPrompt(a: { idea: string; n: number; style: string; products: string; rules: string[]; people: boolean }) {
  const st = CAROUSEL_STYLES.find((x) => x.id === a.style) ?? CAROUSEL_STYLES[0];
  return [
    "You are the creative director and copywriter of the French cosmetics brand Irizée, planning an Instagram carousel.",
    `Carousel idea from the client: "${a.idea || "showcase the product"}".`,
    `Carousel style: ${st.en}.`,
    a.products ? `PRODUCTS (describe them exactly as they are, never invent another packaging, shape, colour or accessory):\n${a.products}` : "No product appears in this carousel.",
    a.rules.length ? `Brand rules:\n${numbered(a.rules)}` : "",
    a.people ? "A model (always the same person) can appear in some photos." : "No person appears in the photos.",
    "CLIENT'S OWN PLAN (absolute priority): if the brief already contains a slide-by-slide plan (numbered points, slide texts, image descriptions, art direction), follow it EXACTLY: one slide per point, same order, same number of slides (up to 10, even if it differs from the default count below), the client's hooks and sentences word for word, every fact, price, date and offer the client gave (never drop or invent one), the client's image description for each slide, and the client's art direction (backgrounds, light, style, what to avoid). Only fill what the client left open.",
    "WHEN THE CLIENT GIVES NO PLAN: think like a top beauty creative director: bold, specific, editorial ideas, one striking concept per photo (macro textures, graphic still lifes, strong colour, hard light, the product treated like a jewel), never clichés (spa mood, decorative plants, generic smiling faces, flat white backgrounds).",
    `Default number of slides if the client gives no plan: ${a.n}. Slide 1 is the cover (strong, short promise), the last slide closes with a soft call to action. Each photo slide is a clearly different shot (framing, gesture, detail, texture, model) in the same set and style; avoid extreme close-ups of the product label.`,
    "For each slide give:",
    "- photo: French, max 30 words, the photo to shoot (setting, framing, what is visible). Empty string if layout is \"text\".",
    "- title: French headline, max 40 characters (" + (st.id === "mood" ? "can be empty" : "required") + ").",
    "- body: French short text, max 180 characters (can be empty, usually empty on the cover).",
    "- layout: \"overlay\" (text on the photo), \"band\" (photo with a solid colour band behind the text) or \"text\" (text-only slide on a plain brand colour, no photo; use it for dense explanations, at most a third of the slides, never the cover).",
    "- zone: where the text goes: \"top\", \"bottom\" or \"center\".",
    "COMPLIANCE (French cosmetics advertising law): no medical or therapeutic claim (never 'soigne', 'guérit', 'traite'), no guaranteed or quantified result, no before/after promise; never invent a number, percentage, study, price or customer review. Use cosmetic wording ('aide à', 'contribue à', 'peau d'apparence plus lumineuse').",
    'Return JSON only: {"slides": [{"photo": str, "title": str, "body": str, "layout": str, "zone": str}]}',
  ].filter(Boolean).join("\n");
}

/** Le « photographe » : un plan de prises de vue (une par image) avant toute génération. */
export function shotListPrompt(a: { brief: string; analysis: string; n: number; type: string; products: string; people: number; noProduct: boolean }) {
  return [
    "You are an award-winning commercial beauty photographer and art director preparing the SHOT LIST of a professional photo shoot for the French cosmetics brand Irizée.",
    `Client brief (in French): "${a.brief}"`,
    a.analysis ? `Mood / style reference described:\n${a.analysis}` : "",
    a.noProduct ? "No product appears in these photos." : `Product(s) to feature, exactly as they are:\n${a.products}`,
    a.people ? `Model(s): ${a.people} real person(s) (identity given separately), directed like a professional model.` : "No person in these photos.",
    a.type === "social" ? "Use: organic Instagram posts, natural and authentic." : a.type === "ad" ? "Use: paid social ads, the product is the hero." : "",
    "STRICT: never invent anything the brief does not ask for. Every shot is ONE single clean photograph: no diptych, no collage, no split frame, no phone interface, no grid, no icon, no text or graphic overlay. The product is held naturally and upright (label facing the camera), at its real small size (no longer than the model's hand). Only describe the formula on the skin if the brief mentions applying it.",
    `Write ${a.n} shots that together form a coherent, varied professional series (vary framing: wide / medium / close-up / detail; vary angles and gestures), all in the same set, light and colour mood.`,
    "For each shot write ONE dense English paragraph (60-90 words) a photographer would follow: framing and camera angle, lens and aperture (e.g. 85mm f/2.8), light setup (key light type and direction, fill, rim, natural window light...), set and props, exact pose and gesture direction for the model (where the hands are, how the product is held so the label faces the camera at a natural angle and realistic size), expression, styling, colour grade. Physically plausible, never an extreme close-up of the label unless the brief asks.",
    'Return JSON only: {"shots": [str]}',
  ].filter(Boolean).join("\n");
}

/** « Autre idée » : une nouvelle idée de photo pour une image précise, différente de la précédente. */
export function anotherIdeaPrompt(a: { brief: string; type: string; slide?: { title: string; body: string } | null; current: string; hint: string; products: string; people: boolean }) {
  return [
    "You are a top beauty creative director and photographer for the French cosmetics brand Irizée.",
    `The client's brief for this shoot (in French): "${a.brief}"`,
    a.slide && (a.slide.title || a.slide.body) ? `This photo illustrates the carousel slide: "${a.slide.title}" ${a.slide.body ? `— "${a.slide.body}"` : ""}. The new photo must still illustrate this slide.` : "",
    a.products ? `Product(s), exactly as they are (never invent another packaging):\n${a.products}` : "No product in this photo.",
    a.people ? "A model can appear." : "No person in this photo.",
    a.current ? `The client did NOT like this previous idea, propose something clearly different: "${a.current}"` : "The client did not like the previous photo: propose something clearly different.",
    a.hint ? `The client's wish for the new idea: "${a.hint}" (priority).` : "",
    "Follow the art direction of the brief (backgrounds, light, style, what to avoid). Be bold, specific and editorial; one strong concept; physically plausible; the product (if any) held naturally upright or placed, at its real small size, never an extreme close-up of its label.",
    'Return JSON only: {"idea": str (French, 25 to 45 words: subject, framing, set and background, light)}',
  ].filter(Boolean).join("\n");
}
