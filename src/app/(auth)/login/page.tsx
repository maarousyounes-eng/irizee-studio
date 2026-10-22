"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { INPUT, LABEL } from "@/components/ui";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setInfo(null);
    try {
      const sb = createClient();
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message === "Invalid login credentials" ? "Email ou mot de passe incorrect" : error.message); return; }
        window.location.href = "/studio";
      } else {
        if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères"); return; }
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) { setError(error.message); return; }
        if (data.session) { window.location.href = "/studio"; return; }
        setInfo("Compte créé. Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.");
        setMode("login");
      }
    } catch (err) { setError(String(err)); } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F4F5] px-4 py-12">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden">
        <div className="px-8 pt-7 pb-6 border-b border-[#F0F0F1]">
          <Image src="/logo-black.png" alt="Irizée" width={96} height={30} className="object-contain" priority />
          <p className="text-[9px] tracking-[0.14em] uppercase font-medium text-[#A0A0A8] mt-1.5">Studio</p>
        </div>
        <div className="px-8 pt-6 pb-7">
          <h1 className="text-[15px] font-semibold text-[#0A0A0B] mb-5">{mode === "login" ? "Connexion" : "Créer un compte"}</h1>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className={LABEL}>Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="prenom@irizee.com" className={INPUT} />
            </div>
            <div>
              <label htmlFor="password" className={LABEL}>Mot de passe</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="••••••••" className={INPUT} />
            </div>
            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700 font-medium">{error}</div>}
            {info && <div className="p-3 rounded-xl bg-[#EBF2FF] border border-[#DCE9FF] text-sm text-[#2B6EE8] font-medium">{info}</div>}
            <button type="submit" disabled={loading} className="w-full mt-1 py-2.5 rounded-xl bg-[#2B6EE8] text-white font-semibold text-sm tracking-wide hover:bg-[#2560D4] disabled:opacity-60 transition-all">
              {loading ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
            </button>
          </form>
        </div>
        <div className="px-8 py-4 border-t border-[#F0F0F1] text-center">
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setInfo(null); }} className="text-[12px] text-[#2B6EE8] font-medium hover:underline underline-offset-2">
            {mode === "login" ? "Pas encore de compte ? Créer un compte" : "J'ai déjà un compte"}
          </button>
          {mode === "signup" && <p className="text-[11px] text-[#A0A0A8] mt-2">Un administrateur Irizée devra ensuite t'attribuer tes accès.</p>}
        </div>
      </div>
    </div>
  );
}
