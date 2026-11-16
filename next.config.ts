import type { NextConfig } from "next";

const year = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/telefono/clip": ["./contenido/semillas/*.mp4"],
  },
  async headers() {
    return [
      { source: "/semillas/:path*", headers: year },
      { source: "/telefono/:path*", headers: year },
    ];
  },
};

export default nextConfig;
