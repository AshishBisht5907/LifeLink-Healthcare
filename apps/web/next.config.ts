import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Our own /api/proxy/[...path] catch-all needs to accept trailing
  // slashes (Django's URLs all end in one) without Next.js redirecting
  // them away before the handler runs.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
