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
          "img-src 'self' data: https://api.web3modal.org https://api.web3modal.com",
          "font-src 'self' data: https://fonts.reown.com",
          "frame-src https://verify.walletconnect.com https://verify.walletconnect.org",
          "style-src 'self' 'unsafe-inline'",
          `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com`,
          "connect-src 'self' https://lobstr.co https://*.stellar.org https://*.sorobanrpc.com https://www.google-analytics.com https://relay.walletconnect.com https://relay.walletconnect.org wss://relay.walletconnect.com wss://relay.walletconnect.org https://pulse.walletconnect.com https://pulse.walletconnect.org https://api.web3modal.org https://api.web3modal.com https://rpc.walletconnect.org https://rpc.walletconnect.com",
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
