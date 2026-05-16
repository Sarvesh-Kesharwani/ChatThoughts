import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatThoughts",
  description: "Situational mantras + KG conflict resolver",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
