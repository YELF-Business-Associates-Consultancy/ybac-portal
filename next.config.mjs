/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Import files are uploaded through a server action; allow up to 6 MB (the page itself rejects files over 5 MB).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  serverExternalPackages: ["exceljs"],
  // The Excel exports embed the logo, so ship it with the export function.
  outputFileTracingIncludes: { "/export/[report]": ["./public/logo-light.png"] },
};
export default nextConfig;
