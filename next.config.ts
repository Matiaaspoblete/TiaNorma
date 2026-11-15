import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/telefono/clip": ["./contenido/semillas/*.mp4"],
  },
};

export default nextConfig;
