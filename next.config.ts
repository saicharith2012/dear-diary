import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Keep ffmpeg packages out of the server bundle; they only run in the browser.
  serverExternalPackages: ["@ffmpeg/ffmpeg", "@ffmpeg/util", "@ffmpeg/core"],
};

export default nextConfig;
