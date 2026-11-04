import type { AdEl, ElKind } from "./AdCanvas";

export function defaultEls(key: string): AdEl[] {
  return [
    { id: `${key}-t`, kind: "title", text: "Votre accroche ici", x: 8, y: 7, size: 40, font: "title", color: "#0A0A0B" },
    { id: `${key}-c`, kind: "cta", text: "Découvrir", x: 8, y: 84, size: 15, font: "body", color: "#0A0A0B" },
  ];
}

export function newEl(kind: ElKind, color: string): AdEl {
  const id = `${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const base: Record<ElKind, Omit<AdEl, "id" | "kind">> = {
    title: { text: "Nouveau titre", x: 10, y: 38, size: 36, font: "title", color },
    sub: { text: "Votre sous-titre", x: 10, y: 52, size: 17, font: "body", color },
    cta: { text: "Découvrir", x: 10, y: 80, size: 15, font: "body", color },
    badge: { text: "Votre offre", x: 72, y: 8, size: 16, font: "title", color: "#2B6EE8" },
    logo: { text: "irizée", x: 42, y: 90, size: 22, font: "body", color },
  };
  return { id, kind, ...base[kind] };
}
