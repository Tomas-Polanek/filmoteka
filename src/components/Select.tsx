"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption<T extends string | number> = { value: T; label: string };

/**
 * Drop-down in the app's style (the native <select> popup cannot be themed).
 * The list renders in a portal with fixed position, so modals and scroll containers never clip it.
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  className = "ios-select",
  ariaLabel,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    const below = window.innerHeight - r.bottom - margin;
    const above = r.top - margin;
    const wanted = Math.min(options.length * 42 + 12, 340);
    const openUp = below < wanted && above > below;
    const maxHeight = Math.max(120, Math.min(wanted, openUp ? above : below));
    const width = Math.max(r.width, 180);
    const left = Math.min(Math.max(margin, r.right - width), window.innerWidth - width - margin);
    setPos({ top: openUp ? r.top - maxHeight - 4 : r.bottom + 4, left, minWidth: width, maxHeight });
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(".select-option.selected")?.scrollIntoView({ block: "nearest" });
    const close = (e: Event) => {
      const t = e.target as Node;
      if (listRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`select-trigger ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{current?.label ?? ""}</span>
        <ChevronDown size={15} className={`select-chevron ${open ? "open" : ""}`} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            className="select-popover"
            role="listbox"
            style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth, maxHeight: pos.maxHeight }}
          >
            {options.map((o) => (
              <button
                key={String(o.value)}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`select-option ${o.value === value ? "selected" : ""}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span>{o.label}</span>
                {o.value === value && <Check size={16} />}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
