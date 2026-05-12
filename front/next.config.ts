import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev server access from local network IPs (LAN, VM adapters, etc.)
  allowedDevOrigins: ["192.168.56.1", "192.168.1.*", "10.*", "172.*"],
};

export default nextConfig;
