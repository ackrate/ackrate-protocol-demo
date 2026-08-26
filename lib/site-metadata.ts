import type { Metadata } from "next";

type PageMetadata = {
  title: string;
  description: string;
  path: `/${string}`;
  keywords?: string[];
};

export function createPageMetadata({ title, description, path, keywords = [] }: PageMetadata): Metadata {
  return {
    title,
    description,
    keywords: ["agentic payments", "ACKRATE", ...keywords],
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: "ACKRATE",
      title,
      description,
      url: path,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
