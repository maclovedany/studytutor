import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 상위 디렉토리의 다른 lockfile 때문에 워크스페이스 루트를 오인하지 않도록 고정
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
