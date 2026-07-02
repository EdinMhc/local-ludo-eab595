"use client";

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
  const pips = value ? FACES[value] : [];
  return (
    <div className={`dice ${rolling ? "rolling" : ""}`}>
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
