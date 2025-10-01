import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Permitimos que el build continúe aunque haya errores de lint; se controlará por CI/manual.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
