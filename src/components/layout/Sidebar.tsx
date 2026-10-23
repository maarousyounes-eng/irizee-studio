"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Sparkles, Images, CheckCircle2, BookMarked, Trash2, Package, UserRound, FolderKanban, Users, ListChecks, Coins, LogOut, Menu, X } from "lucide-react";
import type { Role } from "@/types";

type Item = { label: string; href: string; icon: React.ElementType; roles: Role[] };
const MAIN: Item[] = [
  { label: "Nouveau shooting", href: "/studio", icon: Sparkles, roles: ["admin", "employee", "creator"] },
  { label: "Shootings", href: "/shoots", icon: Images, roles: ["admin", "employee", "creator"] },
  { label: "À valider", href: "/review", icon: CheckCircle2, roles: ["admin", "employee"] },
  { label: "Bibliothèque", href: "/library", icon: BookMarked, roles: ["admin", "employee", "creator"] },
  { label: "Corbeille", href: "/trash", icon: Trash2, roles: ["admin", "employee", "creator"] },
];
const CATALOG: Item[] = [
  { label: "Produits", href: "/products", icon: Package, roles: ["admin", "employee"] },
  { label: "Mannequins", href: "/models", icon: UserRound, roles: ["admin", "employee"] },
];
const ADMIN: Item[] = [
  { label: "Projets", href: "/settings/projects", icon: FolderKanban, roles: ["admin"] },
  { label: "Équipe & quotas", href: "/settings/team", icon: Users, roles: ["admin"] },
  { label: "Règles de marque", href: "/settings/rules", icon: ListChecks, roles: ["admin"] },
  { label: "Coûts IA", href: "/settings/costs", icon: Coins, roles: ["admin"] },
];
const ROLE_LABEL: Record<Role, string> = { admin: "Administrateur", employee: "Équipe Irizée", creator: "Créateur / agence" };

export default function Sidebar({ role, name, pending, todayCost }: { role: Role; name: string; pending: number; todayCost?: number | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const section = (label: string | null, items: Item[]) => {
    const vis = items.filter((i) => i.roles.includes(role));
    if (!vis.length) return null;
    return (
      <div>
        {label && <p className="px-2.5 mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#C0C0C8]">{label}</p>}
        <div className="space-y-0.5">
          {vis.map(({ label: l, href, icon: Icon }) => {
            const active = pathname === href || (href !== "/studio" && pathname.startsWith(href));
            return (
              <Link key={href} href={href} onClick={() => setOpen(false)}
                className={cn("flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] font-medium transition-colors",
                  active ? "bg-[#EBF2FF] text-[#2B6EE8]" : "text-[#6B6B72] hover:bg-[#F4F4F5] hover:text-[#0A0A0B]")}>
                <Icon size={15} strokeWidth={1.75} className="flex-shrink-0" />
                <span className="flex-1">{l}</span>
                {href === "/settings/costs" && todayCost != null && (
                  <span className="text-[10px] font-semibold text-[#6B6B72] tabular-nums">{todayCost.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                )}
                {href === "/review" && pending > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#2B6EE8] text-white text-[10px] font-bold flex items-center justify-center">{pending}</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  const body = (
    <>
      <div className="px-4 py-4 border-b border-[#F0F0F1] flex items-center justify-between">
        <Link href="/studio" onClick={() => setOpen(false)} className="block" aria-label="Accueil">
          <Image src="/logo-black.png" alt="Irizée" width={80} height={26} className="object-contain" priority />
          <p className="text-[9px] tracking-[0.14em] uppercase font-medium text-[#A0A0A8] mt-1.5">Studio</p>
        </Link>
        <button onClick={() => setOpen(false)} className="md:hidden p-1.5 rounded-lg hover:bg-[#F4F4F5] text-[#6B6B72]" aria-label="Fermer le menu"><X size={18} strokeWidth={1.75} /></button>
      </div>
      <nav className="flex-1 px-2.5 py-3 space-y-3 overflow-y-auto">
        {section(null, MAIN)}
        {section("Catalogue", CATALOG)}
        {section("Administration", ADMIN)}
      </nav>
      <div className="px-3 py-3 border-t border-[#F0F0F1]">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-7 h-7 rounded-full bg-[#EBF2FF] flex items-center justify-center text-[#2B6EE8] text-[11px] font-semibold">{(name[0] ?? "?").toUpperCase()}</div>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[#0A0A0B] truncate">{name}</p>
            <p className="text-[10px] text-[#A0A0A8]">{ROLE_LABEL[role]}</p>
          </div>
        </div>
        <button onClick={signOut} className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[11px] text-[#A0A0A8] hover:text-[#E8444A] hover:bg-red-50 transition-colors">
          <LogOut size={12} strokeWidth={1.75} /> Déconnexion
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border border-[#E4E4E7] rounded-2xl">
        <Image src="/logo-black.png" alt="Irizée" width={72} height={24} className="object-contain" />
        <button onClick={() => setOpen(true)} className="p-2 rounded-lg hover:bg-[#F4F4F5] text-[#6B6B72]" aria-label="Ouvrir le menu"><Menu size={20} strokeWidth={1.75} /></button>
      </div>
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] h-full bg-white flex flex-col overflow-hidden">{body}</aside>
        </div>
      )}
      <aside className="hidden md:flex w-56 flex-shrink-0 bg-white border border-[#E4E4E7] rounded-2xl flex-col overflow-hidden self-start sticky top-3 min-h-[calc(100vh-24px)]">{body}</aside>
    </>
  );
}
