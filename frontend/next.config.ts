import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const api = process.env.API_URL || 'http://localhost:3001';
    return [{ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` }, { source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
