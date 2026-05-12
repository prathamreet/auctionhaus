import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AuctionHaus — Real-Time Auction Platform",
  description:
    "Real-time auction platform with English, Dutch, and Sealed-bid auctions. Auto-bidding, live updates, and wallet management.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.className}>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: "var(--bg)",
          color: "var(--text)",
          WebkitFontSmoothing: "antialiased",
          textRendering: "optimizeLegibility",
        }}
      >
        <Providers>
          <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
