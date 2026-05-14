import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://backend:4000/api/:path*",
      },
      {
        source: "/socket.io/:path*",
        destination: "http://backend:4000/socket.io/:path*",
      },
    ];
  },
};

export default nextConfig;
