"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import Navbar from "@/components/Navbar";
import AuthProvider from "@/components/AuthProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
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
          {/* App-wide ErrorBoundary sits inside the navbar so a crashing
              page still leaves the nav clickable (back to home, switch
              theme). A render error past this point is captured and
              shown as a recovery card instead of a blank document. */}
          <ErrorBoundary>{children}</ErrorBoundary>
        </LiveTickerProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
