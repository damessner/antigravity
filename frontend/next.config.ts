import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/:path*`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:4000"}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
