import type { NextConfig } from "next";

const apiBase = process.env.GRIDFLOW_API_PROXY_TARGET ?? "http://localhost:3001/api/v1";

const nextConfig: NextConfig = {
  transpilePackages: ["@gridflow/domain"],
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${apiBase}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
