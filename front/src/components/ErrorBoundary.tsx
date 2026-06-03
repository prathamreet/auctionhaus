"use client";

import React from "react";
import Link from "next/link";

/**
 * App-wide error boundary.
 *
 * Wraps the entire authenticated/public app so a render-time crash in any
 * page (a misbehaving socket payload, a null deref in a chart) does not
 * blank the screen. Logs the error to the console, then shows a recovery
 * card: "Reload" reruns the page, "Back to home" navigates to /, and the
 * stack is visible only in development.
 *
 * This is a class component because React's official Error Boundary API
 * (componentDidCatch + getDerivedStateFromError) has no hooks equivalent.
 */

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface to dev tools; production deploys would route this to a sink.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== "undefined") window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDev = process.env.NODE_ENV !== "production";

    return (
      <div
        style={{
          minHeight: "calc(100vh - var(--navbar-h))",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div
          style={{
            maxWidth: 540,
            width: "100%",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "2rem",
            boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: "var(--font-xs)",
              fontWeight: 700,
              color: "var(--danger)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "1rem",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: "var(--danger)",
              }}
            />
            Something went wrong
          </div>

          <h2
            style={{
              fontSize: "var(--font-xl)",
              fontWeight: 700,
              color: "var(--text)",
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              marginBottom: "0.5rem",
            }}
          >
            The page hit an unexpected error.
          </h2>

          <p
            style={{
              fontSize: "var(--font-sm)",
              color: "var(--text-soft)",
              lineHeight: 1.55,
              marginBottom: "1.5rem",
            }}
          >
            This is usually transient. Reload the page to try again, or head
            back to the catalogue. Your session and wallet are not affected.
          </p>

          {isDev && this.state.error && (
            <pre
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "0.75rem 1rem",
                fontSize: "var(--font-xs)",
                color: "var(--text-soft)",
                overflowX: "auto",
                marginBottom: "1.5rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {this.state.error.name}: {this.state.error.message}
              {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
            </pre>
          )}

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: "0.6rem 1.25rem",
                background: "var(--text)",
                color: "var(--bg)",
                border: "none",
                borderRadius: "var(--radius)",
                fontWeight: 700,
                fontSize: "var(--font-xs)",
                letterSpacing: "0.03em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Reload page
            </button>
            <Link href="/" onClick={this.handleReset} style={{ textDecoration: "none" }}>
              <button
                style={{
                  padding: "0.6rem 1.25rem",
                  background: "transparent",
                  color: "var(--text)",
                  border: "1px solid var(--border-hard)",
                  borderRadius: "var(--radius)",
                  fontWeight: 700,
                  fontSize: "var(--font-xs)",
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Back to home
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
