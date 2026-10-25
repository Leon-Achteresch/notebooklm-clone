import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "32mb" },
    agentUpgrade: "security",
  },
}

export default nextConfig
