import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Irizée Studio",
  description: "Création de shootings photo pour le site et les réseaux · Atelier Irizée",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
