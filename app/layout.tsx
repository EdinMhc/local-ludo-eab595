import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local-Ludo — Online Multiplayer",
  description:
    "Play Ludo online with 2–4 friends. Create a room, share the code, ready up and race your tokens home.",
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
