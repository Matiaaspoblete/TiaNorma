import type { Metadata, Viewport } from "next";
import { Literata } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const literata = Literata({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  adjustFontFallback: true,
  preload: true,
});

export const metadata: Metadata = {
  title: "El taller de Norma",
  description: "Piezas de cerámica. Para encargar, llamala o mandale un mensaje.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={literata.className}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
