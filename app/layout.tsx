import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FaceGuard — Local screen privacy",
    template: "%s · FaceGuard",
  },
  description:
    "Local-only active-session privacy using webcam-based viewing-state detection.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
