import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    allowedDevOrigins: [
      "http://localhost:3000",
      "http://192.168.178.191:3000",
      "http://192.168.1.100:3000",
    ],
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
