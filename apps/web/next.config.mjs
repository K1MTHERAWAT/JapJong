/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@japjong/shared', 'gov-sso-login'],
  async rewrites() {
    const isDev = process.env.NODE_ENV === 'development';
    const apiOrigin =
      process.env.API_ORIGIN ||
      (isDev ? 'http://localhost:4000' : process.env.NEXT_PUBLIC_API_URL) ||
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
