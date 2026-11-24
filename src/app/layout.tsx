import type { Metadata } from "next";
import { Outfit, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-outfit" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-sans" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Aurelia Cast — Multi-Room Studio",
  description: "Roku-style web receiver, multi-room WebRTC sync studio, and Roku channel exporter.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${dmSans.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
