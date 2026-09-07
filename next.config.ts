import type { NextConfig } from "next";
import { parseServerConfig } from "./src/config/schema";

// Fail at dev/build/start configuration loading, before serving requests.
parseServerConfig(process.env);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
