import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "32mb" },
    proxyClientMaxBodySize: "32mb",
    agentUpgrade: "security",
  },
}

export default nextConfig
