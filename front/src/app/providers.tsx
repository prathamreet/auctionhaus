"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import Navbar from "@/components/Navbar";
import AuthProvider from "@/components/AuthProvider";
import { LiveTickerProvider } from "@/components/ui/LiveTicker";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Phase F1: LiveTicker is global so any page can push toasts.
            Pages that don't push are unaffected (provider with no events
            renders nothing). */}
        <LiveTickerProvider>
          <Navbar />
          {children}
        </LiveTickerProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
