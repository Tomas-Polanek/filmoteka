"use client";

import React, { useState } from "react";
import { Film } from "lucide-react";
import { posterURL } from "@/lib/tmdb";

export function Poster({
  path,
  size = "w154",
  width = 46,
  className = "",
}: {
  path: string | null | undefined;
  size?: string;
  width?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = posterURL(path, size);
  const height = Math.round(width * 1.5);

  if (!url || failed) {
    return (
      <div
        className={`poster-placeholder ${className}`}
        style={{ width, height, minWidth: width }}
      >
        <Film size={Math.max(16, Math.round(width * 0.38))} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`poster-img ${className}`}
      style={{ width, height, minWidth: width }}
    />
  );
}
