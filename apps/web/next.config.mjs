/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@japjong/shared', 'gov-sso-login'],
  async rewrites() {
    const apiOrigin =
      process.env.API_ORIGIN ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
