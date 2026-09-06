"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

export default function SiteAnalytics() {
  const path = usePathname();
  // Shared-report URLs are bearer links; do not send their GUIDs to analytics.
  if (path.startsWith("/reports/")) return null;
  return <>
    <Script src="https://www.googletagmanager.com/gtag/js?id=G-60M6BE1T8K" strategy="afterInteractive" />
    <Script id="google-analytics" strategy="afterInteractive">{`
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-60M6BE1T8K');
    `}</Script>
  </>;
}
