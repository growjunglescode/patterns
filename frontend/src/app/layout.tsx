import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://app.wildpatterns.co";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Patterns — Individual Wildlife Intelligence",
  description: "Identity without collars. Starting with jaguars.",
  icons: {
    icon: "/brand/favicon.png",
    apple: "/brand/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Patterns",
    title: "Patterns — Individual Wildlife Intelligence",
    description: "Identity without collars. Starting with jaguars.",
    url: siteUrl,
    images: [
      {
        url: "/brand/og-image.png",
        width: 1024,
        height: 1024,
        alt: "Patterns",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Patterns — Individual Wildlife Intelligence",
    description: "Identity without collars. Starting with jaguars.",
    images: ["/brand/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070a09",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500&family=Outfit:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
