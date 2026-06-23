import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "invtt — Portal",
  description: "invtt portal. Live and running.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
