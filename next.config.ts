import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Proxy all /api/v1/* requests to the FastAPI backend on port 8000.
  // This makes the frontend work whether the page is loaded from the
  // Next.js dev server (port 3000) or the Caddy gateway (port 81).
  // The ?XTransformPort=8000 query param (used by Caddy) is harmless here
  // and is simply forwarded/ignored. Query strings are preserved by default.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:8000/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
