import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Supply Chain and Inventory",
  description: "Hamsun — supply chain & inventory portal. Stock is never typed, only movements are logged.",
  icons: { icon: "/hamsun-logo.svg", shortcut: "/hamsun-logo.svg", apple: "/hamsun-logo.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans text-stone-800 antialiased">{children}</body>
    </html>
  );
}
