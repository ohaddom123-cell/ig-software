import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @remotion/bundler pulls in @remotion/studio (the Remotion Studio UI)
  // transitively, which references browser-only/optional packages
  // (@remotion/whisper-webgpu and similar) that aren't installed and
  // aren't needed for server-side rendering. Marking these as server
  // external packages tells Next to `require()` them at runtime instead
  // of statically bundling them, which is what actually works for
  // Node-native render tooling like this (same category of fix as
  // sharp/puppeteer in other Next.js projects).
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/studio",
    "@remotion/install-whisper-cpp",
    "ffmpeg-static",
  ],
};

export default nextConfig;
