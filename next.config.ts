import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Baileys uses runtime dynamic imports for optional native deps (jimp,
  // sharp) and pulls in heavy Node-only modules (pino, @hapi/boom, etc.).
  // Marking it external keeps it out of the Turbopack bundle so those
  // runtime-only imports are never statically resolved.
  serverExternalPackages: ['@whiskeysockets/baileys'],
};

export default nextConfig;
