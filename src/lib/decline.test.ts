import { describe, it, expect } from "vitest";
import { applyVariant, buildPrompt, codeRange, currentTexts, parseContext, parseFocus, parseVariants } from "./decline";
import type { AdItem } from "@/components/ads3/AdCanvas";

const items: AdItem[] = [
  { key: "a", image_id: "i1", path: "generated/a.png", aspect: "4:5", label: "", els: [
    { id: "t", kind: "title", text: "Peau lumineuse", x: 0, y: 0, size: 40, font: "title", color: "#000" },
    { id: "c", kind: "cta", text: "Découvrir", x: 0, y: 80, size: 15, font: "body", color: "#000" },
    { id: "l", kind: "logo", text: "irizée", x: 40, y: 90, size: 22, font: "body", color: "#000" },
  ] },
  { key: "b", image_id: "i2", path: "generated/b.png", aspect: "4:5", label: "", els: [{ id: "t2", kind: "title", text: "Slide 2", x: 0, y: 0, size: 30, font: "title", color: "#000" }] },
];

describe("décliner", () => {
  it("lit l'orientation et ignore les valeurs inconnues", () => {
    expect(parseFocus("sub,cta,zzz,sub")).toEqual(["sub", "cta"]);
    expect(parseFocus("")).toEqual(["title"]);
  });
  it("lit les chiffres envoyés par Brand et rejette le reste", () => {
    const c = parseContext({ ctr: "0.015", roas: "abc", spend: "-3", reason: "x".repeat(400), focus: "title" });
    expect(c.ctr).toBe(0.015);
    expect(c.roas).toBeUndefined();
    expect(c.spend).toBeUndefined();
    expect(c.reason.length).toBe(300);
  });
  it("transforme un code IZ en bornes d'identifiant", () => {
    expect(codeRange("IZ-AB12CD")).toEqual(["ab12cd00-0000-0000-0000-000000000000", "ab12cdff-ffff-ffff-ffff-ffffffffffff"]);
    expect(codeRange("IZ-XYZ")).toBeNull();
  });
  it("prend les textes du premier visuel", () => {
    expect(currentTexts(items)).toEqual({ title: "Peau lumineuse", cta: "Découvrir" });
  });
  it("le prompt ne demande que les champs choisis et contient les chiffres", () => {
    const p = buildPrompt(parseContext({ ctr: "0.01", avgCtr: "0.02" }), { title: "A" }, 3, ["title"], "plus émotionnel");
    expect(p).toContain("CTR 1.0 %");
    expect(p).toContain("plus émotionnel");
    expect(p).toContain('"title": str');
    expect(p).not.toContain('"cta": str');
  });
  it("garde les variantes valides, au nombre demandé", () => {
    const v = parseVariants({ variants: [{ angle: "Rituel", title: "Votre rituel éclat" }, { angle: "vide" }, { title: "Encore" }, { title: "Trop" }] }, ["title"], 2);
    expect(v.map((x) => x.title)).toEqual(["Votre rituel éclat", "Encore"]);
    expect(parseVariants("n'importe quoi", ["title"], 3)).toEqual([]);
  });
  it("pose les nouveaux textes sur le premier visuel seulement, sans toucher l'original", () => {
    const out = applyVariant(items, { angle: "x", title: "Nouveau titre", cta: "Essayer" }, ["title"]);
    expect(out[0].els.find((e) => e.kind === "title")!.text).toBe("Nouveau titre");
    expect(out[0].els.find((e) => e.kind === "cta")!.text).toBe("Découvrir");
    expect(out[1].els[0].text).toBe("Slide 2");
    expect(items[0].els[0].text).toBe("Peau lumineuse");
  });
});
