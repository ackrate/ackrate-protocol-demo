import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import Nav from "@/components/Nav";
import IntroGate from "@/components/IntroGate";
import SiteFooter from "@/components/SiteFooter";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://staging.ackrate.com").replace(/\/$/, "");

const title = "Ackrate | Delegation and enforcement for autonomous agents";
const description =
  "Give an AI agent a specific, temporary permission for one job. Ackrate independently enforces the budget, place, resources, time, and delegation boundary.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: title, template: "%s | ACKRATE" },
  description,
  applicationName: "ACKRATE",
  authors: [{ name: "Ackrate Protocol", url: "https://github.com/ackrate" }],
  creator: "ACKRATE Protocol",
  publisher: "ACKRATE Protocol",
  category: "Developer software",
  keywords: [
    "agentic payments",
    "AI agent payments",
    "payment mandates",
    "Stellar payments",
    "on-chain payment authorization",
    "ACKRATE SDK",
    "AP2",
  ],
  alternates: { canonical: "/" },
  icons: { icon: "/icon.svg", apple: "/apple-icon" },
  manifest: "/manifest.webmanifest",
  // og:image + twitter:image are generated from app/opengraph-image.tsx automatically.
  openGraph: { title, description, siteName: "ACKRATE", type: "website", url: "/" },
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
      name: "ACKRATE Protocol",
      url: SITE,
      logo: {
        "@type": "ImageObject",
        url: `${SITE}/apple-icon`,
        width: 180,
        height: 180,
      },
      sameAs: ["https://github.com/ackrate"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      name: "ACKRATE",
      alternateName: ["ACKRATE Protocol", "Ackrate"],
      url: SITE,
      description,
      inLanguage: "en",
      publisher: { "@id": `${SITE}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE}/#software`,
      name: "ACKRATE",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any system with Node.js",
      url: SITE,
      description,
      softwareVersion: "0.3.1",
      codeRepository: "https://github.com/ackrate/ackrate-protocol",
      downloadUrl: "https://www.npmjs.com/package/@ackrate/core/v/0.3.1",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
      provider: { "@id": `${SITE}/#organization` },
      subjectOf: {
        "@type": "WebSite",
        name: "ACKRATE NETWORK — agentic payments research",
        url: "https://ackrate.network/",
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
