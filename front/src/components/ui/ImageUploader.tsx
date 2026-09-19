"use client";
import * as React from "react";
import { Button } from "./Button";

/**
 * Direct-to-Cloudinary unsigned upload. The browser POSTs the file straight to
 * Cloudinary's upload endpoint with an unsigned preset, then hands the returned
 * `secure_url` back via `onUploaded`. That URL is stored in the existing
 * Auction.imageUrl / User.avatar fields — so this needs no backend route and no
 * server dependency.
 *
 * Config (front/.env): NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME + the unsigned
 * NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET. When either is missing the control
 * degrades to a hint and the caller's URL field remains the way to set an image.
 */
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const MAX_BYTES = 5 * 1024 * 1024;

export function ImageUploader({
  onUploaded,
  label = "Upload image",
}: {
  onUploaded: (url: string) => void;
  label?: string;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const configured = !!CLOUD_NAME && !!UPLOAD_PRESET;

  const handleFile = async (file: File) => {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be under 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("upload_preset", UPLOAD_PRESET as string);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: "POST", body }
      );
      const data = (await res.json().catch(() => null)) as
        | { secure_url?: string }
        | null;
      if (!res.ok || !data?.secure_url) throw new Error("Upload failed");
      onUploaded(data.secure_url);
    } catch {
      setError("Upload failed. Try again, or paste a URL below.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (!configured) {
    return (
      <div style={{ fontSize: "var(--font-xs)", color: "var(--muted)" }}>
        File upload isn’t configured — paste an image URL below. (Set
        NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
        to enable uploads.)
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        flexWrap: "wrap",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
        style={{ display: "none" }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </Button>
      {error && (
        <span style={{ fontSize: "var(--font-xs)", color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
