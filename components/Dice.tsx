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
}: {
  value: number | null;
  rolling: boolean;
}) {
  // While rolling, rapidly cycle random faces, then settle on the real value.
  const [face, setFace] = useState<number | null>(value);

  useEffect(() => {
    if (rolling) {
      const id = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 70);
      return () => clearInterval(id);
    }
    setFace(value);
  }, [rolling, value]);

  const pips = face ? FACES[face] : [];
  return (
    <div className={`dice ${rolling ? "rolling" : ""}`} aria-label={`Dice ${face ?? ""}`}>
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
