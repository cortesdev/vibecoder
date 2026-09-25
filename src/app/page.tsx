import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: {
    absolute: siteConfig.title.default,
  },
  alternates: { canonical: "/" },
  openGraph: { title: siteConfig.og.title, description: siteConfig.og.description },
  twitter: { title: siteConfig.twitter.title, description: siteConfig.twitter.description },
};

import HomeClientWrapper from "@/components/home-client-wrapper";

export default function Home() {
  return <HomeClientWrapper />;
}