import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // esbuild-wasm is loaded at runtime by the server-side preview validator.
  // Bundling it breaks its worker host ("The service is no longer running"),
  // so keep it a plain Node require/import instead.
  serverExternalPackages: ["esbuild-wasm"],
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
