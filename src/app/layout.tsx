import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/anton/400.css";
import "./globals.css";
import { Header } from "@/components/Header";
import { SITE, CHAIN } from "@/lib/config";

const description = "A launchpad on Robinhood Chain. Launch your project, get ranked daily, and the top 3 win buybacks. Call out a rival for a 1v1 if you want.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Throwdown · Launch your project. Fight if you want.",
  description,
  openGraph: { title: "Throwdown", description, siteName: "Throwdown" },
  twitter: { card: "summary_large_image", title: "Throwdown", description },
};

export const viewport: Viewport = { themeColor: "#0b0a0d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <Header />
        {children}
        <footer className="foot">
          <span>Throwdown · Launch your project. Fight if you want.</span>
          <span>{CHAIN.name}. Tokens are risky and can go to zero. Nothing here is financial advice.</span>
        </footer>
      </body>
    </html>
  );
}
