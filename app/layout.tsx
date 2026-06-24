import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hamsun Supply",
  description: "Inventory & supply-chain portal — stock is never typed, only movements are logged.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans text-stone-800 antialiased">{children}</body>
    </html>
  );
}
