/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  // @ackrate/core + @stellar/stellar-sdk are server-only (used in API routes).
  serverExternalPackages: ["@ackrate/core", "@ackrate/stellar", "@stellar/stellar-sdk"],
  async headers() {
    const walletHeaders = [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "base-uri 'none'",
          "frame-ancestors 'none'",
          "form-action 'self'",
          "object-src 'none'",
          "img-src 'self' data:",
          "font-src 'self' data:",
          "style-src 'self' 'unsafe-inline'",
          `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com`,
          "connect-src 'self' https://lobstr.co https://*.stellar.org https://*.sorobanrpc.com https://www.google-analytics.com",
          "upgrade-insecure-requests",
        ].join("; "),
      },
    ];
    return [
      { source: "/wallet/:path*", headers: walletHeaders },
      { source: "/api/wallet/:path*", headers: walletHeaders },
    ];
  },
};

export default nextConfig;
