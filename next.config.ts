import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/app",
        destination: "/agent",
        permanent: true,
      },
      {
        source: "/app/:path*",
        destination: "/agent/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
