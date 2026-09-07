import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
