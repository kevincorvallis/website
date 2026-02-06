import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { LenisProvider } from "@/providers/LenisProvider";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://klee.page"),
  title: "Kevin Lee",
  description:
    "Kevin Lee — Software Engineer, Pilot, Photographer. Building at Microsoft AI.",
  authors: [{ name: "Kevin Lee" }],
  openGraph: {
    type: "website",
    url: "https://klee.page/",
    title: "Kevin Lee",
    description: "Software Engineer, Pilot, Photographer",
    images: ["/images/kevi394-053.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kevin Lee",
    description: "Software Engineer, Pilot, Photographer",
    images: ["/images/kevi394-053.jpg"],
  },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📷</text></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme */}
        <Script id="theme-init" strategy="beforeInteractive">{`
          (function() {
            var stored = localStorage.getItem('theme');
            var systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', stored || systemPreference);
          })();
        `}</Script>
        {/* Fonts */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <LenisProvider>
            <Navbar />
            <main>{children}</main>
            <Footer />
          </LenisProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
