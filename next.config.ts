import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/brock",
        destination: "/stories/brock",
        permanent: true,
      },
      {
        source: "/brock/index.html",
        destination: "/stories/brock",
        permanent: true,
      },
      {
        source: "/articles/advicefromKev.html",
        destination: "/articles/advice",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
