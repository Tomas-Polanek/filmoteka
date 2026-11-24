"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CZECH_MONTHS_STANDALONE, formatDayCzech } from "@/lib/models";

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function iso(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Day picker in the app's own style (the native date popup cannot be themed).
 * `value` and `max` are YYYY-MM-DD; days after `max` are disabled.
 */
export function DatePicker({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: string;
  max: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [vy, vm] = value.split("-").map(Number);
  const [view, setView] = useState({ y: vy, m0: vm - 1 });
  const [maxY, maxM] = max.split("-").map(Number);
  const atMaxMonth = view.y > maxY || (view.y === maxY && view.m0 >= maxM - 1);

  // Monday-first offset of the 1st, then the month's days.
  const firstWeekday = (new Date(view.y, view.m0, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m0 + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function shift(delta: number) {
    setView(({ y, m0 }) => {
      const d = new Date(y, m0 + delta, 1);
      return { y: d.getFullYear(), m0: d.getMonth() };
    });
  }

  return (
    <>
      <div className="ios-row space-between">
        <span>{label}</span>
        <button
          type="button"
          className={`date-picker-value ${open ? "open" : ""}`}
          aria-expanded={open}
          onClick={() => {
            setView({ y: vy, m0: vm - 1 });
            setOpen((o) => !o);
          }}
        >
          {formatDayCzech(value)}
        </button>
      </div>
      {open && (
        <div className="ios-row date-picker-panel">
          <div className="date-picker-head">
            <button type="button" className="icon-subtle-btn" onClick={() => shift(-1)} aria-label="Předchozí měsíc">
              <ChevronLeft size={20} />
            </button>
            <span className="date-picker-month">
              {CZECH_MONTHS_STANDALONE[view.m0]} {view.y}
            </span>
            <button
              type="button"
              className="icon-subtle-btn"
              onClick={() => shift(1)}
              disabled={atMaxMonth}
              aria-label="Další měsíc"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="date-picker-grid">
            {WEEKDAYS.map((w) => (
              <span key={w} className="date-picker-weekday">
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <span key={`e${i}`} />;
              const day = iso(view.y, view.m0, d);
              return (
                <button
                  key={day}
                  type="button"
                  className={`date-picker-day ${day === value ? "selected" : ""} ${day === max ? "today" : ""}`}
                  disabled={day > max}
                  onClick={() => {
                    onChange(day);
                    setOpen(false);
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
