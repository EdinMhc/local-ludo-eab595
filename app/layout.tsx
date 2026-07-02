import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ludo — Classic Board Game",
  description:
    "A classic 2–4 player hot-seat Ludo board game. Roll the dice, race your four tokens home, and capture your opponents!",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
