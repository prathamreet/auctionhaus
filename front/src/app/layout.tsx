import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { Inter } from "next/font/google";
import { ThemeBootstrap } from "@/components/ui/ThemeToggle";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AuctionHaus — Real-Time Auction Platform",
  description:
    "Real-time English, Dutch, and Sealed-bid auctions with auto-bid, live wallet escrow, and fraud-aware admin tooling.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <head>
        <ThemeBootstrap />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: "var(--bg)",
          color: "var(--text)",
        }}
      >
        <Providers>
          <div
            style={{
              minHeight: "100vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
