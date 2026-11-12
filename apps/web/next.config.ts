import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The shared core ships raw TypeScript; compile it with the app.
  transpilePackages: ["@dear-diary/core"],
  // Keep ffmpeg packages out of the server bundle; they only run in the browser.
  serverExternalPackages: ["@ffmpeg/ffmpeg", "@ffmpeg/util", "@ffmpeg/core"],
};

export default nextConfig;
