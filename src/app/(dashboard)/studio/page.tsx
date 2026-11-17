import { createClient } from "@/lib/supabase/server";
import NewShootForm from "@/components/studio/NewShootForm";
import CampaignWizard, { type Prefill } from "@/components/studio/CampaignWizard";
import { normalizeSlides } from "@/lib/visualTypes";
import { PageHeader } from "@/components/ui";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function StudioPage({ searchParams }: { searchParams: { concept?: string; from?: string; product?: string; again?: string; classic?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = await sb.from("profiles").select("role, monthly_quota").eq("id", user!.id).single();
  const since = new Date(); since.setUTCDate(1); since.setUTCHours(0, 0, 0, 0);

  const [products, models, concepts, projects, links, usage] = await Promise.all([
    sb.from("products").select("id, name").order("name"),
    sb.from("models").select("id, name, is_brand_model, path").eq("state", "ready").order("is_brand_model", { ascending: false }).order("name"),
    sb.from("concepts").select("id, name, prompt, aspect, inspiration_paths").order("created_at", { ascending: false }),
    sb.from("projects").select("id, name").order("name"),
    sb.from("project_products").select("project_id, product_id"),
    sb.from("usage_events").select("units").eq("user_id", user!.id).gte("created_at", since.toISOString()),
  ]);

  const projectProducts: Record<string, string[]> = {};
  (links.data ?? []).forEach((l: any) => { (projectProducts[l.project_id] ??= []).push(l.product_id); });
  const used = (usage.data ?? []).reduce((n: number, r: any) => n + r.units, 0);

  // « Décliner » depuis une image existante : elle devient l'inspiration du nouveau shooting
  let initial: { inspirationPaths: string[]; productId?: string; aspect?: string } = { inspirationPaths: [] };
  if (searchParams.from) {
    const { data: img } = await sb.from("images").select("path, aspect, shoots(product_id)").eq("id", searchParams.from).single();
    if (img?.path) initial = { inspirationPaths: [img.path], productId: (img as any).shoots?.product_id, aspect: img.aspect ?? undefined };
  }

  // « Recommencer » : mêmes réglages qu'un shooting existant (produit, mannequins, inspirations, consigne, format…)
  let again: { visualType?: string; typeParams?: Record<string, any>; modelMode?: string; noProduct?: boolean; productId: string; productIds?: string[]; productMode?: string | null; projectId: string | null; modelIds: string[]; noPeople: boolean; prompt: string; aspect: string; size: string; engine: string; variants: number; inspirationPaths: string[] } | undefined;
  if (searchParams.again) {
    const { data: sh } = await sb.from("shoots").select("id, project_id, product_id, product_ids, product_mode, model_ids, model_mode, no_people, no_product, visual_type, type_params, prompt, aspect, size, engine, inspiration_paths").eq("id", searchParams.again).single();
    if (sh) {
      const { count } = await sb.from("images").select("id", { count: "exact", head: true }).eq("shoot_id", sh.id).eq("kind", "generated");
      again = { visualType: sh.visual_type, typeParams: (sh.type_params as Record<string, any>) ?? {}, modelMode: sh.model_mode, noProduct: !!sh.no_product, productId: sh.product_id, productIds: (sh.product_ids as string[] | null) ?? undefined, productMode: sh.product_mode, projectId: sh.project_id, modelIds: sh.model_ids ?? [], noPeople: !!sh.no_people, prompt: sh.prompt, aspect: sh.aspect, size: sh.size, engine: sh.engine, variants: Math.min(12, Math.max(1, count ?? 6)), inspirationPaths: sh.inspiration_paths ?? [] };
    }
  }

  // Nouveau parcours guidé pour toute l'équipe, y compris depuis un concept de la bibliothèque ou « Recommencer ».
  // L'ancien formulaire ne sert plus qu'aux créateurs externes (projets, quota) et à « Décliner » une image.
  const classic = !!(searchParams.classic || searchParams.from) || profile?.role === "creator";
  let prefill: Prefill | undefined;
  if (!classic && searchParams.again) {
    const { data: sh } = await sb.from("shoots").select("id, created_at, product_id, product_ids, product_mode, model_ids, no_people, no_product, visual_type, type_params, prompt, aspect, inspiration_paths").eq("id", searchParams.again).single();
    if (sh) {
      const tp = (sh.type_params as Record<string, any>) ?? {};
      const { count } = await sb.from("images").select("id", { count: "exact", head: true }).eq("shoot_id", sh.id).eq("kind", "generated");
      const n = Number(tp.count) || count || 4;
      prefill = {
        source: `Réglages repris de votre campagne du ${new Date(sh.created_at).toLocaleDateString("fr-FR")}.`,
        brief: sh.prompt, vtype: sh.visual_type ?? "photo", productIds: (sh.product_ids as string[] | null) ?? [sh.product_id], productMode: sh.product_mode ?? undefined, noProduct: !!sh.no_product,
        modelIds: sh.no_people ? [] : sh.model_ids ?? [], aiFace: !sh.no_people && !(sh.model_ids ?? []).length, aspect: sh.aspect, count: n, pairs: Math.ceil(n / 2), textZone: tp.textZone, inspMode: tp.inspMode, inspirations: sh.inspiration_paths ?? [],
        directionText: typeof tp.direction === "string" ? tp.direction : undefined, sketchPath: typeof tp.sketch_path === "string" ? tp.sketch_path : undefined,
        carouselStyle: tp.carouselStyle, slides: sh.visual_type === "carousel" ? normalizeSlides(tp.slides) : undefined, baChange: tp.baChange, baBefore: tp.baBefore, baAfter: tp.baAfter,
      };
    }
  } else if (!classic && searchParams.concept) {
    const { data: c } = await sb.from("concepts").select("id, name, prompt, aspect, inspiration_paths").eq("id", searchParams.concept).single();
    if (c) {
      // Concept gardé depuis « Idées de campagne » : le brief + la direction complète (décor, couleurs, lumière, attitude)
      const text = String(c.prompt ?? "");
      const line = (k: string) => new RegExp(`^${k} : (.+)$`, "m").exec(text)?.[1]?.trim() ?? "";
      const [set, palette, light, attitude, serie] = ["Décor", "Couleurs", "Lumière", "Attitude", "Série"].map(line);
      const head = text.split(/\n(?=Décor : )/)[0].trim();
      const idea = /^Campagne « [^»]+ » : (.+)$/m.exec(head)?.[1]?.trim() ?? "";
      prefill = {
        source: `Concept « ${c.name} » repris de votre bibliothèque.`, conceptId: c.id, aspect: c.aspect, inspirations: c.inspiration_paths ?? [],
        ...(set && palette && light && idea
          ? { brief: head, vtype: /Canal : Carrousel/.test(head) ? "carousel" : /Canal : Pub/.test(head) ? "ad" : "social", direction: { title: c.name, concept: idea, set, palette, light, attitude: `${attitude}${serie ? ` Série prévue : ${serie}` : ""}` } }
          : { brief: text }),
      };
    }
  }
  if (searchParams.product) prefill = { ...(prefill ?? {}), productIds: prefill?.productIds ?? [searchParams.product] };
  if (!classic) {
    const [{ data: full }, { data: lib }] = await Promise.all([
      sb.from("products").select("id, name, real_size, applied_look, product_images(id)").order("name"),
      sb.from("inspiration_library").select("id, path, analysis, summary").order("created_at", { ascending: false }).limit(24),
    ]);
    const wProducts = (full ?? []).map((p: any) => ({
      id: p.id as string, name: p.name as string,
      missing: [!String(p.real_size ?? "").trim() ? "taille réelle" : "", !String(p.applied_look ?? "").trim() ? "couleur et texture du soin" : "", (p.product_images ?? []).length < 2 ? "une vraie photo en plus" : ""].filter(Boolean),
    }));
    return (
      <div>
        <PageHeader title="Nouvelle campagne" subtitle="Produits, brief, direction, image pilote : vous validez chaque étape avant de payer la suivante." />
        <CampaignWizard products={wProducts} models={(models.data ?? []).map((m: any) => ({ id: m.id, name: m.name, path: m.path }))} library={lib ?? []} prefill={prefill} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Nouveau shooting"
        subtitle="Choisis un produit, ajoute des images d'inspiration et décris ce que tu veux : chaque image est contrôlée automatiquement avant de t'être proposée."
      />
      <NewShootForm
        role={(profile?.role ?? "creator") as Role}
        products={products.data ?? []}
        models={models.data ?? []}
        concepts={concepts.data ?? []}
        projects={projects.data ?? []}
        projectProducts={projectProducts}
        quota={{ used, limit: profile?.role === "admin" ? null : profile?.monthly_quota ?? 0 }}
        initialConceptId={searchParams.concept}
        initialProductId={searchParams.product}
        initial={initial}
        again={again}
      />
    </div>
  );
}
