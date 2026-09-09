/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: { unoptimized: true },
  async redirects() {
    return [
      { source: "/stations", destination: "/data#stations", permanent: true },
      { source: "/analytics", destination: "/dashboard", permanent: true },
      { source: "/activity", destination: "/observations", permanent: true },
      { source: "/users", destination: "/admin/people", permanent: true },
      { source: "/settings/accounts", destination: "/admin/people", permanent: true },
      { source: "/share/jaguars/:code", destination: "/share/individuals/:code", permanent: true },
    ];
  },
};

module.exports = nextConfig;
