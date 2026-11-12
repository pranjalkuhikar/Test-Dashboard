/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: import.meta.dirname },
  // child processes, sqlite and the file system are used at runtime: keep them out of the bundle
  serverExternalPackages: ["@playwright/test", "playwright-core"],
};
export default nextConfig;
