import type { Metadata, Viewport } from "next";
import "./globals.css";
import PWARegister from "@/components/PWARegister";

export const metadata: Metadata = {
  title: "Local-Ludo — Online Multiplayer",
  description:
    "Play Ludo online with 2–4 friends. Create a room, share the code, ready up and race your tokens home.",
  manifest: "/manifest.webmanifest",
  applicationName: "Local-Ludo",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Local-Ludo",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0820",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // draw under notches; safe-area insets handled in CSS
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
