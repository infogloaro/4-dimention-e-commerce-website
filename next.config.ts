import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.dummyjson.com",
        pathname: "/product-images/**",
      },
    ],
  },
  // `pg` is loaded by the Prisma driver adapter at runtime and must not be bundled
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses are JSON: lock them down further
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }, { key: "X-Robots-Tag", value: "noindex" }] },
    ];
  },
};

export default nextConfig;
