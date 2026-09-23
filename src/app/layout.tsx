import type { Metadata } from "next";
import "./globals.css";
import { siteConfig } from "@/lib/site";

// "Free" is the headline keyword: the site, the app, and the agent are free.
export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: siteConfig.title,
  description: siteConfig.description,
  keywords: siteConfig.keywords,
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name }],
  creator: siteConfig.name,
  openGraph: {
    type: "website",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.og.title,
    description: siteConfig.og.description,
    images: [
      {
        url: siteConfig.og.image,
        width: 1200,
        height: 630,
        alt: "Vibecoder — free, open source AI coding agent",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.twitter.title,
    description: siteConfig.twitter.description,
    images: [siteConfig.twitter.image],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "developer tools",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint (no flash). Dark is default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("vc-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
