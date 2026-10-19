import type { NextConfig } from "next";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  trailingSlash: true,
  // Serve API POST bodies directly instead of redirecting every client request.
  skipTrailingSlashRedirect: true,
  outputFileTracingExcludes: {
    "/*": [
      "./files/**/*",
      "./database/**/*",
      "./README.md",
      "./components.json",
      "./create-user.js",
      "./eslint.config.mjs",
      "./next.config.ts",
    ],
  },
  async headers() {
    if (allowedOrigins.length !== 1) return [];

    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: allowedOrigins[0] },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, PATCH, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
        ],
      },
    ];
  },
};

export default nextConfig;
