import * as React from "react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ invalid, style, ...rest }, ref) {
    return (
      <input
        {...rest}
        ref={ref}
        style={{
          width: "100%",
          background: "var(--surface)",
          border: `1px solid ${invalid ? "var(--danger)" : "var(--border-hard)"}`,
          color: "var(--text)",
          borderRadius: "var(--radius)",
          padding: "0.7rem 0.9rem",
          fontSize: "var(--font-base)",
          fontFamily: "inherit",
          fontWeight: 500,
          outline: "none",
          ...style,
        }}
      />
    );
  }
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ invalid, style, ...rest }, ref) {
    return (
      <textarea
        {...rest}
        ref={ref}
        style={{
          width: "100%",
          background: "var(--surface)",
          border: `1px solid ${invalid ? "var(--danger)" : "var(--border-hard)"}`,
          color: "var(--text)",
          borderRadius: "var(--radius)",
          padding: "0.7rem 0.9rem",
          fontSize: "var(--font-base)",
          fontFamily: "inherit",
          fontWeight: 500,
          outline: "none",
          resize: "vertical",
          ...style,
        }}
      />
    );
  }
);

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ invalid, style, children, ...rest }, ref) {
    return (
      <select
        {...rest}
        ref={ref}
        style={{
          width: "100%",
          background: "var(--surface)",
          border: `1px solid ${invalid ? "var(--danger)" : "var(--border-hard)"}`,
          color: "var(--text)",
          borderRadius: "var(--radius)",
          padding: "0.7rem 2.5rem 0.7rem 0.9rem",
          fontSize: "var(--font-base)",
          fontFamily: "inherit",
          fontWeight: 500,
          outline: "none",
          appearance: "none",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%239ca3af' stroke-width='2' fill='none' stroke-linecap='square'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.85rem center",
          ...style,
        }}
      >
        {children}
      </select>
    );
  }
);
