"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const INPUT = "w-full px-3.5 py-2.5 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] text-[#0A0A0B] text-sm placeholder-[#C0C0C8] focus:outline-none focus:border-[#2B6EE8] focus:bg-white transition";
export const LABEL = "block text-[10px] font-semibold text-[#A0A0A8] uppercase tracking-widest mb-1.5";

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={cn(LABEL, className)}>{children}</label>;
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "soft"; size?: "sm" | "md" };
export function Btn({ variant = "primary", size = "md", className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none active:scale-[0.99]",
        size === "md" ? "px-4 py-2.5 text-sm" : "px-3 py-1.5 text-xs",
        variant === "primary" && "bg-[#2B6EE8] text-white hover:bg-[#2560D4]",
        variant === "soft" && "bg-[#EBF2FF] text-[#2B6EE8] hover:bg-[#DCE9FF]",
        variant === "ghost" && "border border-[#E4E4E7] bg-white text-[#0A0A0B] hover:bg-[#F4F4F5]",
        variant === "danger" && "border border-[#E4E4E7] bg-white text-[#E8444A] hover:bg-red-50",
        className
      )}
    />
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("bg-white rounded-2xl border border-[#E4E4E7]", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-xl font-semibold text-[#0A0A0B] tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[#6B6B72] mt-0.5 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block w-4 h-4 border-2 border-[#E4E4E7] border-t-[#2B6EE8] rounded-full animate-spin", className)} />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="border border-dashed border-[#E4E4E7] rounded-2xl p-10 text-center text-sm text-[#6B6B72]">{children}</div>;
}

const TONES: Record<string, string> = {
  green: "bg-green-50 text-[#16A249] border-green-100",
  amber: "bg-amber-50 text-[#B45309] border-amber-100",
  red: "bg-red-50 text-[#E8444A] border-red-100",
  blue: "bg-[#EBF2FF] text-[#2B6EE8] border-[#DCE9FF]",
  gray: "bg-[#F4F4F5] text-[#6B6B72] border-[#E4E4E7]",
};
export function Badge({ tone = "gray", children, className }: { tone?: keyof typeof TONES; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border", TONES[tone], className)}>{children}</span>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={cn("relative bg-white rounded-2xl border border-[#E4E4E7] w-full max-h-[90vh] overflow-auto p-6", wide ? "max-w-3xl" : "max-w-md")}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#F4F4F5] text-[#6B6B72]" aria-label="Fermer"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Lightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-w-full max-h-full rounded-xl" />
    </div>
  );
}
