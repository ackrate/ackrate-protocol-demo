import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import SiteFooter from "@/components/SiteFooter";
import SiteAnalytics from "@/components/SiteAnalytics";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://reapp.live").replace(/\/$/, "");

const title = "REAPP — Agent payments on Stellar";
const description =
  "Build agent payments with wallet-approved mandates, contract-enforced limits, and Circle USDC settlement on Stellar Mainnet.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: title, template: "%s | REAPP" },
  description,
  applicationName: "REAPP",
  authors: [{ name: "ACKRATE Protocol", url: "https://github.com/ackrate" }],
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
      name: "REAPP",
      alternateName: ["ACKRATE Protocol", "reapp.live"],
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
      codeRepository: "https://github.com/ackrate/ackrate-protocol",
      downloadUrl: "https://www.npmjs.com/package/@ackrate/core/v/0.4.1",
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

// Keep pinch zoom available for low-vision readers.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Nav />
        {children}
        <SiteFooter />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
        <SiteAnalytics />
      </body>
    </html>
  );
}
