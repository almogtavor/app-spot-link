import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpotLink - Convert Music Links",
  description: "Convert songs between Spotify and Apple Music",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white antialiased">
        {children}
      </body>
    </html>
  );
}
