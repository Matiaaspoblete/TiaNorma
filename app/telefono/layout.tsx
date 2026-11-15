import type { Metadata } from "next";
import { Patrick_Hand, Roboto } from "next/font/google";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const mano = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-mano",
});

export const metadata: Metadata = {
  title: "Celular de Norma",
};

export default function TelefonoLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${roboto.className} ${mano.variable}`}>{children}</div>;
}
