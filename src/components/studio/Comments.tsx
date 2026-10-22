"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { useSupabase } from "@/lib/client";
import { INPUT, Btn } from "@/components/ui";

interface C { id: string; body: string; author_name: string | null; author_role: string | null; created_at: string }

export default function Comments({ imageId, me, onCount }: { imageId: string; me: { id: string; name: string; role: string }; onCount?: (n: number) => void }) {
  const sb = useSupabase();
  const [list, setList] = useState<C[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await sb.from("comments").select("id, body, author_name, author_role, created_at").eq("image_id", imageId).order("created_at");
    setList((data as C[]) ?? []);
    onCount?.(data?.length ?? 0);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [imageId]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    await sb.from("comments").insert({ image_id: imageId, user_id: me.id, body: text.trim(), author_name: me.name, author_role: me.role });
    setText(""); setBusy(false); load();
  }

  return (
    <div className="space-y-2">
      {list.length === 0 && <p className="text-[12px] text-[#A0A0A8]">Aucun commentaire.</p>}
      {list.map((c) => (
        <div key={c.id} className="text-[12px] bg-[#F4F4F5] rounded-xl px-3 py-2">
          <p className="font-semibold text-[#0A0A0B]">{c.author_name ?? "—"} <span className="font-normal text-[#A0A0A8]">· {new Date(c.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></p>
          <p className="text-[#3F3F46] whitespace-pre-wrap">{c.body}</p>
        </div>
      ))}
      <div className="flex gap-2">
        <input className={INPUT + " !py-2"} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ajouter un commentaire…" />
        <Btn size="sm" onClick={send} disabled={busy || !text.trim()} aria-label="Envoyer"><Send size={13} /></Btn>
      </div>
    </div>
  );
}
