import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/Sidebar";
import type { Role } from "@/types";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await sb.from("profiles").select("role, display_name, email").eq("id", user.id).single();
  const role = (profile?.role ?? "creator") as Role;
  let pending = 0;
  if (role !== "creator") {
    const { count } = await sb.from("images").select("id", { count: "exact", head: true }).eq("review_status", "pending").is("deleted_at", null);
    pending = count ?? 0;
  }
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#F4F4F5] p-3 gap-3">
      <Sidebar role={role} name={profile?.display_name || profile?.email || "Utilisateur"} pending={pending} />
      <main className="flex-1 bg-white rounded-2xl border border-[#E4E4E7] p-4 md:p-8 overflow-auto min-w-0">{children}</main>
    </div>
  );
}
