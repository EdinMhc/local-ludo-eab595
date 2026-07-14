"use client";

import { useEffect, useState } from "react";

// Pip layout for each dice face on a 3x3 grid (positions 0-8).
const FACES: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export default function Dice({
  value,
  rolling,
  interactive = false,
  disabled = false,
  onRoll,
}: {
  value: number | null;
  rolling: boolean;
  // When interactive, the dice graphic itself is the roll target (replaces the
  // old "Roll Dice" button). `disabled` mirrors the old button's disabled state
  // (not your turn OR an animation is resolving).
  interactive?: boolean;
  disabled?: boolean;
  onRoll?: () => void;
}) {
  // While rolling, rapidly cycle random faces, then settle on the real value.
  const [face, setFace] = useState<number | null>(value);

  useEffect(() => {
    if (rolling) {
      const id = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 100);
      return () => clearInterval(id);
    }
    setFace(value);
  }, [rolling, value]);

  const pips = face ? FACES[face] : [];
  const clickable = interactive && !disabled;

  function handleRoll() {
    if (clickable) onRoll?.();
  }

  return (
    <div
      className={`dice ${rolling ? "rolling" : ""} ${
        interactive ? (clickable ? "clickable" : "clickable disabled") : ""
      }`}
      aria-label={`Dice ${face ?? ""}`}
      role={interactive ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-disabled={interactive ? disabled : undefined}
      onClick={interactive ? handleRoll : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (clickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                handleRoll();
              }
            }
          : undefined
      }
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className="pip"
          style={{ visibility: pips.includes(i) ? "visible" : "hidden" }}
        />
      ))}
    </div>
  );
}
