import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import Nav from "@/components/Nav";
import IntroGate from "@/components/IntroGate";
import SiteFooter from "@/components/SiteFooter";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://reapp.live").replace(/\/$/, "");

const title = "REAPP — Agentic Payments SDK & Live Testnet Demos";
const description =
  "Build and test agentic payments with bounded on-chain mandates, scoped authority, live Stellar testnet settlement, and the REAPP TypeScript SDK.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: title, template: "%s | REAPP" },
  description,
  applicationName: "REAPP",
  authors: [{ name: "REAPP Protocol", url: "https://github.com/reapp-protocol" }],
  creator: "REAPP Protocol",
  publisher: "REAPP Protocol",
  category: "Developer software",
  keywords: [
    "agentic payments",
    "AI agent payments",
    "payment mandates",
    "Stellar payments",
    "on-chain payment authorization",
    "REAPP SDK",
    "AP2",
  ],
  alternates: { canonical: "/" },
  icons: { icon: "/icon.svg", apple: "/apple-icon" },
  manifest: "/manifest.webmanifest",
  // og:image + twitter:image are generated from app/opengraph-image.tsx automatically.
  openGraph: { title, description, siteName: "REAPP", type: "website", url: "/" },
  twitter: { card: "summary_large_image", title, description },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: "REAPP Protocol",
      url: SITE,
      logo: {
        "@type": "ImageObject",
        url: `${SITE}/apple-icon`,
        width: 180,
        height: 180,
      },
      sameAs: ["https://github.com/reapp-protocol"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      name: "REAPP",
      alternateName: ["REAPP Protocol", "reapp.live"],
      url: SITE,
      description,
      inLanguage: "en",
      publisher: { "@id": `${SITE}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE}/#software`,
      name: "REAPP",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any system with Node.js",
      url: SITE,
      description,
      softwareVersion: "0.3.1",
      codeRepository: "https://github.com/reapp-protocol/reapp-protocol",
      downloadUrl: "https://www.npmjs.com/package/@reapp-sdk/core/v/0.3.1",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
      provider: { "@id": `${SITE}/#organization` },
      subjectOf: {
        "@type": "WebSite",
        name: "REAPP NETWORK — agentic payments research",
        url: "https://reapp.network/",
      },
    },
  ],
};

// Mobile: lock to device width, disable pinch/zoom so the layout can't be
// scrolled horizontally on phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0e0d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Nav />
        {children}
        <SiteFooter />
        <IntroGate />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-60M6BE1T8K"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-60M6BE1T8K');
          `}
        </Script>
      </body>
    </html>
  );
}
