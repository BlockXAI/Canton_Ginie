import type { Metadata } from "next";
import { siteConfig as config } from "./config";

const metaConfig = {
  name: config.name,
  description: config.description,
  url: config.url,
  ogImage: "/og-image.png",
  creator: config.twitter,
  authors: [
    {
      name: "Ginie DAML",
      url: "https://ginie-daml.com",
    },
  ],
  keywords: [
    "DAML",
    "Canton",
    "smart contracts",
    "blockchain",
    "AI",
    "contract generation",
    "distributed ledger",
    "DLT",
    "automated contracts",
    "legal tech",
  ],
};

export const siteConfig = {
  ...metaConfig,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website" as const,
    locale: "en_US",
    url: metaConfig.url,
    title: metaConfig.name,
    description: metaConfig.description,
    siteName: metaConfig.name,
    images: [
      {
        url: metaConfig.ogImage,
        width: 1200,
        height: 630,
        alt: metaConfig.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image" as const,
    title: metaConfig.name,
    description: metaConfig.description,
    images: [metaConfig.ogImage],
    creator: metaConfig.creator,
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-icon.png",
  },
  manifest: "/site.webmanifest",
};

export function createMetadata({
  title,
  description,
  path = "/",
  image,
  noIndex = false,
}: {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
}): Metadata {
  const url = `${siteConfig.url}${path}`;
  const ogImage = image ?? siteConfig.ogImage;

  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: title ?? siteConfig.name,
      description: description ?? siteConfig.description,
      url,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title ?? siteConfig.name,
        },
      ],
    },
    twitter: {
      title: title ?? siteConfig.name,
      description: description ?? siteConfig.description,
      images: [ogImage],
    },
    ...(noIndex && {
      robots: {
        index: false,
        follow: false,
      },
    }),
  };
}
