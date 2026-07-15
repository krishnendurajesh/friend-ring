import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";

export const metadata: Metadata = {
  title: "Friend Ring | Premium Collaborative Gifting & Wishlists",
  description: "A collaborative shopping catalog where you create rings, share carts, split payments, and surprise friends with group gifts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Navigation />
        <main style={{ minHeight: 'calc(100vh - 72px)' }}>
          {children}
        </main>
      </body>
    </html>
  );
}

